import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveSettings,
  saveTask,
  deleteTask,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../data/db.js";
import { scheduleTasks } from "../core/scheduler.js";
import { getDueOccurrenceCount, getExpectedOccurrenceCount } from "./schedule-helpers.js";
import { shouldIncrementMissedCount } from "./schedule-metrics.js";
import {
  CREATE_TASK_MENU_ID,
  CREATE_TASK_OVERLAY_SCRIPT,
  COMPLETED_TASK_RETENTION_DAYS,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TASK_REPEAT_NONE,
  TASK_STATUS_IGNORED,
  TASK_STATUS_SCHEDULED,
  TASK_STATUS_UNSCHEDULED
} from "../constants.js";
import {
  fetchCalendarEvents,
  deleteCalendarEvent,
  updateCalendarEvent,
  createCalendarEvent,
  fetchCalendarList,
  fetchFreeBusy,
  clearCachedAuthTokens
} from "./google-calendar.js";
import {
  getCalendarSyncTargets,
  initCalendarSyncAlarms,
  resumeCalendarSyncJob,
  startCalendarSyncJob
} from "./calendar-sync.js";
import { buildCreateTaskUrl } from "./context-menu.js";
import { buildSequentialSingleDeferredIds } from "./deferred-utils.js";
import {
  getPrunableCompletedTaskIds,
  pruneSettingsCollapsedTasks,
  shouldRunDailyPrune
} from "./prune.js";

function getMissedOccurrences(expectedOccurrences, scheduledOccurrences, isDeferred) {
  if (isDeferred) {return 0;}
  return Math.max(0, expectedOccurrences - scheduledOccurrences);
}

function applyDeferredMissReset(task, isDeferred) {
  if (!isDeferred) {return;}
  task.missedCount = 0;
  task.missedLastRun = 0;
  task.lastMissedAt = null;
}

function ensureContextMenu() {
  if (!chrome.contextMenus?.create) {return;}
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CREATE_TASK_MENU_ID,
      title: "Create task",
      contexts: ["page", "selection", "link"]
    });
  });
}

function resolveScheduleStatus(task, parentIds, ignored, taskPlacements) {
  if (parentIds.has(task.id)) {return null;}
  if (ignored.includes(task.id) && taskPlacements.length === 0) {return TASK_STATUS_IGNORED;}
  if (taskPlacements.length > 0) {return TASK_STATUS_SCHEDULED;}
  return TASK_STATUS_UNSCHEDULED;
}

function getScheduledOccurrenceCount(taskPlacements) {
  if (!taskPlacements.length) {return 0;}
  const occurrenceIds = taskPlacements.map((p) => p.occurrenceId).filter(Boolean);
  if (occurrenceIds.length) {
    return new Set(occurrenceIds).size;
  }
  return 1;
}

function computeTaskScheduleMetrics({
  task,
  taskPlacements,
  parentIds,
  deferredIds,
  now,
  horizonDays
}) {
  const expectedOccurrences = getExpectedOccurrenceCount(task, now, horizonDays);
  const dueOccurrences = getDueOccurrenceCount(task, now, horizonDays);
  const scheduledOccurrences = getScheduledOccurrenceCount(taskPlacements);
  const isDeferred = deferredIds.has(task.id);
  const isRepeating = task?.repeat && task.repeat.type !== TASK_REPEAT_NONE;
  const missedOccurrences = getMissedOccurrences(
    isRepeating ? dueOccurrences : expectedOccurrences,
    isRepeating ? 0 : scheduledOccurrences,
    isDeferred
  );
  const shouldIncrement = shouldIncrementMissedCount({
    task,
    status: task.scheduleStatus,
    parentIds,
    missedOccurrences,
    expectedCount: expectedOccurrences,
    dueCount: dueOccurrences,
    deferredIds,
    now
  });
  return {
    expectedOccurrences,
    dueOccurrences,
    scheduledOccurrences,
    missedOccurrences,
    shouldIncrement,
    isDeferred
  };
}

