import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  TASK_DURATION_STEP_MIN,
  TASK_TITLE_MAX_LENGTH
} from "../constants.js";
import { isStartAfterDeadline, normalizeSubtaskScheduleMode } from "../utils.js";

export function buildTemplateFormValues(template) {
  return {
    id: "",
    parentId: "",
    title: template?.title || "",
    link: template?.link || "",
    durationMin: template?.durationMin || DEFAULT_TASK_DURATION_MIN,
    minBlockMin: template?.minBlockMin || DEFAULT_TASK_MIN_BLOCK_MIN,
    priority: template?.priority || DEFAULT_TASK_PRIORITY,
    deadline: template?.deadline || "",
    startFrom: template?.startFrom || "",
    repeat: template?.repeat || { ...DEFAULT_TASK_REPEAT }
  };
}

export function buildSubtaskFormValues(task) {
  return {
    id: "",
    parentId: task.id,
    title: task.title || "",
    link: "",
    durationMin: task.durationMin || DEFAULT_TASK_DURATION_MIN,
    minBlockMin: task.minBlockMin || task.durationMin || DEFAULT_TASK_MIN_BLOCK_MIN,
    priority: task.priority || DEFAULT_TASK_PRIORITY,
    deadline: task.deadline || "",
    startFrom: task.startFrom || "",
    repeat: task.repeat || { ...DEFAULT_TASK_REPEAT }
  };
}

export function resolveInheritedSubtaskScheduleMode(task) {
  return normalizeSubtaskScheduleMode(task?.subtaskScheduleMode);
}

export function resolveSavedSubtaskScheduleMode({
  selectedMode,
  existingMode,
  isSelectorVisible
}) {
  const normalizedSelected = normalizeSubtaskScheduleMode(selectedMode);
  if (isSelectorVisible) {return normalizedSelected;}
  if (existingMode) {
    return normalizeSubtaskScheduleMode(existingMode);
  }
  return normalizedSelected;
}

export function shouldShowSubtaskSchedule(task, isParentTask) {
  if (isParentTask) {return true;}
  if (!task) {return false;}
  return !task.subtaskParentId;
}

export function validateTaskForm(values) {
  if (!values.title || !values.durationMin) {
    return "Title and duration are required.";
  }
  if (values.title.length > TASK_TITLE_MAX_LENGTH) {
    return `Title must be ${TASK_TITLE_MAX_LENGTH} characters or less.`;
  }
  if (!values.subsection) {
    return "Select a subsection.";
  }
  if (values.durationMin < TASK_DURATION_STEP_MIN || values.durationMin % TASK_DURATION_STEP_MIN !== 0) {
    return `Duration must be at least ${TASK_DURATION_STEP_MIN} minutes and in ${TASK_DURATION_STEP_MIN} minute steps.`;
  }
  if (values.timeMapIds.length === 0) {
    return "Select at least one TimeMap.";
  }
  if (isStartAfterDeadline(values.startFrom, values.deadline)) {
    return "Start from cannot be after deadline.";
  }
  return "";
}
