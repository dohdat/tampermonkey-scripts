import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  TASK_STATUS_UNSCHEDULED
} from "../constants.js";
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
    durationMin: toPositiveNumberOr(safe.durationMin, DEFAULT_TASK_DURATION_MIN),
    minBlockMin: toPositiveNumberOr(safe.minBlockMin, DEFAULT_TASK_MIN_BLOCK_MIN),
    priority: toPositiveNumberOr(safe.priority, DEFAULT_TASK_PRIORITY),
    deadline: orFallback(safe.deadline, null),
    startFrom: orFallback(safe.startFrom, null),
    repeat: orFallback(safe.repeat, { ...DEFAULT_TASK_REPEAT }),
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
    repeat: parentTask.repeat || { ...DEFAULT_TASK_REPEAT }
  };
}

function applyTemplateParentMapping(createdMeta) {
  if (!Array.isArray(createdMeta) || createdMeta.length === 0) {return;}
  const templateToTaskId = new Map();
  createdMeta.forEach(({ task, templateId }) => {
    if (!task?.id || !templateId) {return;}
    templateToTaskId.set(templateId, task.id);
  });
  createdMeta.forEach(({ task, templateParentId }) => {
    if (!task || !templateParentId) {return;}
    const parentTaskId = templateToTaskId.get(templateParentId);
    if (parentTaskId) {
      task.subtaskParentId = parentTaskId;
    }
  });
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
    repeat: template.repeat || { ...DEFAULT_TASK_REPEAT },
    completed: false,
    completedAt: null,
    completedOccurrences: [],
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
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
  visited,
  createdMeta
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
    if (createdMeta) {
      createdMeta.push({
        task: subtask,
        templateId: childTemplate.id || "",
        templateParentId: childTemplate.subtaskParentId || null
      });
    }
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
        visited,
        createdMeta
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
  const createdMeta = [];
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
      visited,
      createdMeta
    });
    applyTemplateParentMapping(createdMeta);
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
    visited,
    createdMeta
  });
  applyTemplateParentMapping(createdMeta);
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
  const createdMeta = [];
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
    visited,
    createdMeta
  });
  applyTemplateParentMapping(createdMeta);
  return created.map((subtask) => applyParentTaskOverrides(subtask, parentTask));
}
