import {
  getNextOrder,
  getNextSubtaskOrder,
  normalizeSubtaskScheduleMode,
  uuid
} from "../utils.js";

function orFallback(value, fallback) {
  return value || fallback;
}

function toPositiveNumberOr(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeTemplateInput(template) {
  const safe = template || {};
  return {
    id: orFallback(safe.id, ""),
    title: orFallback(safe.title, ""),
    link: orFallback(safe.link, ""),
    durationMin: toPositiveNumberOr(safe.durationMin, 30),
    minBlockMin: toPositiveNumberOr(safe.minBlockMin, 30),
    priority: toPositiveNumberOr(safe.priority, 3),
    deadline: orFallback(safe.deadline, null),
    startFrom: orFallback(safe.startFrom, null),
    repeat: orFallback(safe.repeat, { type: "none" }),
    timeMapIds: toArray(safe.timeMapIds),
    subtaskParentId: orFallback(safe.subtaskParentId, null),
    subtaskScheduleMode: normalizeSubtaskScheduleMode(safe.subtaskScheduleMode),
    subtasks: toArray(safe.subtasks).map((sub) => ({ ...sub }))
  };
}

function buildTaskFromTemplate(template, overrides) {
  return {
    id: overrides.id,
    title: template.title || "Untitled task",
    durationMin: template.durationMin,
    minBlockMin: template.minBlockMin,
    priority: template.priority,
    deadline: template.deadline || null,
    startFrom: template.startFrom || null,
    link: template.link || "",
    timeMapIds: Array.isArray(template.timeMapIds) ? [...template.timeMapIds] : [],
    section: overrides.sectionId || "",
    subsection: overrides.subsectionId || "",
    order: overrides.order,
    subtaskParentId: overrides.subtaskParentId || null,
    subtaskScheduleMode: normalizeSubtaskScheduleMode(template.subtaskScheduleMode),
    repeat: template.repeat || { type: "none" },
    completed: false,
    completedAt: null,
    completedOccurrences: [],
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
}

export function buildTasksFromTemplate(
  templateInput,
  sectionId,
  subsectionId,
  tasks = [],
  uuidFn = uuid,
  options = {}
) {
  if (!templateInput) {return [];}
  const includeParent = options.includeParent !== false;
  const template = normalizeTemplateInput(templateInput);
  const parentId = uuidFn();
  const parentOrder = getNextOrder(sectionId, subsectionId, tasks);
  const parentTask = buildTaskFromTemplate(template, {
    id: parentId,
    sectionId,
    subsectionId,
    order: parentOrder
  });
  const tasksForOrder = [...tasks, parentTask];
  const normalizedSubtasks = template.subtasks.map((sub) => normalizeTemplateInput(sub));
  const subtaskIds = new Set(normalizedSubtasks.map((sub) => sub.id).filter(Boolean));
  const childrenByParent = normalizedSubtasks.reduce((map, subtask) => {
    const parentKey =
      subtask.subtaskParentId && subtaskIds.has(subtask.subtaskParentId)
        ? subtask.subtaskParentId
        : "";
    if (!map.has(parentKey)) {map.set(parentKey, []);}
    map.get(parentKey).push(subtask);
    return map;
  }, new Map());
  const created = [];
  const visited = new Set();
  const buildSubtasks = (templateParentId, parentTaskInstance, inheritedTimeMapIds) => {
    const children = childrenByParent.get(templateParentId || "") || [];
    children.forEach((childTemplate) => {
      if (childTemplate.id && visited.has(childTemplate.id)) {return;}
      if (childTemplate.id) {visited.add(childTemplate.id);}
      if (!Array.isArray(childTemplate.timeMapIds) || childTemplate.timeMapIds.length === 0) {
        childTemplate.timeMapIds = [...(inheritedTimeMapIds || [])];
      }
      const id = uuidFn();
      const order = parentTaskInstance
        ? getNextSubtaskOrder(parentTaskInstance, sectionId, subsectionId, tasksForOrder)
        : getNextOrder(sectionId, subsectionId, tasksForOrder);
      const subtask = buildTaskFromTemplate(childTemplate, {
        id,
        sectionId,
        subsectionId,
        order,
        subtaskParentId: parentTaskInstance ? parentTaskInstance.id : null
      });
      tasksForOrder.push(subtask);
      created.push(subtask);
      if (childTemplate.id) {
        buildSubtasks(childTemplate.id, subtask, subtask.timeMapIds);
      }
    });
  };
  if (includeParent) {
    buildSubtasks("", parentTask, parentTask.timeMapIds);
    return [parentTask, ...created];
  }
  buildSubtasks("", null, template.timeMapIds);
  return [...created];
}

export function buildSubtasksFromTemplateForParent(
  templateInput,
  parentTask,
  tasks = [],
  uuidFn = uuid
) {
  if (!templateInput || !parentTask) {return [];}
  const template = normalizeTemplateInput(templateInput);
  const normalizedSubtasks = template.subtasks.map((sub) => normalizeTemplateInput(sub));
  const subtaskIds = new Set(normalizedSubtasks.map((sub) => sub.id).filter(Boolean));
  const childrenByParent = normalizedSubtasks.reduce((map, subtask) => {
    const parentKey =
      subtask.subtaskParentId && subtaskIds.has(subtask.subtaskParentId)
        ? subtask.subtaskParentId
        : "";
    if (!map.has(parentKey)) {map.set(parentKey, []);}
    map.get(parentKey).push(subtask);
    return map;
  }, new Map());
  const created = [];
  const visited = new Set();
  const tasksForOrder = [...tasks];
  const buildSubtasks = (templateParentId, parentTaskInstance, inheritedTimeMapIds) => {
    const children = childrenByParent.get(templateParentId || "") || [];
    children.forEach((childTemplate) => {
      if (childTemplate.id && visited.has(childTemplate.id)) {return;}
      if (childTemplate.id) {visited.add(childTemplate.id);}
      if (!Array.isArray(childTemplate.timeMapIds) || childTemplate.timeMapIds.length === 0) {
        childTemplate.timeMapIds = [...(inheritedTimeMapIds || [])];
      }
      const id = uuidFn();
      const order = getNextSubtaskOrder(
        parentTaskInstance,
        parentTask.section || "",
        parentTask.subsection || "",
        tasksForOrder
      );
      const subtask = buildTaskFromTemplate(childTemplate, {
        id,
        sectionId: parentTask.section || "",
        subsectionId: parentTask.subsection || "",
        order,
        subtaskParentId: parentTaskInstance.id
      });
      tasksForOrder.push(subtask);
      created.push(subtask);
      if (childTemplate.id) {
        buildSubtasks(childTemplate.id, subtask, subtask.timeMapIds);
      }
    });
  };
  buildSubtasks("", parentTask, parentTask.timeMapIds || []);
  return created;
}
