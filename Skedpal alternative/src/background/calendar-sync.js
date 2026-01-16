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
  GOOGLE_CALENDAR_SKEDPAL_INSTANCE_ID_KEY,
  GOOGLE_CALENDAR_SKEDPAL_OCCURRENCE_ID_KEY,
  GOOGLE_CALENDAR_SKEDPAL_SOURCE,
  GOOGLE_CALENDAR_SKEDPAL_SOURCE_KEY,
  GOOGLE_CALENDAR_SKEDPAL_TASK_ID_KEY,
  GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
  GOOGLE_CALENDAR_SYNC_MIN_DAYS,
  RESCHEDULE_SYNC_MAX_DELAY_MS,
  RESCHEDULE_SYNC_MIN_DELAY_MS,
  THREE,
  TASK_STATUS_SCHEDULED
} from "../constants.js";
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
      occurrenceId: instance?.occurrenceId || ""
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

function isInstanceInRange(instance, range) {
  if (!instance?.start || !instance?.end || !range?.start || !range?.end) {return false;}
  return instance.end > range.start && instance.start < range.end;
}

function buildCalendarSyncItems({
  calendarId,
  tasks,
  range,
  existingEvents = []
}) {
  const existingByInstance = buildExistingEventIndex(existingEvents);
  const desiredInstanceIds = new Set();
  const items = [];
  (tasks || []).forEach((task) => {
    if (!task?.id || task.completed || task.scheduleStatus !== TASK_STATUS_SCHEDULED) {return;}
    const instances = buildTaskInstances(task);
    instances.forEach((instance) => {
      if (!isInstanceInRange(instance, range)) {return;}
      const instanceId = buildInstanceId(task.id, instance.occurrenceId, instance.index);
      desiredInstanceIds.add(instanceId);
      const existing = existingByInstance.get(instanceId);
      const startIso = instance.start.toISOString();
      const endIso = instance.end.toISOString();
      const skip =
        existing?.start instanceof Date &&
        existing?.end instanceof Date &&
        existing.start.toISOString() === startIso &&
        existing.end.toISOString() === endIso;
      items.push({
        action: existing?.id ? "update" : "create",
        calendarId,
        eventId: existing?.id || "",
        title: task.title || "Scheduled task",
        start: startIso,
        end: endIso,
        taskId: task.id,
        occurrenceId: instance.occurrenceId || "",
        instanceId,
        skip
      });
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
  settings = {},
  now = new Date(),
  existingEventsByCalendar = new Map()
} = {}) {
  const targets = getCalendarSyncTargets(settings);
  const existing = resolveExistingEventsByCalendar(existingEventsByCalendar);
  const plan = [];
  targets.forEach((target) => {
    const range = buildSyncRange(now, target.syncDays);
    const existingEvents = existing.get(target.calendarId) || [];
    plan.push(
      ...buildCalendarSyncItems({
        calendarId: target.calendarId,
        tasks,
        range,
        existingEvents
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
      await updateCalendarEvent(item.calendarId, item.eventId, item.start, item.end);
      return;
    }
    await createCalendarEvent(
      item.calendarId,
      item.title,
      item.start,
      item.end,
      {
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
