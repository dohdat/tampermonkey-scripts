import { DEFAULT_SETTINGS, saveTask } from "../../data/db.js";
import {
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_REPEAT,
  TASK_STATUS_UNSCHEDULED
} from "../constants.js";
import { getContainerKey, getTaskAndDescendants, sortTasksByOrder, uuid } from "../utils.js";

function buildMovedBlock(movedSubtree, targetSection, targetSubsection) {
  return sortTasksByOrder(movedSubtree).map((task) => ({
    ...task,
    section: targetSection,
    subsection: targetSubsection
  }));
}

function getDestinationExisting(tasks, sourceKey, targetKey, movedIds) {
  const filtered = tasks.filter(
    (t) => getContainerKey(t.section, t.subsection) === targetKey && !movedIds.has(t.id)
  );
  return sortTasksByOrder(filtered);
}

function assignOrdersToUpdates(list, section, subsection, originalById, updates) {
  list.forEach((task, index) => {
    const desiredOrder = index + 1;
    const original = originalById.get(task.id);
    if (
      !original ||
      (original.section || "") !== (section || "") ||
      (original.subsection || "") !== (subsection || "") ||
      original.order !== desiredOrder
    ) {
      updates.push({ ...task, section, subsection, order: desiredOrder });
    }
  });
}

function resolveDestinationExisting(sourceKey, targetKey, remainingSource, tasks, movedIds) {
  if (sourceKey === targetKey) {return remainingSource;}
  return getDestinationExisting(tasks, sourceKey, targetKey, movedIds);
}

function normalizeDropBeforeId(dropBeforeId, movedIds, movedTaskId) {
  if (!dropBeforeId || movedIds.has(dropBeforeId) || dropBeforeId === movedTaskId) {
    return null;
  }
  return dropBeforeId;
}

function normalizeDropBeforeIdForMultiple(dropBeforeId, movedIds) {
  if (!dropBeforeId || movedIds.has(dropBeforeId)) {
    return null;
  }
  return dropBeforeId;
}

function resolveInsertIndex(destinationList, dropBeforeId) {
  if (!dropBeforeId) {return destinationList.length;}
  const index = destinationList.findIndex((t) => t.id === dropBeforeId);
  return index >= 0 ? index : destinationList.length;
}

export function computeTaskReorderUpdates(
  tasks,
  movedTaskId,
  targetSection,
  targetSubsection,
  dropBeforeId
) {
  const movedTask = tasks.find((t) => t.id === movedTaskId);
  if (!movedTask) {return { updates: [], changed: false };}
  const movedSubtree = getTaskAndDescendants(movedTaskId, tasks);
  const movedIds = new Set(movedSubtree.map((t) => t.id));
  const originalById = new Map(tasks.map((task) => [task.id, task]));
  const sourceKey = getContainerKey(movedTask.section, movedTask.subsection);
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const remainingSource = sortTasksByOrder(
    tasks.filter(
      (t) =>
        getContainerKey(t.section, t.subsection) === sourceKey && !movedIds.has(t.id)
    )
  );
  const destinationExisting = resolveDestinationExisting(
    sourceKey,
    targetKey,
    remainingSource,
    tasks,
    movedIds
  );
  const destinationList = [...destinationExisting];
  const cleanedDropBeforeId = normalizeDropBeforeId(dropBeforeId, movedIds, movedTaskId);
  const insertAt = resolveInsertIndex(destinationList, cleanedDropBeforeId);
  const movedBlock = buildMovedBlock(movedSubtree, targetSection, targetSubsection);
  destinationList.splice(insertAt, 0, ...movedBlock);
  const updates = [];
  if (sourceKey === targetKey) {
    assignOrdersToUpdates(destinationList, targetSection, targetSubsection, originalById, updates);
  } else {
    assignOrdersToUpdates(
      remainingSource,
      movedTask.section || "",
      movedTask.subsection || "",
      originalById,
      updates
    );
    assignOrdersToUpdates(destinationList, targetSection, targetSubsection, originalById, updates);
  }
  return { updates, changed: updates.length > 0 };
}

function getMovedRootIds(movedTaskIds, tasks) {
  const movedSet = new Set(movedTaskIds);
  const byId = new Map((tasks || []).map((task) => [task.id, task]));
  return movedTaskIds.filter((id) => {
    const task = byId.get(id);
    if (!task) {return false;}
    let parentId = task.subtaskParentId || "";
    while (parentId) {
      if (movedSet.has(parentId)) {return false;}
      parentId = byId.get(parentId)?.subtaskParentId || "";
    }
    return true;
  });
}

