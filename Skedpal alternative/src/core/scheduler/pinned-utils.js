import { applyPlacementsToSlots } from "./slots-utils.js";

export function normalizeIdSet(values) {
  if (!values) {return new Set();}
  if (values instanceof Set) {return new Set(values);}
  if (Array.isArray(values)) {return new Set(values);}
  return new Set([values]);
}

export function normalizePinnedPlacements(pinnedPlacements = []) {
  if (!Array.isArray(pinnedPlacements)) {return [];}
  return pinnedPlacements
    .map((placement) => {
      if (!placement) {return null;}
      const start = placement.start instanceof Date ? placement.start : new Date(placement.start);
      const end = placement.end instanceof Date ? placement.end : new Date(placement.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
      if (end <= start) {return null;}
      return {
        ...placement,
        start,
        end,
        pinned: true
      };
    })
    .filter(Boolean);
}

export function buildPinnedPlacementMap(placements = []) {
  const byOccurrence = new Map();
  placements.forEach((placement) => {
    if (!placement?.occurrenceId) {return;}
    if (!byOccurrence.has(placement.occurrenceId)) {
      byOccurrence.set(placement.occurrenceId, []);
    }
    byOccurrence.get(placement.occurrenceId).push(placement);
  });
  byOccurrence.forEach((list) => {
    list.sort((a, b) => a.start - b.start);
  });
  return byOccurrence;
}

export function buildPinnedTaskPlacementMap(placements = []) {
  const byTask = new Map();
  placements.forEach((placement) => {
    if (!placement?.taskId) {return;}
    if (!byTask.has(placement.taskId)) {
      byTask.set(placement.taskId, []);
    }
    byTask.get(placement.taskId).push(placement);
  });
  byTask.forEach((list) => {
    list.sort((a, b) => a.start - b.start);
  });
  return byTask;
}

export function buildPinnedSchedulingState({
  pinnedPlacements,
  pinnedOccurrenceIds,
  pinnedTaskIds,
  windows
}) {
  const pinnedPlacementList = normalizePinnedPlacements(pinnedPlacements);
  const pinnedByOccurrence = buildPinnedPlacementMap(pinnedPlacementList);
  const pinnedByTaskId = buildPinnedTaskPlacementMap(pinnedPlacementList);
  const pinnedOccurrenceSet = normalizeIdSet(pinnedOccurrenceIds);
  pinnedByOccurrence.forEach((_placements, occurrenceId) => {
    pinnedOccurrenceSet.add(occurrenceId);
  });
  const pinnedTaskIdSet = normalizeIdSet(pinnedTaskIds);
  const slots = applyPlacementsToSlots(windows, pinnedPlacementList);
  const scheduled = [...pinnedPlacementList];
  return {
    pinnedPlacementList,
    pinnedByOccurrence,
    pinnedByTaskId,
    pinnedOccurrenceSet,
    pinnedTaskIdSet,
    slots,
    scheduled
  };
}
