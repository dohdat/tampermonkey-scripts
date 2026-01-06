import { DEFAULT_SETTINGS, saveTask } from "./db.js";
import { getContainerKey, getTaskAndDescendants, sortTasksByOrder, uuid } from "./utils.js";

export function computeTaskReorderUpdates(
  tasks,
  movedTaskId,
  targetSection,
  targetSubsection,
  dropBeforeId
) {
  const movedTask = tasks.find((t) => t.id === movedTaskId);
  if (!movedTask) return { updates: [], changed: false };
  const movedSubtree = getTaskAndDescendants(movedTaskId, tasks);
  const movedIds = new Set(movedSubtree.map((t) => t.id));
  const sourceKey = getContainerKey(movedTask.section, movedTask.subsection);
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const remainingSource = sortTasksByOrder(
    tasks.filter(
      (t) =>
        getContainerKey(t.section, t.subsection) === sourceKey && !movedIds.has(t.id)
    )
  );
  const destinationExisting =
    sourceKey === targetKey
      ? remainingSource
      : sortTasksByOrder(
          tasks.filter(
            (t) =>
              getContainerKey(t.section, t.subsection) === targetKey && !movedIds.has(t.id)
          )
        );
  const destinationList = [...destinationExisting];
  const cleanedDropBeforeId = dropBeforeId && !movedIds.has(dropBeforeId) ? dropBeforeId : null;
  const insertAtCandidate =
    cleanedDropBeforeId && cleanedDropBeforeId !== movedTaskId
      ? destinationList.findIndex((t) => t.id === cleanedDropBeforeId)
      : -1;
  const insertAt = insertAtCandidate >= 0 ? insertAtCandidate : destinationList.length;
  const movedBlock = sortTasksByOrder(movedSubtree).map((task) => ({
    ...task,
    section: targetSection,
    subsection: targetSubsection
  }));
  destinationList.splice(insertAt, 0, ...movedBlock);
  const updates = [];
  const assignOrders = (list, section, subsection) => {
    list.forEach((task, index) => {
      const desiredOrder = index + 1;
      if (
        task.section !== section ||
        (task.subsection || "") !== (subsection || "") ||
        task.order !== desiredOrder
      ) {
        updates.push({ ...task, section, subsection, order: desiredOrder });
      }
    });
  };
  if (sourceKey === targetKey) {
    assignOrders(destinationList, targetSection, targetSubsection);
  } else {
    assignOrders(remainingSource, movedTask.section || "", movedTask.subsection || "");
    assignOrders(destinationList, targetSection, targetSubsection);
  }
  return { updates, changed: updates.length > 0 };
}