function buildMultiMoveRoots(tasks, movedTaskIds) {
  if (!Array.isArray(movedTaskIds) || movedTaskIds.length === 0) {return null;}
  const byId = new Map((tasks || []).map((task) => [task.id, task]));
  const rootIds = getMovedRootIds(movedTaskIds, tasks);
  if (!rootIds.length) {return null;}
  const rootTasks = rootIds.map((id) => byId.get(id)).filter(Boolean);
  if (!rootTasks.length) {return null;}
  const sourceKey = getContainerKey(rootTasks[0].section, rootTasks[0].subsection);
  const hasMixedSources = rootTasks.some(
    (task) => getContainerKey(task.section, task.subsection) !== sourceKey
  );
  if (hasMixedSources) {return null;}
  return { rootIds, rootTasks, sourceKey };
}

function buildMultiMoveBlock(tasks, rootIds, targetSection, targetSubsection) {
  const movedSubtrees = rootIds.map((id) => getTaskAndDescendants(id, tasks));
  const movedIds = new Set(movedSubtrees.flat().map((task) => task.id));
  const movedBlock = movedSubtrees.flatMap((subtree) =>
    buildMovedBlock(subtree, targetSection, targetSubsection)
  );
  return { movedIds, movedBlock };
}

function buildMultiMoveLists(tasks, sourceKey, targetKey, movedIds) {
  const remainingSource = sortTasksByOrder(
    (tasks || []).filter(
      (task) =>
        getContainerKey(task.section, task.subsection) === sourceKey &&
        !movedIds.has(task.id)
    )
  );
  const destinationExisting = resolveDestinationExisting(
    sourceKey,
    targetKey,
    remainingSource,
    tasks,
    movedIds
  );
  return { remainingSource, destinationExisting };
}

export function computeTaskReorderUpdatesForMultiple(
  tasks,
  movedTaskIds,
  targetSection,
  targetSubsection,
  dropBeforeId
) {
  const roots = buildMultiMoveRoots(tasks, movedTaskIds);
  if (!roots) {return { updates: [], changed: false };}
  const { rootIds, rootTasks, sourceKey } = roots;
  const { movedIds, movedBlock } = buildMultiMoveBlock(
    tasks,
    rootIds,
    targetSection,
    targetSubsection
  );
  const originalById = new Map((tasks || []).map((task) => [task.id, task]));
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const { remainingSource, destinationExisting } = buildMultiMoveLists(
    tasks,
    sourceKey,
    targetKey,
    movedIds
  );
  const destinationList = [...destinationExisting];
  const cleanedDropBeforeId = normalizeDropBeforeIdForMultiple(dropBeforeId, movedIds);
  const insertAt = resolveInsertIndex(destinationList, cleanedDropBeforeId);
  destinationList.splice(insertAt, 0, ...movedBlock);
  const updates = [];
  if (sourceKey === targetKey) {
    assignOrdersToUpdates(destinationList, targetSection, targetSubsection, originalById, updates);
  } else {
    assignOrdersToUpdates(
      remainingSource,
      rootTasks[0].section || "",
      rootTasks[0].subsection || "",
      originalById,
      updates
    );
    assignOrdersToUpdates(destinationList, targetSection, targetSubsection, originalById, updates);
  }
  return { updates, changed: updates.length > 0 };
}

export async function ensureTaskIds(tasks) {
  const updates = [];
  const orderTracker = new Map();
  const withIds = tasks.map((task) => {
    let nextTask = task;
    let changed = false;
    const defaultsResult = applyTaskDefaults(nextTask);
    nextTask = defaultsResult.task;
    changed = defaultsResult.changed;
    const orderResult = ensureTaskOrder(nextTask, orderTracker);
    nextTask = orderResult.task;
    changed = changed || orderResult.changed;
    if (changed) {
      updates.push(saveTask(nextTask));
    }
    return nextTask;
  });
  if (updates.length) {
    await Promise.all(updates);
  }
  return withIds;
}

function applyTaskDefaults(task) {
  let nextTask = task;
  let changed = false;
  const defaultFields = [
    { key: "id", value: uuid(), condition: (t) => !t.id },
    {
      key: "minBlockMin",
      value: DEFAULT_TASK_MIN_BLOCK_MIN,
      condition: (t) => t.minBlockMin === undefined
    },
    { key: "subtaskParentId", value: null, condition: (t) => t.subtaskParentId === undefined },
    { key: "startFrom", value: null, condition: (t) => t.startFrom === undefined },
    { key: "completed", value: false, condition: (t) => t.completed === undefined },
    { key: "completedAt", value: null, condition: (t) => t.completedAt === undefined }
  ];
  defaultFields.forEach((field) => {
    if (field.condition(nextTask)) {
      nextTask = { ...nextTask, [field.key]: field.value };
      changed = true;
    }
  });
  if (!Array.isArray(nextTask.completedOccurrences)) {
    nextTask = { ...nextTask, completedOccurrences: [] };
    changed = true;
  }
  if (!Array.isArray(nextTask.reminders)) {
    nextTask = { ...nextTask, reminders: [] };
    changed = true;
  }
  if (!nextTask.repeat) {
    nextTask = { ...nextTask, repeat: { ...DEFAULT_TASK_REPEAT } };
    changed = true;
  }
  if (!nextTask.scheduleStatus) {
    nextTask = { ...nextTask, scheduleStatus: TASK_STATUS_UNSCHEDULED };
    changed = true;
  }
  return { task: nextTask, changed };
}

