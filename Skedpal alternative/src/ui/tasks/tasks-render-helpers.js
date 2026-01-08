export function buildParentMap(tasks) {
  return tasks.reduce((map, task) => {
    if (task.subtaskParentId) {
      map.set(task.id, task.subtaskParentId);
    }
    return map;
  }, new Map());
}

export function buildTaskDepthGetter(parentById) {
  const depthMemo = new Map();
  const getTaskDepthById = (taskId) => {
    if (!taskId) {return 0;}
    if (depthMemo.has(taskId)) {return depthMemo.get(taskId);}
    const parentId = parentById.get(taskId);
    if (!parentId) {
      depthMemo.set(taskId, 0);
      return 0;
    }
    const depth = getTaskDepthById(parentId) + 1;
    depthMemo.set(taskId, depth);
    return depth;
  };
  return getTaskDepthById;
}

export function buildCollapsedAncestorChecker(parentById, collapsedTasks) {
  const collapsedAncestorMemo = new Map();
  const hasCollapsedAncestor = (taskId) => {
    if (!taskId) {return false;}
    if (collapsedAncestorMemo.has(taskId)) {return collapsedAncestorMemo.get(taskId);}
    const parentId = parentById.get(taskId);
    if (!parentId) {
      collapsedAncestorMemo.set(taskId, false);
      return false;
    }
    if (collapsedTasks.has(parentId)) {
      collapsedAncestorMemo.set(taskId, true);
      return true;
    }
    const result = hasCollapsedAncestor(parentId);
    collapsedAncestorMemo.set(taskId, result);
    return result;
  };
  return hasCollapsedAncestor;
}

export function buildChildrenByParent(tasks) {
  return tasks.reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!pid) {return map;}
    if (!map.has(pid)) {map.set(pid, []);}
    map.get(pid).push(task);
    return map;
  }, new Map());
}

export function buildDurationCalculator(childrenByParent) {
  const durationMemo = new Map();
  const computeTotalDuration = (task) => {
    if (!task?.id) {return 0;}
    if (durationMemo.has(task.id)) {return durationMemo.get(task.id);}
    const children = childrenByParent.get(task.id) || [];
    if (children.length === 0) {
      const own = Number(task.durationMin) || 0;
      durationMemo.set(task.id, own);
      return own;
    }
    const total = children.reduce((sum, child) => sum + computeTotalDuration(child), 0);
    durationMemo.set(task.id, total);
    return total;
  };
  return computeTotalDuration;
}
