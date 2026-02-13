import {
  buildCompletedOccurrenceStore,
  isOccurrenceCompleted
} from "./completion-utils.js";
import { buildTaskMap } from "./sequential-utils.js";

function buildCompletedStoreByTask(tasks) {
  const storeByTaskId = new Map();
  (tasks || []).forEach((task) => {
    if (!task?.id) {return;}
    storeByTaskId.set(task.id, buildCompletedOccurrenceStore(task.completedOccurrences));
  });
  return storeByTaskId;
}

function isRepeatTask(task) {
  return Boolean(task?.repeat && task.repeat.type && task.repeat.type !== "none");
}

function shouldKeepPinnedPlacement(placement, taskById, completedStoreByTaskId) {
  if (!placement?.taskId) {return false;}
  const task = taskById.get(placement.taskId);
  if (!task || task.completed) {return false;}
  if (!isRepeatTask(task)) {return true;}
  const start = placement.start instanceof Date ? placement.start : new Date(placement.start);
  if (Number.isNaN(start.getTime())) {return false;}
  const completedStore = completedStoreByTaskId.get(task.id);
  return !isOccurrenceCompleted(completedStore, start, task.repeat);
}

function normalizeIdCollection(values) {
  if (!values) {return new Set();}
  if (values instanceof Set) {return new Set(values);}
  if (Array.isArray(values)) {return new Set(values);}
  return new Set([values]);
}

function resolveTaskIdFromOccurrenceId(occurrenceId) {
  if (typeof occurrenceId !== "string" || !occurrenceId.trim()) {return null;}
  const localKeyMatch = occurrenceId.match(/^(.*)-\d{4}-\d{2}-\d{2}$/);
  if (!localKeyMatch || !localKeyMatch[1]) {return null;}
  return localKeyMatch[1];
}

export function filterPinnedInputs(tasks, pinnedPlacements, pinnedOccurrenceIds, pinnedTaskIds) {
  const taskById = buildTaskMap(tasks);
  const completedStoreByTaskId = buildCompletedStoreByTask(tasks);
  const filteredPlacements = (pinnedPlacements || []).filter((placement) =>
    shouldKeepPinnedPlacement(placement, taskById, completedStoreByTaskId)
  );
  const filteredOccurrenceIds = Array.from(
    Array.from(normalizeIdCollection(pinnedOccurrenceIds)).filter((occurrenceId) => {
      const taskId = resolveTaskIdFromOccurrenceId(occurrenceId);
      if (!taskId) {return true;}
      const task = taskById.get(taskId);
      return Boolean(task && !task.completed);
    })
  );
  const filteredTaskIds = Array.from(
    Array.from(normalizeIdCollection(pinnedTaskIds)).filter((taskId) => {
      const task = taskById.get(taskId);
      return Boolean(task && !task.completed);
    })
  );
  return {
    filteredPlacements,
    filteredOccurrenceIds,
    filteredTaskIds
  };
}
