import { TASK_STATUS_UNSCHEDULED } from "../constants.js";
import { getNextOrder, getNextSubtaskOrder, uuid } from "../utils.js";

function buildDuplicateMap(tasksToClone) {
  const map = new Map();
  tasksToClone.forEach((task) => {
    map.set(task.id, uuid());
  });
  return map;
}

function resolveKeptParentId(original, rootId, keptSet, byId, idMap) {
  if (original.id === rootId) {return null;}
  let currentId = original.subtaskParentId || "";
  while (currentId && !keptSet.has(currentId)) {
    currentId = byId.get(currentId)?.subtaskParentId || rootId;
  }
  const fallback = idMap.get(rootId) || null;
  if (!currentId) {return fallback;}
  if (!keptSet.has(currentId)) {return fallback;}
  return idMap.get(currentId) || fallback;
}

function buildDuplicateTask(original, parentId, order, newId) {
  const section = original.section || "";
  const subsection = original.subsection || "";
  return {
    ...original,
    id: newId,
    section,
    subsection,
    order,
    subtaskParentId: parentId,
    completed: false,
    completedAt: null,
    completedOccurrences: [],
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: [],
    lastScheduledRun: null,
    reminders: []
  };
}

export function buildDuplicateTasks(originals, tasksCache) {
  if (!Array.isArray(originals) || originals.length === 0) {return [];}
  const rootId = originals[0].id;
  const byId = new Map(originals.map((task) => [task.id, task]));
  const kept = originals.filter((task) => task.id === rootId || !task.completed);
  const keptSet = new Set(kept.map((task) => task.id));
  const idMap = buildDuplicateMap(kept);
  const tasksWithNew = [...(tasksCache || [])];
  return kept.map((original) => {
    const parentId = resolveKeptParentId(original, rootId, keptSet, byId, idMap);
    const section = original.section || "";
    const subsection = original.subsection || "";
    const parentTask = parentId ? tasksWithNew.find((task) => task.id === parentId) : null;
    const order = parentTask
      ? getNextSubtaskOrder(parentTask, section, subsection, tasksWithNew)
      : getNextOrder(section, subsection, tasksWithNew);
    const clone = buildDuplicateTask(original, parentId, order, idMap.get(original.id));
    tasksWithNew.push(clone);
    return clone;
  });
}
