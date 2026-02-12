function isStartFromInFuture(task, now) {
  if (!task?.startFrom) {return false;}
  const startFrom = new Date(task.startFrom);
  if (Number.isNaN(startFrom.getTime())) {return false;}
  return startFrom > now;
}

function isRepeatingTask(task) {
  return Boolean(task?.repeat && task.repeat.type !== "none");
}

function shouldSkipRepeatMiss(task, expectedCount, dueCount) {
  if (!isRepeatingTask(task)) {return false;}
  if (Number(expectedCount) === 0) {return true;}
  const due = Number(dueCount);
  return Number.isFinite(due) && due <= 0;
}

function shouldSkipMissedCount({ task, status, deferredIds, expectedCount, dueCount, now }) {
  if (isStartFromInFuture(task, now)) {return true;}
  if (deferredIds.has(task?.id)) {return true;}
  if (status === "ignored") {return true;}
  return shouldSkipRepeatMiss(task, expectedCount, dueCount);
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
  dueCount,
  deferredIds = new Set(),
  now = new Date()
}) {
  if (shouldSkipMissedCount({
    task,
    status,
    deferredIds,
    expectedCount,
    dueCount,
    now
  })) {
    return false;
  }
  if (Number(missedOccurrences) > 0) {return true;}
  return shouldCountMiss(task, status, parentIds);
}
