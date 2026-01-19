import {
  getCalendarCacheEntry,
  saveCalendarCacheEntry,
  deleteCalendarCacheEntry,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../data/db.js";
import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  EIGHT,
  GOOGLE_CALENDAR_SKEDPAL_INSTANCE_ID_KEY,
  GOOGLE_CALENDAR_SKEDPAL_OCCURRENCE_ID_KEY,
  GOOGLE_CALENDAR_SKEDPAL_SOURCE,
  GOOGLE_CALENDAR_SKEDPAL_SOURCE_KEY,
  GOOGLE_CALENDAR_SKEDPAL_TASK_ID_KEY,
  GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
  GOOGLE_CALENDAR_SYNC_MIN_DAYS,
  RESCHEDULE_SYNC_MAX_DELAY_MS,
  RESCHEDULE_SYNC_MIN_DELAY_MS,
  SIXTEEN,
  THREE,
  TASK_STATUS_SCHEDULED,
  TWO,
  TWO_FIFTY_FIVE
} from "../constants.js";
import {
  GOOGLE_CALENDAR_EVENT_COLORS,
  GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS,
  TASK_BACKGROUND_NONE_COLOR_HEX,
  TASK_PRIORITY_COLOR_HEX
} from "../core/constants.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  updateCalendarEvent
} from "./google-calendar.js";

const SYNC_ALARM_NAME = "skedpal-calendar-sync-step";
let syncStepInFlight = false;
let fallbackTimeoutId = null;

function buildSyncRange(now, syncDays) {
  const start = new Date(now.getTime());
  start.setDate(start.getDate() - GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getTime());
  end.setDate(end.getDate() + syncDays);
  end.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return { start, end };
}

function normalizeSyncDays(value, maxDays) {
  const parsed = Number(value);
  const safeMax = Number.isFinite(maxDays) && maxDays > 0 ? maxDays : DEFAULT_SCHEDULING_HORIZON_DAYS;
  if (!Number.isFinite(parsed)) {return safeMax;}
  return Math.min(safeMax, Math.max(GOOGLE_CALENDAR_SYNC_MIN_DAYS, parsed));
}