function parseAnchorDate(value) {
  if (!value) {return null;}
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLatestCompletedAnchor(completedOccurrences) {
  let latest = null;
  (completedOccurrences || []).forEach((value) => {
    const date = parseAnchorDate(value);
    if (!date) {return;}
    if (!latest || date > latest) {
      latest = date;
    }
  });
  return latest;
}

function getFirstScheduledInstanceAnchor(scheduledInstances) {
  const entries = Array.isArray(scheduledInstances) ? scheduledInstances : [];
  for (const entry of entries) {
    const date = parseAnchorDate(entry?.start);
    if (date) {return date;}
  }
  return null;
}

function parseScheduledInstanceDates(instance) {
  if (!instance?.start || !instance?.end) {return null;}
  const start = new Date(instance.start);
  const end = new Date(instance.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
  return { start, end };
}

function buildPinnedPlacements(tasks, now, horizonEnd) {
  const placements = [];
  const occurrenceIds = new Set();
  const taskIds = new Set();
  (tasks || []).forEach((task) => {
    if (!task?.id) {return;}
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance) => {
      if (!instance?.pinned) {return;}
      const dates = parseScheduledInstanceDates(instance);
      if (!dates) {return;}
      if (dates.end <= now || dates.start >= horizonEnd) {return;}
      placements.push({
        taskId: task.id,
        occurrenceId: instance.occurrenceId || "",
        timeMapId: instance.timeMapId || "",
        start: dates.start,
        end: dates.end,
        pinned: true
      });
      if (instance.occurrenceId) {
        occurrenceIds.add(instance.occurrenceId);
      } else {
        taskIds.add(task.id);
      }
    });
  });
  return { placements, occurrenceIds, taskIds };
}

function ensureRepeatAnchorForTask(task, now) {
  const repeat = task?.repeat;
  if (!repeat || repeat.type === TASK_REPEAT_NONE || repeat.unit === TASK_REPEAT_NONE) {
    return false;
  }
  if (parseAnchorDate(task.repeatAnchor)) {
    return false;
  }
  const anchor =
    parseAnchorDate(task.startFrom) ||
    parseAnchorDate(task.deadline) ||
    getLatestCompletedAnchor(task.completedOccurrences) ||
    parseAnchorDate(task.scheduledStart) ||
    getFirstScheduledInstanceAnchor(task.scheduledInstances) ||
    now;
  task.repeatAnchor = anchor.toISOString();
  return true;
}

function ensureRepeatAnchors(tasks, now) {
  let updated = false;
  (tasks || []).forEach((task) => {
    if (ensureRepeatAnchorForTask(task, now)) {
      updated = true;
    }
  });
  return updated;
}

async function persistSchedule(tasks, placements, unscheduled, ignored, deferred, now, horizonDays) {
  const parentIds = new Set(
    tasks
      .filter((task) => task.subtaskParentId && !task.completed)
      .map((task) => task.subtaskParentId)
  );
  const deferredIds = new Set(deferred || []);
  const sequentialDeferred = buildSequentialSingleDeferredIds(tasks, placements);
  sequentialDeferred.forEach((id) => deferredIds.add(id));
  const byTask = placements.reduce((map, placement) => {
    if (!map.has(placement.taskId)) {map.set(placement.taskId, []);}
    map.get(placement.taskId).push(placement);
    return map;
  }, new Map());
  const timestamp = new Date().toISOString();
  for (const task of tasks) {
    const taskPlacements = (byTask.get(task.id) || []).sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
    task.scheduledInstances = taskPlacements.map((p) => ({
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      timeMapId: p.timeMapId,
      occurrenceId: p.occurrenceId || null,
      pinned: Boolean(p.pinned)
    }));
    task.scheduledStart = taskPlacements[0]?.start?.toISOString() || null;
    task.scheduledEnd = taskPlacements[taskPlacements.length - 1]?.end?.toISOString() || null;
    task.scheduledTimeMapId = taskPlacements[0]?.timeMapId || null;
    task.scheduleStatus = resolveScheduleStatus(task, parentIds, ignored, taskPlacements);
    const metrics = computeTaskScheduleMetrics({
      task,
      taskPlacements,
      parentIds,
      deferredIds,
      now,
      horizonDays
    });
    applyDeferredMissReset(task, metrics.isDeferred);
    if (metrics.shouldIncrement) {
      task.missedCount =
        (Number(task.missedCount) || 0) + Math.max(1, metrics.missedOccurrences);
      task.lastMissedAt = timestamp;
    }
    task.expectedCount = metrics.expectedOccurrences;
    task.scheduledCount = metrics.scheduledOccurrences;
    task.missedLastRun = metrics.missedOccurrences;
    task.lastScheduledRun = timestamp;
    await saveTask(task);
  }
}

