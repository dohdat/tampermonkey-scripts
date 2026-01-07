import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveTask
} from "../data/db.js";
import { scheduleTasks } from "../core/scheduler.js";

async function persistSchedule(tasks, placements, unscheduled, ignored) {
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
    if (parentIds.has(task.id)) {
      task.scheduleStatus = null;
    } else if (ignored.includes(task.id) && taskPlacements.length === 0) {
      task.scheduleStatus = "ignored";
    } else if (taskPlacements.length > 0) {
      task.scheduleStatus = "scheduled";
    } else {
      task.scheduleStatus = "unscheduled";
    }
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
