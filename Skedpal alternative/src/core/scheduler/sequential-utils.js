import { INDEX_NOT_FOUND } from "../../constants.js";

export function buildTaskMap(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task?.id) {return;}
    map.set(task.id, task);
  });
  return map;
}

export function getSequentialAncestors(task, tasksById, parentModeById) {
  const ancestors = [];
  let parentId = task.subtaskParentId;
  while (parentId) {
    const mode = parentModeById.get(parentId) || "parallel";
    if (mode !== "parallel") {
      ancestors.push({ id: parentId, mode });
    }
    const parentTask = tasksById.get(parentId);
    if (!parentTask) {break;}
    parentId = parentTask.subtaskParentId;
  }
  return ancestors.reverse();
}

export function buildSequentialPath(taskId, groupId, tasksById, subtaskOrderById) {
  if (!groupId) {return [];}
  const path = [];
  let currentId = taskId;
  while (currentId && currentId !== groupId) {
    const order = subtaskOrderById.has(currentId)
      ? subtaskOrderById.get(currentId)
      : Number.MAX_SAFE_INTEGER;
    path.push(order);
    const currentTask = tasksById.get(currentId);
    if (!currentTask) {break;}
    currentId = currentTask.subtaskParentId;
  }
  if (currentId !== groupId) {return [];}
  return path.reverse();
}

export function buildSequentialInfoMap(tasks, tasksById, parentModeById, subtaskOrderById) {
  const flatOrderByGroup = buildSequentialOrderIndexMap(
    tasks,
    tasksById,
    parentModeById,
    subtaskOrderById
  );
  const map = new Map();
  tasks.forEach((task) => {
    if (!task?.id) {return;}
    const ancestors = getSequentialAncestors(task, tasksById, parentModeById);
    const groupId = ancestors.length ? ancestors[0].id : "";
    const path = buildSequentialPath(task.id, groupId, tasksById, subtaskOrderById);
    const flatIndex = flatOrderByGroup.get(groupId)?.get(task.id);
    map.set(task.id, { ancestors, groupId, path, flatIndex });
  });
  return map;
}

function buildChildrenByParent(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    const parentId = task.subtaskParentId || "";
    if (!map.has(parentId)) {
      map.set(parentId, []);
    }
    map.get(parentId).push(task);
  });
  return map;
}

function sortChildrenByOrder(children, subtaskOrderById) {
  return [...children].sort((a, b) => {
    const aOrder = subtaskOrderById.has(a.id)
      ? subtaskOrderById.get(a.id)
      : Number.MAX_SAFE_INTEGER;
    const bOrder = subtaskOrderById.has(b.id)
      ? subtaskOrderById.get(b.id)
      : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return (a.title || "").localeCompare(b.title || "");
  });
}

function buildFlatOrderForParent(parentId, childrenByParent, subtaskOrderById, list) {
  const children = sortChildrenByOrder(childrenByParent.get(parentId) || [], subtaskOrderById);
  children.forEach((child) => {
    list.push(child.id);
    buildFlatOrderForParent(child.id, childrenByParent, subtaskOrderById, list);
  });
}

function buildSequentialOrderIndexMap(tasks, tasksById, parentModeById, subtaskOrderById) {
  const childrenByParent = buildChildrenByParent(tasks);
  const byGroup = new Map();
  tasks.forEach((task) => {
    if (!task?.id) {return;}
    const ancestors = getSequentialAncestors(task, tasksById, parentModeById);
    if (!ancestors.length) {return;}
    const groupId = ancestors[0].id;
    if (byGroup.has(groupId)) {return;}
    const list = [];
    buildFlatOrderForParent(groupId, childrenByParent, subtaskOrderById, list);
    const indexMap = new Map();
    list.forEach((id, index) => {
      indexMap.set(id, index);
    });
    byGroup.set(groupId, indexMap);
  });
  return byGroup;
}

export function compareSequentialIndex(aIndex, bIndex) {
  if (!Number.isFinite(aIndex) && !Number.isFinite(bIndex)) {
    return 0;
  }
  if (!Number.isFinite(aIndex)) {return 1;}
  if (!Number.isFinite(bIndex)) {return INDEX_NOT_FOUND;}
  if (aIndex < bIndex) {return INDEX_NOT_FOUND;}
  if (aIndex > bIndex) {return 1;}
  return 0;
}
