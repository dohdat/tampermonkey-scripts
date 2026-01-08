import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveTask,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../data/db.js";
import { scheduleTasks, getUpcomingOccurrences } from "../core/scheduler.js";
import { shouldIncrementMissedCount } from "./schedule-metrics.js";
import {
  fetchCalendarEvents,
  deleteCalendarEvent,
  updateCalendarEvent,
  createCalendarEvent,
  fetchCalendarList,
  fetchFreeBusy,
  clearCachedAuthTokens
} from "./google-calendar.js";

function resolveScheduleStatus(task, parentIds, ignored, taskPlacements) {
  if (parentIds.has(task.id)) {return null;}
  if (ignored.includes(task.id) && taskPlacements.length === 0) {return "ignored";}
  if (taskPlacements.length > 0) {return "scheduled";}
  return "unscheduled";
}

function getScheduledOccurrenceCount(taskPlacements) {
  if (!taskPlacements.length) {return 0;}
  const occurrenceIds = taskPlacements.map((p) => p.occurrenceId).filter(Boolean);
  if (occurrenceIds.length) {
    return new Set(occurrenceIds).size;
  }
  return 1;
}

function getExpectedOccurrenceCount(task, now, horizonDays) {
  if (!task?.repeat || task.repeat.type === "none") {return 0;}
  const cap = Math.max(50, horizonDays * 3);
  return getUpcomingOccurrences(task, now, cap, horizonDays).length;
}

async function persistSchedule(tasks, placements, unscheduled, ignored, now, horizonDays) {
  const parentIds = new Set(
    tasks
      .filter((task) => task.subtaskParentId && !task.completed)
      .map((task) => task.subtaskParentId)
  );
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
      occurrenceId: p.occurrenceId || null
    }));
    task.scheduledStart = taskPlacements[0]?.start?.toISOString() || null;
    task.scheduledEnd = taskPlacements[taskPlacements.length - 1]?.end?.toISOString() || null;
    task.scheduledTimeMapId = taskPlacements[0]?.timeMapId || null;
    task.scheduleStatus = resolveScheduleStatus(task, parentIds, ignored, taskPlacements);
    const expectedOccurrences = getExpectedOccurrenceCount(task, now, horizonDays);
    const scheduledOccurrences = getScheduledOccurrenceCount(taskPlacements);
    const missedOccurrences = Math.max(0, expectedOccurrences - scheduledOccurrences);
    if (
      shouldIncrementMissedCount({
        task,
        status: task.scheduleStatus,
        parentIds,
        missedOccurrences
      })
    ) {
      task.missedCount = (Number(task.missedCount) || 0) + Math.max(1, missedOccurrences);
      task.lastMissedAt = timestamp;
    }
    task.expectedCount = expectedOccurrences;
    task.scheduledCount = scheduledOccurrences;
    task.missedLastRun = missedOccurrences;
    task.lastScheduledRun = timestamp;
    await saveTask(task);
  }
}

async function runReschedule() {
  const now = new Date();
  const [tasks, timeMaps, settings] = await Promise.all([
    getAllTasks(),
    getAllTimeMaps(),
    getSettings()
  ]);

  const deleted = 0;

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
  const calendarIds = Array.isArray(settings.googleCalendarIds)
    ? settings.googleCalendarIds
    : null;
  const horizonDays = Number(settings.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const horizonEnd = new Date(now.getTime());
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  horizonEnd.setHours(23, 59, 59, 999);
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

  const { scheduled, unscheduled, ignored } = scheduleTasks({
    tasks,
    timeMaps,
    busy,
    schedulingHorizonDays: horizonDays,
    now
  });

  await persistSchedule(tasks, scheduled, unscheduled, ignored, now, settings.schedulingHorizonDays);

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
  fetchCalendarEvents({ timeMin, timeMax, calendarIds })
    .then((events) => {
      const payload = events.map((event) => ({
        ...event,
        start: event.start.toISOString(),
        end: event.end.toISOString()
      }));
      sendResponse({ ok: true, events: payload });
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
  updateCalendarEvent(calendarId, eventId, start, end)
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

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
