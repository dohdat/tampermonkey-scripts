import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveTask
} from "../data/db.js";
import { scheduleTasks } from "../core/scheduler.js";

const SOURCE_KEY = "personal-skedpal";

function getTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Auth failed"));
      } else {
        resolve(token);
      }
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function apiFetch(path, options, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers || {})
  };
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: options?.method || "GET",
    headers,
    body: options?.body
  });
  if (response.status === 401) {
    await removeCachedToken(token);
    throw new Error("Unauthorized with Calendar API");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Calendar API ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function deleteExistingScheduledEvents(token) {
  let pageToken;
  const deleted = [];
  do {
    const search = new URLSearchParams({
      privateExtendedProperty: `source=${SOURCE_KEY}`,
      maxResults: "250",
      showDeleted: "false",
      singleEvents: "true"
    });
    if (pageToken) search.set("pageToken", pageToken);
    const data = await apiFetch(`/calendars/primary/events?${search.toString()}`, {}, token);
    const items = data.items || [];
    for (const event of items) {
      await apiFetch(`/calendars/primary/events/${event.id}`, { method: "DELETE" }, token);
      deleted.push(event.id);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return deleted.length;
}

async function fetchBusy(token, timeMin, timeMax) {
  const body = JSON.stringify({
    timeMin,
    timeMax,
    items: [{ id: "primary" }]
  });
  const data = await apiFetch("/freeBusy", { method: "POST", body }, token);
  const busy = data.calendars?.primary?.busy || [];
  return busy.map((block) => ({
    start: new Date(block.start),
    end: new Date(block.end)
  }));
}

function mapById(list) {
  return list.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

async function createEvents(scheduled, tasksById, timeMapsById, token) {
  const timeZone = getTimeZone();
  for (const placement of scheduled) {
    const task = tasksById[placement.taskId];
    const timeMap = timeMapsById[placement.timeMapId];
    if (!task || !timeMap) continue;
    const body = JSON.stringify({
      summary: task.title,
      description: `Auto placed by Personal SkedPal (manual run). TimeMap: ${timeMap.name}`,
      start: { dateTime: placement.start.toISOString(), timeZone },
      end: { dateTime: placement.end.toISOString(), timeZone },
      extendedProperties: {
        private: {
          source: SOURCE_KEY,
          taskId: task.id,
          timeMapId: placement.timeMapId
        }
      }
    });
    await apiFetch("/calendars/primary/events", { method: "POST", body }, token);
  }
}

async function persistSchedule(tasks, placements, unscheduled, ignored) {
  const parentIds = new Set(
    tasks.filter((task) => task.subtaskParentId).map((task) => task.subtaskParentId)
  );
  const byTask = placements.reduce((map, placement) => {
    if (!map.has(placement.taskId)) map.set(placement.taskId, []);
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
    task.scheduleStatus =
      parentIds.has(task.id)
        ? null
        : ignored.includes(task.id) && taskPlacements.length === 0
          ? "ignored"
          : taskPlacements.length > 0
            ? "scheduled"
            : "unscheduled";
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

  // Temporarily disable Google Calendar sync to avoid OAuth errors.
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

  const horizonEnd = new Date(now.getTime() + settings.schedulingHorizonDays * 24 * 60 * 60 * 1000);
  const busy = [];

  const { scheduled, unscheduled, ignored } = scheduleTasks({
    tasks,
    timeMaps,
    busy,
    schedulingHorizonDays: settings.schedulingHorizonDays,
    now
  });

  await persistSchedule(tasks, scheduled, unscheduled, ignored);

  const scheduledTaskCount = new Set(scheduled.map((p) => p.taskId)).size;

  return {
    scheduled: scheduledTaskCount,
    unscheduled: unscheduled.length,
    ignored: ignored.length,
    placements: scheduled.length
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "reschedule") {
    runReschedule()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "ping") {
    sendResponse({ ok: true });
  }
  return undefined;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
