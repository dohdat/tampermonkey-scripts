import { getUpcomingOccurrences } from "../core/scheduler.js";
import { buildOccurrenceDates } from "../core/scheduler/occurrences.js";
import { addDays, startOfDay } from "../core/scheduler/date-utils.js";
import { normalizeTask } from "../core/scheduler/task-utils.js";
import {
  buildCompletedOccurrenceStore,
  isOccurrenceCompleted
} from "../core/scheduler/completion-utils.js";
import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../data/db.js";
import { FIFTY, THREE, TASK_REPEAT_NONE } from "../constants.js";

export function getExpectedOccurrenceCount(task, now, horizonDays) {
  if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return 0;}
  const safeHorizonDays = Number(horizonDays);
  const effectiveHorizonDays =
    Number.isFinite(safeHorizonDays) && safeHorizonDays > 0
      ? safeHorizonDays
      : DEFAULT_SCHEDULING_HORIZON_DAYS;
  const cap = Math.max(FIFTY, effectiveHorizonDays * THREE);
  return getUpcomingOccurrences(task, now, cap, effectiveHorizonDays).length;
}

function resolveWindowStart(windowEnd, horizonDays) {
  return startOfDay(addDays(windowEnd, -horizonDays));
}

function resolveLastScheduledStart(task) {
  if (!task?.lastScheduledRun) {return null;}
  const lastScheduled = new Date(task.lastScheduledRun);
  if (Number.isNaN(lastScheduled.getTime())) {return null;}
  return startOfDay(lastScheduled);
}

function resolveEffectiveStart(task, windowEnd, horizonDays) {
  const windowStart = resolveWindowStart(windowEnd, horizonDays);
  const lastScheduledStart = resolveLastScheduledStart(task);
  if (!lastScheduledStart) {return windowStart;}
  return lastScheduledStart > windowStart ? lastScheduledStart : windowStart;
}

export function getDueOccurrenceCount(task, now, horizonDays) {
  if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return 0;}
  const safeHorizonDays = Number(horizonDays);
  const effectiveHorizonDays =
    Number.isFinite(safeHorizonDays) && safeHorizonDays > 0
      ? safeHorizonDays
      : DEFAULT_SCHEDULING_HORIZON_DAYS;
  const windowEnd = now instanceof Date ? now : new Date();
  const effectiveStart = resolveEffectiveStart(task, windowEnd, effectiveHorizonDays);
  const normalized = normalizeTask(task, effectiveStart, windowEnd);
  const occurrences = buildOccurrenceDates(normalized, effectiveStart, windowEnd);
  if (!occurrences.length) {return 0;}
  const completedStore = buildCompletedOccurrenceStore(task.completedOccurrences);
  return occurrences.filter((date) => {
    if (date > windowEnd) {return false;}
    return !isOccurrenceCompleted(completedStore, date, normalized.repeat);
  }).length;
}
