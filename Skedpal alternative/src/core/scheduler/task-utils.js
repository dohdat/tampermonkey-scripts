import { normalizeDeadline } from "./date-utils.js";

export function normalizeTask(task, now, horizonEnd) {
  const durationMin = Math.max(15, Number(task.durationMin) || 0);
  const minBlockMin = Math.max(15, Math.min(Number(task.minBlockMin) || durationMin, durationMin));
  const deadline = normalizeDeadline(task.deadline, horizonEnd);
  const startFrom = task.startFrom ? new Date(task.startFrom) : now;
  return {
    ...task,
    durationMs: durationMin * 60 * 1000,
    minBlockMs: minBlockMin * 60 * 1000,
    priority: Number(task.priority) || 0,
    timeMapIds: Array.isArray(task.timeMapIds) ? task.timeMapIds : [],
    deadline,
    startFrom
  };
}
