import { getUpcomingOccurrences } from "../core/scheduler.js";
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
