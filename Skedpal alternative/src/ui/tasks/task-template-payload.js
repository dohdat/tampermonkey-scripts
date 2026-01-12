import { DEFAULT_TASK_REPEAT } from "../constants.js";
import { normalizeSubtaskScheduleMode, parseLocalDateInput } from "../utils.js";
import { repeatStore } from "../repeat.js";

function getTemplateRepeatSelection() {
  return repeatStore.lastRepeatSelection || { ...DEFAULT_TASK_REPEAT };
}

function resolveTemplateSubtaskParentId(parentId, existingSubtask) {
  if (parentId !== null && parentId !== undefined) {return parentId;}
  if (existingSubtask && existingSubtask.subtaskParentId) {return existingSubtask.subtaskParentId;}
  return null;
}

export function buildTemplatePayload(values, existing = null, options = {}) {
  const repeat = repeatStore.lastRepeatSelection || { ...DEFAULT_TASK_REPEAT };
  return {
    id: values.id,
    title: values.title,
    link: values.link || "",
    durationMin: values.durationMin,
    minBlockMin: values.minBlockMin,
    priority: values.priority,
    deadline: parseLocalDateInput(values.deadline),
    startFrom: parseLocalDateInput(values.startFrom),
    timeMapIds: values.timeMapIds,
    repeat,
    subtaskScheduleMode: normalizeSubtaskScheduleMode(options.subtaskScheduleMode),
    subtasks: existing?.subtasks || [],
    order: existing?.order ?? options.nextOrder
  };
}

export function cloneTemplateSubtasks(subtasks) {
  return Array.isArray(subtasks) ? [...subtasks] : [];
}

export function buildTemplateSubtaskPayload(
  values,
  subtaskId,
  parentId,
  existingSubtask,
  subtaskScheduleMode
) {
  return {
    id: subtaskId || values.id,
    title: values.title,
    link: values.link || "",
    durationMin: values.durationMin,
    minBlockMin: values.minBlockMin,
    priority: values.priority,
    deadline: parseLocalDateInput(values.deadline),
    startFrom: parseLocalDateInput(values.startFrom),
    timeMapIds: values.timeMapIds,
    repeat: getTemplateRepeatSelection(),
    subtaskScheduleMode: normalizeSubtaskScheduleMode(subtaskScheduleMode),
    subtaskParentId: resolveTemplateSubtaskParentId(parentId, existingSubtask)
  };
}