function ensureTaskOrder(task, orderTracker) {
  const key = getContainerKey(task.section, task.subsection);
  const numericOrder = Number(task.order);
  const hasOrder = Number.isFinite(numericOrder);
  const currentMax = orderTracker.get(key) || 0;
  if (!hasOrder) {
    const assignedOrder = currentMax + 1;
    orderTracker.set(key, assignedOrder);
    return { task: { ...task, order: assignedOrder }, changed: true };
  }
  orderTracker.set(key, Math.max(currentMax, numericOrder));
  if (task.order !== numericOrder) {
    return { task: { ...task, order: numericOrder }, changed: true };
  }
  return { task, changed: false };
}

function buildSectionMaps(mergedSettings) {
  const sectionsInput = Array.isArray(mergedSettings.sections) ? mergedSettings.sections : [];
  const sectionIdMap = new Map();
  const sectionNameMap = new Map();
  const sections = [];
  const addSection = (name, id, favorite = false, favoriteOrder = null) => {
    const finalId = id || uuid();
    if (sectionIdMap.has(finalId)) {return sectionIdMap.get(finalId);}
    const section = {
      id: finalId,
      name: name || "Untitled section",
      favorite: Boolean(favorite),
      favoriteOrder: Number.isFinite(Number(favoriteOrder)) ? Number(favoriteOrder) : null
    };
    sectionIdMap.set(finalId, section);
    if (section.name) {sectionNameMap.set(section.name.toLowerCase(), finalId);}
    sections.push(section);
    return section;
  };
  sectionsInput.forEach((entry) => {
    if (entry && typeof entry === "object" && entry.id) {
      addSection(entry.name, entry.id, entry.favorite, entry.favoriteOrder);
    } else if (typeof entry === "string") {
      addSection(entry, undefined, false);
    }
  });
  if (sections.length === 0) {
    DEFAULT_SETTINGS.sections.forEach((s) => addSection(s.name, s.id, s.favorite));
  }
  return { sections, sectionIdMap, sectionNameMap, addSection };
}

function buildSubsectionMaps(mergedSettings, sectionIdMap, sectionNameMap) {
  const subsectionsRaw = mergedSettings.subsections || {};
  const subsections = {};
  const subsectionIdMaps = {};
  const subsectionNameMaps = {};
  const ensureSubsectionMaps = (sectionId) => {
    if (!subsections[sectionId]) {
      subsections[sectionId] = [];
    }
    if (!subsectionIdMaps[sectionId]) {
      const idMap = new Map();
      const nameMap = new Map();
      (subsections[sectionId] || []).forEach((sub) => {
        if (sub?.id) {
          idMap.set(sub.id, sub);
          if (sub.name) {nameMap.set(sub.name.toLowerCase(), sub.id);}
        }
      });
      subsectionIdMaps[sectionId] = idMap;
      subsectionNameMaps[sectionId] = nameMap;
    }
  };
  Object.entries(subsectionsRaw).forEach(([key, list]) => {
    const targetSectionId = resolveSubsectionSectionId(key, sectionIdMap, sectionNameMap);
    if (!targetSectionId) {return;}
    ensureSubsectionMaps(targetSectionId);
    (list || []).forEach((item) =>
      addSubsectionEntry(item, targetSectionId, subsections, subsectionIdMaps, subsectionNameMaps)
    );
  });
  return { subsections, subsectionIdMaps, subsectionNameMaps, ensureSubsectionMaps };
}

function resolveSubsectionSectionId(key, sectionIdMap, sectionNameMap) {
  if (sectionIdMap.has(key)) {return key;}
  return sectionNameMap.get((key || "").toLowerCase()) || "";
}

function getSubsectionName(item) {
  if (typeof item === "string") {return item;}
  if (item && typeof item === "object" && item.name) {return item.name;}
  return "Untitled subsection";
}

function getSubsectionId(item) {
  if (item && typeof item === "object" && item.id) {return item.id;}
  return uuid();
}

function getSubsectionFavorite(item) {
  return Boolean(item && typeof item === "object" && item.favorite);
}

function getSubsectionFavoriteOrder(item) {
  if (!item || typeof item !== "object") {return null;}
  const value = Number(item.favoriteOrder);
  return Number.isFinite(value) ? value : null;
}

