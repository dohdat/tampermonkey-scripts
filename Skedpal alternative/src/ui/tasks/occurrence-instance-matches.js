import { getLocalDateKey } from "../utils.js";
import { resolveOccurrenceRangeStart } from "./occurrence-horizon.js";

function isCompletionBasedDailyRepeat(task) {
  return task?.repeat?.unit === "day" && task?.repeat?.dayMode === "completion";
}

function parseInstanceStart(instance) {
  if (!instance?.start) {return null;}
  const start = new Date(instance.start);
  return Number.isNaN(start.getTime()) ? null : start;
}

function getScheduledInstances(task) {
  return Array.isArray(task?.scheduledInstances) ? task.scheduledInstances : [];
}

function findOccurrenceIdMatches(instances, occurrenceId) {
  if (!occurrenceId) {return [];}
  return instances.filter((instance) => instance?.occurrenceId === occurrenceId);
}

function findSameDayMatches(instances, date) {
  const targetKey = getLocalDateKey(date);
  if (!targetKey) {return [];}
  return instances.filter((instance) => getLocalDateKey(instance?.start) === targetKey);
}

function findRangeMatches(task, instances, date) {
  const rangeStart = resolveOccurrenceRangeStart(task, date);
  if (!rangeStart) {return [];}
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = date.getTime();
  return instances.filter((instance) => {
    const start = parseInstanceStart(instance);
    if (!start) {return false;}
    const startMs = start.getTime();
    return startMs >= rangeStartMs && startMs <= rangeEndMs;
  });
}

function findCompletionFallbackMatches(task, instances, allowCompletionFallback) {
  if (!allowCompletionFallback || !isCompletionBasedDailyRepeat(task)) {return [];}
  return instances.filter((instance) => Boolean(parseInstanceStart(instance)));
}

export function findScheduledOccurrenceMatches(
  task,
  date,
  occurrenceId,
  { allowCompletionFallback = false } = {}
) {
  const instances = getScheduledInstances(task);
  const byOccurrenceId = findOccurrenceIdMatches(instances, occurrenceId);
  if (byOccurrenceId.length) {return byOccurrenceId;}
  const byDate = findSameDayMatches(instances, date);
  if (byDate.length) {return byDate;}
  const byRange = findRangeMatches(task, instances, date);
  if (byRange.length) {return byRange;}
  return findCompletionFallbackMatches(task, instances, allowCompletionFallback);
}
