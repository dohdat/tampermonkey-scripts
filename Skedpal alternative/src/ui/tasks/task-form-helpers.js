import { isStartAfterDeadline } from "../utils.js";

export function buildTemplateFormValues(template) {
  return {
    id: "",
    parentId: "",
    title: template?.title || "",
    link: template?.link || "",
    durationMin: template?.durationMin || 30,
    minBlockMin: template?.minBlockMin || 30,
    priority: template?.priority || 3,
    deadline: template?.deadline || "",
    startFrom: template?.startFrom || "",
    repeat: template?.repeat || { type: "none" }
  };
}

export function buildSubtaskFormValues(task) {
  return {
    id: "",
    parentId: task.id,
    title: task.title || "",
    link: "",
    durationMin: task.durationMin || 30,
    minBlockMin: task.minBlockMin || task.durationMin || 30,
    priority: task.priority || 3,
    deadline: task.deadline || "",
    startFrom: task.startFrom || "",
    repeat: task.repeat || { type: "none" }
  };
}

export function validateTaskForm(values) {
  if (!values.title || !values.durationMin) {
    return "Title and duration are required.";
  }
  if (!values.subsection) {
    return "Select a subsection.";
  }
  if (values.durationMin < 15 || values.durationMin % 15 !== 0) {
    return "Duration must be at least 15 minutes and in 15 minute steps.";
  }
  if (values.timeMapIds.length === 0) {
    return "Select at least one TimeMap.";
  }
  if (isStartAfterDeadline(values.startFrom, values.deadline)) {
    return "Start from cannot be after deadline.";
  }
  return "";
}