async function runCompletedTaskPrune(tasks, settings, now) {
  if (!shouldRunDailyPrune(settings?.lastPrunedAt, now)) {
    return { remaining: tasks, settings, prunedCount: 0 };
  }
  const prunableIds = getPrunableCompletedTaskIds(
    tasks,
    COMPLETED_TASK_RETENTION_DAYS,
    now
  );
  let removedIds = new Set();
  if (prunableIds.length) {
    await Promise.all(prunableIds.map((id) => deleteTask(id)));
    removedIds = new Set(prunableIds);
  }
  const nextSettings = pruneSettingsCollapsedTasks(settings, removedIds);
  const updatedSettings = {
    ...nextSettings,
    lastPrunedAt: now.toISOString()
  };
  if (
    updatedSettings !== settings ||
    updatedSettings.lastPrunedAt !== settings?.lastPrunedAt
  ) {
    await saveSettings(updatedSettings);
  }
  const remaining = prunableIds.length
    ? tasks.filter((task) => !removedIds.has(task.id))
    : tasks;
  return {
    remaining,
    settings: updatedSettings,
    prunedCount: prunableIds.length
  };
}

function runBackgroundPrune() {
  const now = new Date();
  return Promise.all([getAllTasks(), getSettings()])
    .then(([tasks, settings]) => runCompletedTaskPrune(tasks, settings, now))
    .catch((error) => {
      console.warn("Failed to prune completed tasks.", error);
    });
}

function getCalendarTaskIdSet(settings) {
  const ids = new Set();
  const map = settings?.googleCalendarTaskSettings;
  if (!map || typeof map !== "object") {
    return ids;
  }
  Object.entries(map).forEach(([calendarId, entry]) => {
    if (calendarId && entry?.treatAsTasks) {
      ids.add(calendarId);
    }
  });
  return ids;
}

function getCalendarSyncIdSet(settings) {
  return new Set(getCalendarSyncTargets(settings).map((entry) => entry.calendarId));
}

