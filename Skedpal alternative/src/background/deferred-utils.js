function buildChildrenByParent(tasks) {
  return (tasks || []).reduce((map, task) => {
    if (!task?.subtaskParentId) {return map;}
    if (!map.has(task.subtaskParentId)) {map.set(task.subtaskParentId, []);}
    map.get(task.subtaskParentId).push(task);
    return map;
  }, new Map());
}

function buildParentModeMap(tasks) {
  return (tasks || []).reduce((map, task) => {
    if (!task?.id) {return map;}
    map.set(task.id, task.subtaskScheduleMode || "");
    return map;
  }, new Map());
}

export function buildSequentialSingleDeferredIds(tasks = [], placements = []) {
  const childrenByParent = buildChildrenByParent(tasks);
  const parentModeById = buildParentModeMap(tasks);
  const scheduledIds = new Set((placements || []).map((placement) => placement.taskId));
  const deferred = new Set();
  childrenByParent.forEach((children, parentId) => {
    if (parentModeById.get(parentId) !== "sequential-single") {return;}
    const hasScheduledChild = children.some((child) => scheduledIds.has(child.id));
    if (!hasScheduledChild) {return;}
    children.forEach((child) => {
      if (!scheduledIds.has(child.id)) {
        deferred.add(child.id);
      }
    });
  });
  return deferred;
}
