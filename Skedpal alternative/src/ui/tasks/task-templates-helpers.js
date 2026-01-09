import {
  getNextOrder,
  getNextSubtaskOrder,
  getInheritedSubtaskFields,
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

function buildChildrenByParent(normalizedSubtasks) {
  const subtaskIds = new Set(normalizedSubtasks.map((sub) => sub.id).filter(Boolean));
  return normalizedSubtasks.reduce((map, subtask) => {
    const parentKey =
      subtask.subtaskParentId && subtaskIds.has(subtask.subtaskParentId)
        ? subtask.subtaskParentId
        : "";
    if (!map.has(parentKey)) {map.set(parentKey, []);}
    map.get(parentKey).push(subtask);
    return map;
  }, new Map());
}

function getTemplateChildren(childrenByParent, templateParentId) {
  return childrenByParent.get(templateParentId || "") || [];
}

function trackVisitedTemplate(childTemplate, visited) {
  if (!childTemplate.id) {return true;}
  if (visited.has(childTemplate.id)) {return false;}
  visited.add(childTemplate.id);
  return true;
}

function ensureTemplateTimeMaps(childTemplate, inheritedTimeMapIds) {
  if (!Array.isArray(childTemplate.timeMapIds) || childTemplate.timeMapIds.length === 0) {
    childTemplate.timeMapIds = [...(inheritedTimeMapIds || [])];
  }
}

function applyParentTaskOverrides(subtask, parentTask) {
  if (!parentTask) {return subtask;}
  const inherited = getInheritedSubtaskFields(parentTask);
  return {
    ...subtask,
    ...inherited,
    durationMin: Number(parentTask.durationMin) || subtask.durationMin,
    subtaskScheduleMode: normalizeSubtaskScheduleMode(parentTask.subtaskScheduleMode),
    repeat: parentTask.repeat || { type: "none" }
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

function buildTemplateSubtasks({
  childrenByParent,
  templateParentId,
  parentTaskInstance,
  inheritedTimeMapIds,
  sectionId,
  subsectionId,
  tasksForOrder,
  uuidFn,
  getOrderForChild,
  created,
  visited
}) {
  const children = getTemplateChildren(childrenByParent, templateParentId);
  children.forEach((childTemplate) => {
    if (!trackVisitedTemplate(childTemplate, visited)) {return;}
    ensureTemplateTimeMaps(childTemplate, inheritedTimeMapIds);
    const id = uuidFn();
    const order = getOrderForChild(parentTaskInstance, tasksForOrder);
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
      buildTemplateSubtasks({
        childrenByParent,
        templateParentId: childTemplate.id,
        parentTaskInstance: subtask,
        inheritedTimeMapIds: subtask.timeMapIds,
        sectionId,
        subsectionId,
        tasksForOrder,
        uuidFn,
        getOrderForChild,
        created,
        visited
      });
    }
  });
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
  const childrenByParent = buildChildrenByParent(normalizedSubtasks);
  const created = [];
  const visited = new Set();
  const getOrderForChild = (parentTaskInstance, tasksForOrderList) =>
    parentTaskInstance
      ? getNextSubtaskOrder(parentTaskInstance, sectionId, subsectionId, tasksForOrderList)
      : getNextOrder(sectionId, subsectionId, tasksForOrderList);
  if (includeParent) {
    buildTemplateSubtasks({
      childrenByParent,
      templateParentId: "",
      parentTaskInstance: parentTask,
      inheritedTimeMapIds: parentTask.timeMapIds,
      sectionId,
      subsectionId,
      tasksForOrder,
      uuidFn,
      getOrderForChild,
      created,
      visited
    });
    return [parentTask, ...created];
  }
  buildTemplateSubtasks({
    childrenByParent,
    templateParentId: "",
    parentTaskInstance: null,
    inheritedTimeMapIds: template.timeMapIds,
    sectionId,
    subsectionId,
    tasksForOrder,
    uuidFn,
    getOrderForChild,
    created,
    visited
  });
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
  const childrenByParent = buildChildrenByParent(normalizedSubtasks);
  const created = [];
  const visited = new Set();
  const tasksForOrder = [...tasks];
  const getOrderForChild = (parentTaskInstance, tasksForOrderList) =>
    getNextSubtaskOrder(
      parentTaskInstance,
      parentTask.section || "",
      parentTask.subsection || "",
      tasksForOrderList
    );
  buildTemplateSubtasks({
    childrenByParent,
    templateParentId: "",
    parentTaskInstance: parentTask,
    inheritedTimeMapIds: parentTask.timeMapIds || [],
    sectionId: parentTask.section || "",
    subsectionId: parentTask.subsection || "",
    tasksForOrder,
    uuidFn,
    getOrderForChild,
    created,
    visited
  });
  return created.map((subtask) => applyParentTaskOverrides(subtask, parentTask));
}