async function runReschedule() {
  const now = new Date();
  let [tasks, timeMaps, settings] = await Promise.all([
    getAllTasks(),
    getAllTimeMaps(),
    getSettings()
  ]);

  const pruneResult = await runCompletedTaskPrune(tasks, settings, now);
  tasks = pruneResult.remaining;
  settings = pruneResult.settings;
  const deleted = pruneResult.prunedCount;

  ensureRepeatAnchors(tasks, now);

  if (timeMaps.length === 0 || tasks.length === 0) {
    return {
      scheduled: 0,
      unscheduled: tasks.length,
      ignored: 0,
      deleted,
      message: "Add tasks and TimeMaps before scheduling."
    };
  }

  let busy = [];
  const calendarTaskIds = getCalendarTaskIdSet(settings);
  const calendarSyncIds = getCalendarSyncIdSet(settings);
  const calendarIds = Array.isArray(settings.googleCalendarIds)
    ? settings.googleCalendarIds.filter(
      (id) => !calendarTaskIds.has(id) && !calendarSyncIds.has(id)
    )
    : null;
  const horizonDays = Number(settings.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const horizonEnd = new Date(now.getTime());
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  horizonEnd.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  if (!Array.isArray(calendarIds) || calendarIds.length) {
    try {
      busy = await fetchFreeBusy({
        timeMin: now.toISOString(),
        timeMax: horizonEnd.toISOString(),
        calendarIds
      });
    } catch (error) {
      console.warn("Failed to load Google Calendar busy blocks.", error);
    }
  }

  const pinnedInfo = buildPinnedPlacements(tasks, now, horizonEnd);
  const { scheduled, unscheduled, ignored, deferred } = scheduleTasks({
    tasks,
    timeMaps,
    busy,
    schedulingHorizonDays: horizonDays,
    now,
    pinnedPlacements: pinnedInfo.placements,
    pinnedTaskIds: pinnedInfo.taskIds,
    pinnedOccurrenceIds: pinnedInfo.occurrenceIds
  });

  await persistSchedule(
    tasks,
    scheduled,
    unscheduled,
    ignored,
    deferred,
    now,
    horizonDays
  );
  await startCalendarSyncJob({ tasks, timeMaps, settings, now });

  const scheduledTaskCount = new Set(scheduled.map((p) => p.taskId)).size;

  return {
    scheduled: scheduledTaskCount,
    unscheduled: unscheduled.length,
    ignored: ignored.length,
    placements: scheduled.length
  };
}

function handleRescheduleMessage(_message, sendResponse) {
  runReschedule()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarEventsMessage(message, sendResponse) {
  const timeMin = message.timeMin || new Date().toISOString();
  const timeMax = message.timeMax || null;
  if (!timeMax) {
    sendResponse({ ok: false, error: "Missing timeMax for calendar events" });
    return false;
  }
  const calendarIds = Array.isArray(message.calendarIds) ? message.calendarIds : null;
  const syncTokensByCalendar =
    message.syncTokensByCalendar && typeof message.syncTokensByCalendar === "object"
      ? message.syncTokensByCalendar
      : null;
  fetchCalendarEvents({
    timeMin,
    timeMax,
    calendarIds,
    syncTokensByCalendar,
    includeCancelled: true,
    includeSyncTokens: true
  })
    .then((result) => {
      const events = Array.isArray(result?.events) ? result.events : [];
      const payload = events.map((event) => ({
        ...event,
        start: event.start.toISOString(),
        end: event.end.toISOString()
      }));
      sendResponse({
        ok: true,
        events: payload,
        deletedEvents: result?.deletedEvents || [],
        syncTokensByCalendar: result?.syncTokensByCalendar || {},
        isIncremental: Boolean(result?.isIncremental)
      });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarListMessage(_message, sendResponse) {
  fetchCalendarList()
    .then((calendars) => sendResponse({ ok: true, calendars }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarDeleteMessage(message, sendResponse) {
  const calendarId = message.calendarId || "";
  const eventId = message.eventId || "";
  deleteCalendarEvent(calendarId, eventId)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarUpdateMessage(message, sendResponse) {
  const calendarId = message.calendarId || "";
  const eventId = message.eventId || "";
  const start = message.start || "";
  const end = message.end || "";
  const updateOptions = Object.prototype.hasOwnProperty.call(message || {}, "title")
    ? { title: message.title || "" }
    : {};
  updateCalendarEvent(calendarId, eventId, start, end, updateOptions)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarCreateMessage(message, sendResponse) {
  const calendarId = message.calendarId || "";
  const title = message.title || "";
  const start = message.start || "";
  const end = message.end || "";
  createCalendarEvent(calendarId, title, start, end)
    .then((event) => {
      if (!event) {
        sendResponse({ ok: false, error: "Calendar event creation failed." });
        return;
      }
      sendResponse({
        ok: true,
        event: {
          ...event,
          start: event.start.toISOString(),
          end: event.end.toISOString()
        }
      });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handleCalendarDisconnectMessage(_message, sendResponse) {
  clearCachedAuthTokens()
    .then((cleared) => sendResponse({ ok: true, cleared }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
}

function handlePingMessage(_message, sendResponse) {
  sendResponse({ ok: true });
  return false;
}

const MESSAGE_HANDLERS = {
  reschedule: handleRescheduleMessage,
  "calendar-events": handleCalendarEventsMessage,
  "calendar-list": handleCalendarListMessage,
  "calendar-delete-event": handleCalendarDeleteMessage,
  "calendar-update-event": handleCalendarUpdateMessage,
  "calendar-create-event": handleCalendarCreateMessage,
  "calendar-disconnect": handleCalendarDisconnectMessage,
  ping: handlePingMessage
};

function handleRuntimeMessage(message, sendResponse) {
  const handler = message?.type ? MESSAGE_HANDLERS[message.type] : null;
  if (!handler) {return false;}
  return handler(message, sendResponse);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  return handleRuntimeMessage(message, sendResponse);
});

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
  runBackgroundPrune();
  resumeCalendarSyncJob().catch((error) => {
    console.warn("Failed to resume calendar sync.", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
  runBackgroundPrune();
  resumeCalendarSyncJob().catch((error) => {
    console.warn("Failed to resume calendar sync.", error);
  });
});

function getTabTitle(tabId) {
  return new Promise((resolve) => {
    if (!chrome.tabs?.get) {
      resolve("");
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      resolve(tab?.title || "");
    });
  });
}

async function resolvePageTitle(info, tab) {
  if (tab?.title) {return tab.title;}
  const tabId = info?.tabId;
  if (typeof tabId !== "number") {return "";}
  return getTabTitle(tabId);
}

async function openCreateTaskOverlay(tabId, createTaskUrl) {
  if (!chrome.scripting?.executeScript) {return false;}
  if (typeof tabId !== "number") {return false;}
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CREATE_TASK_OVERLAY_SCRIPT]
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => {
        if (typeof window.skedpalCreateTaskOverlayOpen !== "function") {return false;}
        return window.skedpalCreateTaskOverlayOpen(url);
      },
      args: [createTaskUrl]
    });
    return Boolean(result?.result);
  } catch (error) {
    console.warn("Failed to open create task overlay.", error);
    return false;
  }
}

async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== CREATE_TASK_MENU_ID) {return;}
  const baseUrl = chrome.runtime.getURL("pages/index.html");
  const pageTitle = await resolvePageTitle(info, tab);
  const createTaskUrl = buildCreateTaskUrl(info, baseUrl, pageTitle);
  const tabId = tab?.id ?? info?.tabId;
  const opened = await openCreateTaskOverlay(tabId, createTaskUrl);
  if (!opened) {
    chrome.tabs.create({ url: createTaskUrl });
  }
}

chrome.contextMenus?.onClicked?.addListener(handleContextMenuClick);

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

initCalendarSyncAlarms();
