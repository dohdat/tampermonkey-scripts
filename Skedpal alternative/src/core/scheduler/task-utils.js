import { normalizeDeadline } from "./date-utils.js";
import { DEFAULT_TASK_MIN_BLOCK_MIN, MS_PER_MINUTE } from "../../constants.js";

export function normalizeTask(task, now, horizonEnd) {
  const durationMin = Math.max(DEFAULT_TASK_MIN_BLOCK_MIN, Number(task.durationMin) || 0);
  const minBlockMin = Math.max(
    DEFAULT_TASK_MIN_BLOCK_MIN,
    Math.min(Number(task.minBlockMin) || durationMin, durationMin)
  );
  const deadline = normalizeDeadline(task.deadline, horizonEnd);
  const startFrom = task.startFrom ? new Date(task.startFrom) : now;
  return {
    ...task,
    durationMs: durationMin * MS_PER_MINUTE,
    minBlockMs: minBlockMin * MS_PER_MINUTE,
    priority: Number(task.priority) || 0,
    timeMapIds: Array.isArray(task.timeMapIds) ? task.timeMapIds : [],
    deadline,
    startFrom
  };
}
