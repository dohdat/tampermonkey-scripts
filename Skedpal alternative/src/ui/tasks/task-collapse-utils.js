export function getParentTaskIds(tasks = []) {
  return (tasks || []).reduce((set, task) => {
    const parentId = task?.subtaskParentId;
    if (parentId) {
      set.add(parentId);
    }
    return set;
  }, new Set());
}

function buildTaskById(tasks = []) {
  return new Map((tasks || []).map((task) => [task.id, task]));
}

function getAncestorIds(taskId, tasksById) {
  const ancestors = new Set();
  let current = taskId;
  while (current) {
    const task = tasksById.get(current);
    const parentId = task?.subtaskParentId || "";
    if (!parentId || ancestors.has(parentId)) {break;}
    ancestors.add(parentId);
    current = parentId;
  }
  return ancestors;
}

export function computeSingleExpandedCollapsedSet(
  collapsedTasks,
  taskId,
  tasks = []
) {
  if (!taskId) {return new Set(collapsedTasks || []);}
  const parentIds = getParentTaskIds(tasks);
  const next = new Set(collapsedTasks || []);
  if (!parentIds.has(taskId)) {return next;}
  const tasksById = buildTaskById(tasks);
  const ancestors = getAncestorIds(taskId, tasksById);
  ancestors.add(taskId);
  if (next.has(taskId)) {
    next.delete(taskId);
    ancestors.forEach((id) => next.delete(id));
    parentIds.forEach((parentId) => {
      if (!ancestors.has(parentId)) {
        next.add(parentId);
      }
    });
    return next;
  }
  next.add(taskId);
  return next;
}
