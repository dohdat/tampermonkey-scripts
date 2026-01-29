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

function parseOrderValue(value) {
  if (value === null || value === undefined) {return Number.NaN;}
  if (typeof value === "string" && value.trim() === "") {return Number.NaN;}
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function buildIndexById(tasks) {
  const map = new Map();
  tasks.forEach((task, index) => {
    if (!task?.id) {return;}
    map.set(task.id, index);
  });
  return map;
}

function compareNumbers(aValue, bValue) {
  if (aValue < bValue) {return INDEX_NOT_FOUND;}
  if (aValue > bValue) {return 1;}
  return 0;
}

function resolveOrderForTask(task) {
  const order = parseOrderValue(task?.order);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function resolveSubtaskPosition(taskId, subtaskOrderById) {
  return subtaskOrderById.has(taskId)
    ? subtaskOrderById.get(taskId)
    : Number.MAX_SAFE_INTEGER;
}

function resolveIndexPosition(taskId, indexById) {
  return indexById.has(taskId) ? indexById.get(taskId) : Number.MAX_SAFE_INTEGER;
}

function compareSequentialGroupItems(aId, bId, tasksById, subtaskOrderById, indexById) {
  const aTask = tasksById.get(aId);
  const bTask = tasksById.get(bId);
  const orderResult = compareNumbers(resolveOrderForTask(aTask), resolveOrderForTask(bTask));
  if (orderResult !== 0) {return orderResult;}
  const positionResult = compareNumbers(
    resolveSubtaskPosition(aId, subtaskOrderById),
    resolveSubtaskPosition(bId, subtaskOrderById)
  );
  if (positionResult !== 0) {return positionResult;}
  const indexResult = compareNumbers(
    resolveIndexPosition(aId, indexById),
    resolveIndexPosition(bId, indexById)
  );
  if (indexResult !== 0) {return indexResult;}
  return (aTask?.title || "").localeCompare(bTask?.title || "");
}

function buildFlatOrderForParent({
  parentId,
  childrenByParent,
  subtaskOrderById,
  tasksById,
  indexById,
  list
}) {
  const children = [...(childrenByParent.get(parentId) || [])].sort((a, b) =>
    compareSequentialGroupItems(a.id, b.id, tasksById, subtaskOrderById, indexById)
  );
  children.forEach((child) => {
    list.push(child.id);
    buildFlatOrderForParent({
      parentId: child.id,
      childrenByParent,
      subtaskOrderById,
      tasksById,
      indexById,
      list
    });
  });
}

function buildSequentialOrderIndexMap(tasks, tasksById, parentModeById, subtaskOrderById) {
  const childrenByParent = buildChildrenByParent(tasks);
  const indexById = buildIndexById(tasks);
  const byGroup = new Map();
  tasks.forEach((task) => {
    if (!task?.id) {return;}
    const ancestors = getSequentialAncestors(task, tasksById, parentModeById);
    if (!ancestors.length) {return;}
    const groupId = ancestors[0].id;
    if (byGroup.has(groupId)) {return;}
    const list = [];
    buildFlatOrderForParent({
      parentId: groupId,
      childrenByParent,
      subtaskOrderById,
      tasksById,
      indexById,
      list
    });
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
