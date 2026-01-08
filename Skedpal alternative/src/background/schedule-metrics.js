export function shouldCountMiss(task, status, parentIds = new Set()) {
  if (!task || task.completed) {return false;}
  if (!status || status === "scheduled" || status === "ignored") {return false;}
  return !parentIds.has(task.id);
}

export function shouldIncrementMissedCount({ task, status, parentIds, missedOccurrences }) {
  if (status === "ignored") {return false;}
  if (Number(missedOccurrences) > 0) {return true;}
  return shouldCountMiss(task, status, parentIds);
}