export async function ensureTaskIds(tasks) {
  const updates = [];
  const orderTracker = new Map();
  const withIds = tasks.map((task) => {
    let changed = false;
    let nextTask = task;
    if (!nextTask.id) {
      nextTask = { ...nextTask, id: uuid() };
      changed = true;
    }
    if (nextTask.minBlockMin === undefined) {
      nextTask = { ...nextTask, minBlockMin: 30 };
      changed = true;
    }
    if (nextTask.subtaskParentId === undefined) {
      nextTask = { ...nextTask, subtaskParentId: null };
      changed = true;
    }
    if (nextTask.startFrom === undefined) {
      nextTask = { ...nextTask, startFrom: null };
      changed = true;
    }
    if (nextTask.completed === undefined) {
      nextTask = { ...nextTask, completed: false };
      changed = true;
    }
    if (nextTask.completedAt === undefined) {
      nextTask = { ...nextTask, completedAt: null };
      changed = true;
    }
    if (!nextTask.repeat) {
      nextTask = { ...nextTask, repeat: { type: "none" } };
      changed = true;
    }
    if (!nextTask.scheduleStatus) {
      nextTask = { ...nextTask, scheduleStatus: "unscheduled" };
      changed = true;
    }
    const key = getContainerKey(nextTask.section, nextTask.subsection);
    const numericOrder = Number(nextTask.order);
    const hasOrder = Number.isFinite(numericOrder);
    const currentMax = orderTracker.get(key) || 0;
    if (!hasOrder) {
      const assignedOrder = currentMax + 1;
      orderTracker.set(key, assignedOrder);
      nextTask = { ...nextTask, order: assignedOrder };
      changed = true;
    } else {
      orderTracker.set(key, Math.max(currentMax, numericOrder));
      if (nextTask.order !== numericOrder) {
        nextTask = { ...nextTask, order: numericOrder };
        changed = true;
      }
    }
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

export async function migrateSectionsAndTasks(tasks, settings) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const sectionsInput = Array.isArray(mergedSettings.sections) ? mergedSettings.sections : [];
  const sectionIdMap = new Map();
  const sectionNameMap = new Map();
  const sections = [];

  const addSection = (name, id, favorite = false) => {
    const finalId = id || uuid();
    if (sectionIdMap.has(finalId)) return sectionIdMap.get(finalId);
    const section = { id: finalId, name: name || "Untitled section", favorite: Boolean(favorite) };
    sectionIdMap.set(finalId, section);
    if (section.name) sectionNameMap.set(section.name.toLowerCase(), finalId);
    sections.push(section);
    return section;
  };

  sectionsInput.forEach((entry) => {
    if (entry && typeof entry === "object" && entry.id) {
      addSection(entry.name, entry.id, entry.favorite);
    } else if (typeof entry === "string") {
      addSection(entry, undefined, false);
    }
  });
  if (sections.length === 0) {
    DEFAULT_SETTINGS.sections.forEach((s) => addSection(s.name, s.id, s.favorite));
  }

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
          if (sub.name) nameMap.set(sub.name.toLowerCase(), sub.id);
        }
      });
      subsectionIdMaps[sectionId] = idMap;
      subsectionNameMaps[sectionId] = nameMap;
    }
  };

  Object.entries(subsectionsRaw).forEach(([key, list]) => {
    const targetSectionId = sectionIdMap.has(key)
      ? key
      : sectionNameMap.get((key || "").toLowerCase());
    if (!targetSectionId) return;
    ensureSubsectionMaps(targetSectionId);
    (list || []).forEach((item) => {
      const isObj = typeof item === "object" && item !== null;
      const name = typeof item === "string" ? item : item?.name || "Untitled subsection";
      const id = isObj && item?.id ? item.id : uuid();
      const favorite = isObj && item?.favorite ? Boolean(item.favorite) : false;
      const parentId = isObj && item?.parentId ? item.parentId : "";
      const template = isObj && item?.template ? { ...item.template } : undefined;
      if (subsectionIdMaps[targetSectionId].has(id)) return;
      const sub = { id, name, favorite, parentId, ...(template ? { template } : {}) };
      subsections[targetSectionId].push(sub);
      subsectionIdMaps[targetSectionId].set(id, sub);
      if (name) subsectionNameMaps[targetSectionId].set(name.toLowerCase(), id);
    });
  });

  sections.forEach((section) => ensureSubsectionMaps(section.id));

  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const updatedTasks = [];
  const taskUpdates = [];

  tasks.forEach((task) => {
    let newSectionId = "";
    if (task.section) {
      if (sectionIdMap.has(task.section)) {
        newSectionId = task.section;
      } else {
        const fromName = sectionNameMap.get(task.section.toLowerCase?.() || task.section);
        if (fromName) {
          newSectionId = fromName;
        } else {
          newSectionId = addSection(task.section).id;
        }
      }
    }
    ensureSubsectionMaps(newSectionId);
    let newSubsectionId = "";
    if (task.subsection && newSectionId) {
      const idMap = subsectionIdMaps[newSectionId];
      const nameMap = subsectionNameMaps[newSectionId];
      if (idMap.has(task.subsection)) {
        newSubsectionId = task.subsection;
      } else {
        const fromName = nameMap.get(task.subsection.toLowerCase?.() || task.subsection);
        if (fromName) {
          newSubsectionId = fromName;
        } else {
          const subId = uuid();
          const sub = { id: subId, name: task.subsection, favorite: false };
          subsections[newSectionId].push(sub);
          idMap.set(subId, sub);
          if (sub.name) nameMap.set(sub.name.toLowerCase(), subId);
          newSubsectionId = subId;
        }
      }
    }
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

  const normalizedSettings = {
    ...mergedSettings,
    sections,
    subsections
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
  const { saveSettings } = await import("./db.js");
  await saveSettings(settings);
}
