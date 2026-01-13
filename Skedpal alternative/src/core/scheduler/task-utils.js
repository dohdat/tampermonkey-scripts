import { normalizeDeadline } from "./date-utils.js";
import {
  DEFAULT_TASK_MIN_BLOCK_MIN,
  EXTERNAL_CALENDAR_TIMEMAP_PREFIX,
  MS_PER_MINUTE
} from "../../constants.js";

function splitTimeMapIds(timeMapIds) {
  const normalized = Array.isArray(timeMapIds) ? timeMapIds : [];
  const externalCalendarIds = [];
  const taskTimeMapIds = [];
  normalized.forEach((id) => {
    if (typeof id === "string" && id.startsWith(EXTERNAL_CALENDAR_TIMEMAP_PREFIX)) {
      const calendarId = id.slice(EXTERNAL_CALENDAR_TIMEMAP_PREFIX.length);
      if (calendarId) {
        externalCalendarIds.push(calendarId);
      }
      return;
    }
    taskTimeMapIds.push(id);
  });
  return { timeMapIds: taskTimeMapIds, externalCalendarIds };
}

export function normalizeTask(task, now, horizonEnd) {
  const durationMin = Math.max(DEFAULT_TASK_MIN_BLOCK_MIN, Number(task.durationMin) || 0);
  const minBlockMin = Math.max(
    DEFAULT_TASK_MIN_BLOCK_MIN,
    Math.min(Number(task.minBlockMin) || durationMin, durationMin)
  );
  const deadline = normalizeDeadline(task.deadline, horizonEnd);
  const startFrom = task.startFrom ? new Date(task.startFrom) : now;
  const { timeMapIds, externalCalendarIds } = splitTimeMapIds(task.timeMapIds);
  return {
    ...task,
    durationMs: durationMin * MS_PER_MINUTE,
    minBlockMs: minBlockMin * MS_PER_MINUTE,
    priority: Number(task.priority) || 0,
    timeMapIds,
    externalCalendarIds,
    deadline,
    startFrom
  };
}