function getSubsectionParentId(item) {
  return item && typeof item === "object" && item.parentId ? item.parentId : "";
}

function getSubsectionTemplate(item) {
  if (item && typeof item === "object" && item.template) {
    return { ...item.template };
  }
  return undefined;
}

function normalizeSubsectionItem(item) {
  return {
    name: getSubsectionName(item),
    id: getSubsectionId(item),
    favorite: getSubsectionFavorite(item),
    favoriteOrder: getSubsectionFavoriteOrder(item),
    parentId: getSubsectionParentId(item),
    template: getSubsectionTemplate(item)
  };
}

function addSubsectionEntry(item, targetSectionId, subsections, subsectionIdMaps, subsectionNameMaps) {
  const { name, id, favorite, favoriteOrder, parentId, template } = normalizeSubsectionItem(item);
  if (subsectionIdMaps[targetSectionId].has(id)) {return;}
  const sub = {
    id,
    name,
    favorite,
    favoriteOrder: Number.isFinite(favoriteOrder) ? favoriteOrder : null,
    parentId,
    ...(template ? { template } : {})
  };
  subsections[targetSectionId].push(sub);
  subsectionIdMaps[targetSectionId].set(id, sub);
  if (name) {subsectionNameMaps[targetSectionId].set(name.toLowerCase(), id);}
}

function normalizeTaskSections(tasks, sectionMaps, subsectionMaps) {
  const { sectionIdMap, sectionNameMap, addSection } = sectionMaps;
  const { subsections, subsectionIdMaps, subsectionNameMaps, ensureSubsectionMaps } =
    subsectionMaps;
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const updatedTasks = [];
  const taskUpdates = [];
  tasks.forEach((task) => {
    const newSectionId = resolveTaskSectionId(task, sectionIdMap, sectionNameMap, addSection);
    ensureSubsectionMaps(newSectionId);
    const newSubsectionId = resolveTaskSubsectionId(
      task,
      newSectionId,
      subsectionIdMaps,
      subsectionNameMaps,
      subsections
    );
    const updated = { ...task, section: newSectionId, subsection: newSubsectionId };
    updatedTasks.push(updated);
    const original = tasksById.get(task.id);
    if (
      !original ||
      original.section !== newSectionId ||
      (original.subsection || "") !== newSubsectionId
    ) {
      taskUpdates.push(saveTask(updated));
    }
  });
  return { updatedTasks, taskUpdates };
}

function resolveTaskSectionId(task, sectionIdMap, sectionNameMap, addSection) {
  if (!task.section) {return "";}
  if (sectionIdMap.has(task.section)) {return task.section;}
  const fromName = sectionNameMap.get(task.section.toLowerCase?.() || task.section);
  return fromName || addSection(task.section).id;
}

function resolveTaskSubsectionId(
  task,
  sectionId,
  subsectionIdMaps,
  subsectionNameMaps,
  subsections
) {
  if (!task.subsection || !sectionId) {return "";}
  const idMap = subsectionIdMaps[sectionId];
  const nameMap = subsectionNameMaps[sectionId];
  if (idMap.has(task.subsection)) {return task.subsection;}
  const fromName = nameMap.get(task.subsection.toLowerCase?.() || task.subsection);
  if (fromName) {return fromName;}
  const subId = uuid();
  const sub = { id: subId, name: task.subsection, favorite: false };
  subsections[sectionId].push(sub);
  idMap.set(subId, sub);
  if (sub.name) {nameMap.set(sub.name.toLowerCase(), subId);}
  return subId;
}

export async function migrateSectionsAndTasks(tasks, settings) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const sectionMaps = buildSectionMaps(mergedSettings);
  const subsectionMaps = buildSubsectionMaps(
    mergedSettings,
    sectionMaps.sectionIdMap,
    sectionMaps.sectionNameMap
  );
  sectionMaps.sections.forEach((section) => subsectionMaps.ensureSubsectionMaps(section.id));
  const { updatedTasks, taskUpdates } = normalizeTaskSections(tasks, sectionMaps, subsectionMaps);
  const normalizedSettings = {
    ...mergedSettings,
    sections: sectionMaps.sections,
    subsections: subsectionMaps.subsections
  };
  const settingsChanged = JSON.stringify(mergedSettings) !== JSON.stringify(normalizedSettings);
  if (settingsChanged) {
    await saveTaskSettings(normalizedSettings);
  }
  if (taskUpdates.length) {
    await Promise.all(taskUpdates);
  }
  return { tasks: updatedTasks, settings: normalizedSettings };
}

async function saveTaskSettings(settings) {
  const { saveSettings } = await import("../../data/db.js");
  await saveSettings(settings);
}