export function getCalendarSyncTargets(settings = {}) {
  const map = settings?.googleCalendarTaskSettings;
  if (!map || typeof map !== "object") {return [];}
  const maxDays = Number(settings?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  return Object.entries(map)
    .filter(([calendarId, entry]) => calendarId && entry?.syncScheduledEvents)
    .map(([calendarId, entry]) => ({
      calendarId,
      syncDays: normalizeSyncDays(entry?.syncDays, maxDays)
    }));
}

function resolveExistingEventsByCalendar(source) {
  if (!source) {return new Map();}
  if (source instanceof Map) {return source;}
  return new Map(Object.entries(source));
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildTaskInstances(task) {
  const rawInstances = Array.isArray(task?.scheduledInstances) ? task.scheduledInstances : [];
  const normalized = rawInstances
    .map((instance) => ({
      start: toDate(instance?.start),
      end: toDate(instance?.end),
      occurrenceId: instance?.occurrenceId || "",
      timeMapId: instance?.timeMapId || ""
    }))
    .filter((instance) => instance.start && instance.end && instance.end > instance.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return normalized.map((instance, index) => ({ ...instance, index }));
}

function buildInstanceId(taskId, occurrenceId, index) {
  if (occurrenceId) {
    return `${taskId}:${occurrenceId}`;
  }
  return `${taskId}:index:${index}`;
}

function buildSkedpalExtendedProperties(item) {
  const privateProps = {
    [GOOGLE_CALENDAR_SKEDPAL_SOURCE_KEY]: GOOGLE_CALENDAR_SKEDPAL_SOURCE,
    [GOOGLE_CALENDAR_SKEDPAL_TASK_ID_KEY]: item.taskId,
    [GOOGLE_CALENDAR_SKEDPAL_INSTANCE_ID_KEY]: item.instanceId
  };
  if (item.occurrenceId) {
    privateProps[GOOGLE_CALENDAR_SKEDPAL_OCCURRENCE_ID_KEY] = item.occurrenceId;
  }
  return { private: privateProps };
}

function buildExistingEventIndex(events = []) {
  const map = new Map();
  (events || []).forEach((event) => {
    const instanceId =
      event?.extendedProperties?.private?.[GOOGLE_CALENDAR_SKEDPAL_INSTANCE_ID_KEY] || "";
    if (instanceId) {
      map.set(instanceId, event);
    }
  });
  return map;
}

function normalizeHexColor(value) {
  const hex = String(value || "").trim().toLowerCase();
  if (!/^#([0-9a-f]{6})$/.test(hex)) {return "";}
  return hex;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {return null;}
  const intValue = Number.parseInt(normalized.slice(1), SIXTEEN);
  return {
    r: (intValue >> SIXTEEN) & TWO_FIFTY_FIVE,
    g: (intValue >> EIGHT) & TWO_FIFTY_FIVE,
    b: intValue & TWO_FIFTY_FIVE
  };
}

function resolveGoogleColorId(colorHex) {
  const normalized = normalizeHexColor(colorHex);
  if (!normalized) {return "";}
  const target = hexToRgb(normalized);
  if (!target) {return "";}
  let closest = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  GOOGLE_CALENDAR_EVENT_COLORS.forEach((entry) => {
    const rgb = hexToRgb(entry.hex);
    if (!rgb) {return;}
    const distance =
      (target.r - rgb.r) ** TWO +
      (target.g - rgb.g) ** TWO +
      (target.b - rgb.b) ** TWO;
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = entry.id;
    }
  });
  return closest;
}

function resolveTaskBackgroundMode(settings) {
  const mode = settings?.taskBackgroundMode || "priority";
  if (mode === "priority" || mode === "timemap" || mode === "none") {
    return mode;
  }
  return "priority";
}

function resolvePriorityColorHex(priorityValue) {
  return TASK_PRIORITY_COLOR_HEX[priorityValue] || "";
}

function buildTimeMapColorById(timeMaps = []) {
  return new Map(
    (timeMaps || [])
      .filter((timeMap) => timeMap?.id)
      .map((timeMap) => [timeMap.id, timeMap.color || ""])
  );
}

function resolveTaskEventColorHex({
  task,
  instance,
  settings,
  timeMapColorById
}) {
  const backgroundMode = resolveTaskBackgroundMode(settings);
  if (backgroundMode === "priority") {
    const priorityValue = Number(task?.priority) || 0;
    return resolvePriorityColorHex(priorityValue);
  }
  if (backgroundMode === "none") {
    return TASK_BACKGROUND_NONE_COLOR_HEX;
  }
  const timeMapId = instance?.timeMapId || task?.scheduledTimeMapId || "";
  return timeMapColorById?.get?.(timeMapId) || "";
}

function isInstanceInRange(instance, range) {
  if (!instance?.start || !instance?.end || !range?.start || !range?.end) {return false;}
  return instance.end > range.start && instance.start < range.end;
}

function isExistingEventMatching(existing, startIso, endIso, colorId) {
  if (!existing?.start || !existing?.end) {return false;}
  if (!(existing.start instanceof Date) || !(existing.end instanceof Date)) {return false;}
  if (existing.start.toISOString() !== startIso) {return false;}
  if (existing.end.toISOString() !== endIso) {return false;}
  return (existing.colorId || "") === colorId;
}

function buildSyncItemPayload({
  existing,
  task,
  instance,
  calendarId,
  startIso,
  endIso,
  colorId,
  instanceId,
  skip
}) {
  return {
    action: existing?.id ? "update" : "create",
    calendarId,
    eventId: existing?.id || "",
    title: task.title || "Scheduled task",
    start: startIso,
    end: endIso,
    taskId: task.id,
    occurrenceId: instance.occurrenceId || "",
    instanceId,
    colorId,
    skip
  };
}

function buildSyncItemFromInstance({
  task,
  instance,
  calendarId,
  range,
  existingByInstance,
  settings,
  timeMapColorById
}) {
  if (!isInstanceInRange(instance, range)) {return null;}
  const instanceId = buildInstanceId(task.id, instance.occurrenceId, instance.index);
  const existing = existingByInstance.get(instanceId);
  const startIso = instance.start.toISOString();
  const endIso = instance.end.toISOString();
  const colorHex = resolveTaskEventColorHex({
    task,
    instance,
    settings,
    timeMapColorById
  });
  const colorId = resolveGoogleColorId(colorHex);
  const skip = isExistingEventMatching(existing, startIso, endIso, colorId);
  return {
    instanceId,
    item: buildSyncItemPayload({
      existing,
      task,
      instance,
      calendarId,
      startIso,
      endIso,
      colorId,
      instanceId,
      skip
    })
  };
}

function buildCalendarSyncItems({
  calendarId,
  tasks,
  range,
  existingEvents = [],
  settings = {},
  timeMapColorById = new Map()
}) {
  const existingByInstance = buildExistingEventIndex(existingEvents);
  const desiredInstanceIds = new Set();
  const items = [];
  (tasks || []).forEach((task) => {
    if (!task?.id || task.completed || task.scheduleStatus !== TASK_STATUS_SCHEDULED) {return;}
    const instances = buildTaskInstances(task);
    instances.forEach((instance) => {
      const entry = buildSyncItemFromInstance({
        task,
        instance,
        calendarId,
        range,
        existingByInstance,
        settings,
        timeMapColorById
      });
      if (!entry) {return;}
      desiredInstanceIds.add(entry.instanceId);
      items.push(entry.item);
    });
  });
  existingEvents.forEach((event) => {
    const instanceId =
      event?.extendedProperties?.private?.[GOOGLE_CALENDAR_SKEDPAL_INSTANCE_ID_KEY] || "";
    if (instanceId && desiredInstanceIds.has(instanceId)) {return;}
    items.push({
      action: "delete",
      calendarId,
      eventId: event?.id || "",
      title: event?.title || "Scheduled task",
      start: event?.start instanceof Date ? event.start.toISOString() : "",
      end: event?.end instanceof Date ? event.end.toISOString() : "",
      taskId: "",
      occurrenceId: "",
      instanceId: instanceId || ""
    });
  });
  return items;
}

export function buildCalendarSyncPlan({
  tasks = [],
  timeMaps = [],
  settings = {},
  now = new Date(),
  existingEventsByCalendar = new Map()
} = {}) {
  const targets = getCalendarSyncTargets(settings);
  const existing = resolveExistingEventsByCalendar(existingEventsByCalendar);
  const timeMapColorById = buildTimeMapColorById(timeMaps);
  const plan = [];
  targets.forEach((target) => {
    const range = buildSyncRange(now, target.syncDays);
    const existingEvents = existing.get(target.calendarId) || [];
    plan.push(
      ...buildCalendarSyncItems({
        calendarId: target.calendarId,
        tasks,
        range,
        existingEvents,
        settings,
        timeMapColorById
      })
    );
  });
  const actionOrder = { delete: 0, update: 1, create: 2 };
  return plan.sort(
    (a, b) => (actionOrder[a.action] ?? THREE) - (actionOrder[b.action] ?? THREE)
  );
}

async function loadCalendarSyncJob() {
  const entry = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
  return entry?.value || null;
}

async function saveCalendarSyncJob(job) {
  await saveCalendarCacheEntry({
    key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
    value: job,
    updatedAt: new Date().toISOString()
  });
}

async function clearCalendarSyncJob() {
  await deleteCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
}

function getRandomDelayMs() {
  const min = RESCHEDULE_SYNC_MIN_DELAY_MS;
  const max = RESCHEDULE_SYNC_MAX_DELAY_MS;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function scheduleNextSyncStep(delayMs) {
  const delay = Number.isFinite(delayMs) ? delayMs : getRandomDelayMs();
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
  if (globalThis.chrome?.alarms?.create) {
    chrome.alarms.create(SYNC_ALARM_NAME, { when: Date.now() + delay });
    return;
  }
  fallbackTimeoutId = setTimeout(runCalendarSyncStep, delay);
}

function clearScheduledSyncStep() {
  if (globalThis.chrome?.alarms?.clear) {
    chrome.alarms.clear(SYNC_ALARM_NAME);
  }
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
}

function buildSkedpalFilter() {
  return `${GOOGLE_CALENDAR_SKEDPAL_SOURCE_KEY}=${GOOGLE_CALENDAR_SKEDPAL_SOURCE}`;
}

async function finalizeCalendarSyncJob() {
  await clearCalendarSyncJob();
  clearScheduledSyncStep();
}

async function processCalendarSyncItem(item) {
  if (!item || item.skip) {return;}
  try {
    if (item.action === "delete") {
      if (item.eventId) {
        await deleteCalendarEvent(item.calendarId, item.eventId);
      }
      return;
    }
    if (item.eventId) {
      await updateCalendarEvent(item.calendarId, item.eventId, item.start, item.end, {
        colorId: item.colorId
      });
      return;
    }
    await createCalendarEvent(
      item.calendarId,
      item.title,
      item.start,
      item.end,
      {
        colorId: item.colorId,
        description: `source=${GOOGLE_CALENDAR_SKEDPAL_SOURCE}`,
        extendedProperties: buildSkedpalExtendedProperties(item)
      }
    );
  } catch (error) {
    console.warn("Failed to sync scheduled calendar event.", error);
  }
}

function getJobCursor(job) {
  return Number(job?.cursor) || 0;
}

async function runCalendarSyncStep() {
  if (syncStepInFlight) {return;}
  syncStepInFlight = true;
  try {
    const job = await loadCalendarSyncJob();
    if (!job || !Array.isArray(job.items)) {
      clearScheduledSyncStep();
      return;
    }
    const cursor = getJobCursor(job);
    if (cursor >= job.items.length) {
      await finalizeCalendarSyncJob();
      return;
    }
    await processCalendarSyncItem(job.items[cursor]);
    job.cursor = cursor + 1;
    await saveCalendarSyncJob(job);
    if (job.cursor >= job.items.length) {
      await finalizeCalendarSyncJob();
      return;
    }
    scheduleNextSyncStep(getRandomDelayMs());
  } finally {
    syncStepInFlight = false;
  }
}

function handleCalendarSyncAlarm(alarm) {
  if (alarm?.name !== SYNC_ALARM_NAME) {return;}
  void runCalendarSyncStep();
}

export function initCalendarSyncAlarms() {
  if (!globalThis.chrome?.alarms?.onAlarm) {return;}
  chrome.alarms.onAlarm.addListener(handleCalendarSyncAlarm);
}

export async function startCalendarSyncJob({
  tasks = [],
  timeMaps = [],
  settings = {},
  now = new Date()
} = {}) {
  const targets = getCalendarSyncTargets(settings);
  if (!targets.length) {
    await clearCalendarSyncJob();
    clearScheduledSyncStep();
    return { started: false, items: 0 };
  }
  const existingEventsByCalendar = new Map();
  for (const target of targets) {
    const range = buildSyncRange(now, target.syncDays);
    try {
      const events = await fetchCalendarEvents({
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        calendarIds: [target.calendarId],
        privateExtendedProperty: buildSkedpalFilter()
      });
      existingEventsByCalendar.set(target.calendarId, events);
    } catch (error) {
      console.warn("Failed to load scheduled calendar events.", error);
      existingEventsByCalendar.set(target.calendarId, []);
    }
  }
  const items = buildCalendarSyncPlan({
    tasks,
    timeMaps,
    settings,
    now,
    existingEventsByCalendar
  });
  const job = {
    id: `${Date.now()}`,
    createdAt: now.toISOString(),
    cursor: 0,
    items
  };
  await saveCalendarSyncJob(job);
  scheduleNextSyncStep(RESCHEDULE_SYNC_MIN_DELAY_MS);
  return { started: true, items: items.length };
}

export async function resumeCalendarSyncJob() {
  const job = await loadCalendarSyncJob();
  if (!job || !Array.isArray(job.items) || job.cursor >= job.items.length) {
    return false;
  }
  scheduleNextSyncStep(RESCHEDULE_SYNC_MIN_DELAY_MS);
  return true;
}
