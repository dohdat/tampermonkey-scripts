function isStartFromInFuture(task, now) {
  if (!task?.startFrom) {return false;}
  const startFrom = new Date(task.startFrom);
  if (Number.isNaN(startFrom.getTime())) {return false;}
  return startFrom > now;
}

export function shouldCountMiss(task, status, parentIds = new Set()) {
  if (!task || task.completed) {return false;}
  if (!status || status === "scheduled" || status === "ignored") {return false;}
  return !parentIds.has(task.id);
}

export function shouldIncrementMissedCount({
  task,
  status,
  parentIds,
  missedOccurrences,
  expectedCount,
  deferredIds = new Set(),
  now = new Date()
}) {
  if (isStartFromInFuture(task, now)) {return false;}
  if (deferredIds.has(task?.id)) {return false;}
  if (status === "ignored") {return false;}
  if (Number(expectedCount) === 0 && task?.repeat && task.repeat.type !== "none") {
    return false;
  }
  if (Number(missedOccurrences) > 0) {return true;}
  return shouldCountMiss(task, status, parentIds);
}
