import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  SUBTASK_SCHEDULE_PARALLEL,
  domRefs
} from "../constants.js";
import {
  applyPrioritySelectColor,
  formatDurationLong,
  normalizeSubtaskScheduleMode,
  toggleClearButtonVisibility,
  uuid
} from "../utils.js";
import { state } from "../state/page-state.js";
import {
  renderTaskSectionOptions,
  renderTaskSubsectionOptions,
  getSubsectionTemplate
} from "../sections.js";
import { renderTaskTimeMapOptions } from "../time-maps.js";
import { repeatStore, setRepeatFromSelection } from "../repeat.js";
import {
  buildSubtaskFormValues,
  buildTemplateFormValues,
  resolveInheritedSubtaskScheduleMode,
  shouldShowSubtaskSchedule
} from "./task-form-helpers.js";
import { resetTaskListAssistant } from "./task-ai.js";
import { openTaskForm, closeTaskForm } from "../ui.js";
import { switchView } from "../navigation.js";

const {
  taskDeadlineInput,
  taskStartFromInput,
  taskLinkInput,
  taskLinkClearBtn,
  taskDurationInput,
  taskDurationHelper,
  taskMinBlockInput,
  taskPriorityInput,
  taskParentIdInput,
  taskSectionSelect,
  taskSubsectionSelect,
  taskSectionField,
  taskSubsectionField,
  taskSubtaskScheduleSelect,
  taskSubtaskScheduleWrap,
  taskModalEyebrow,
  taskModalTitle,
  taskModalSubtitle,
  taskModalSubmit,
  taskTemplateSelect
} = domRefs;

const TASK_FORM_COPY = {
  eyebrow: "Task intake",
  title: "Plan a new task",
  subtitle: "Set deadline, duration, and allowed TimeMaps before scheduling.",
  submit: "Save Task"
};
const TEMPLATE_FORM_COPY = {
  eyebrow: "Task templates",
  title: "Task template",
  subtitle: "Define a reusable task template.",
  submit: "Save template"
};
const TEMPLATE_SUBTASK_COPY = {
  eyebrow: "Task templates",
  title: "Template subtask",
  subtitle: "Define a reusable subtask for this template.",
  submit: "Save subtask"
};

function setTaskFormCopy(copy) {
  if (taskModalEyebrow) {taskModalEyebrow.textContent = copy.eyebrow;}
  if (taskModalTitle) {taskModalTitle.textContent = copy.title;}
  if (taskModalSubtitle) {taskModalSubtitle.textContent = copy.subtitle;}
  if (taskModalSubmit) {taskModalSubmit.textContent = copy.submit;}
}

function setTaskFormSectionsVisible(visible) {
  if (taskSectionField) {taskSectionField.classList.toggle("hidden", !visible);}
  if (taskSubsectionField) {taskSubsectionField.classList.toggle("hidden", !visible);}
  if (taskSectionSelect) {taskSectionSelect.disabled = !visible;}
  if (taskSubsectionSelect) {taskSubsectionSelect.disabled = !visible;}
  if (!visible) {
    if (taskSectionSelect) {taskSectionSelect.value = "";}
    if (taskSubsectionSelect) {taskSubsectionSelect.value = "";}
  }
}

function setTaskFormMode(mode) {
  resetTaskListAssistant();
  state.taskFormMode = mode;
  if (!mode) {
    setTaskFormCopy(TASK_FORM_COPY);
    setTaskFormSectionsVisible(true);
    return;
  }
  if (mode.type === "template-parent") {
    setTaskFormCopy(TEMPLATE_FORM_COPY);
    setTaskFormSectionsVisible(false);
    return;
  }
  if (mode.type === "template-subtask") {
    setTaskFormCopy(TEMPLATE_SUBTASK_COPY);
    setTaskFormSectionsVisible(false);
  }
}

export function resetTaskFormMode() {
  setTaskFormMode(null);
}

function syncTaskLinkClear() {
  toggleClearButtonVisibility(taskLinkInput, taskLinkClearBtn);
}

export function syncTaskDurationHelper() {
  if (!taskDurationInput || !taskDurationHelper) {return;}
  const minutes = Number(taskDurationInput.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    taskDurationHelper.textContent = "";
    taskDurationHelper.classList.add("hidden");
    return;
  }
  taskDurationHelper.textContent = `= ${formatDurationLong(minutes)}`;
  taskDurationHelper.classList.remove("hidden");
}

export function resetTaskForm(shouldClose = false) {
  resetTaskFormMode();
  repeatStore.repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = "";
  if (taskTemplateSelect) {
    taskTemplateSelect.value = "";
  }
  document.getElementById("task-title").value = "";
  taskLinkInput.value = "";
  syncTaskLinkClear();
  document.getElementById("task-duration").value = String(DEFAULT_TASK_DURATION_MIN);
  syncTaskDurationHelper();
  taskMinBlockInput.value = String(DEFAULT_TASK_MIN_BLOCK_MIN);
  document.getElementById("task-priority").value = String(DEFAULT_TASK_PRIORITY);
  applyPrioritySelectColor(taskPriorityInput);
  taskDeadlineInput.value = "";
  taskStartFromInput.value = "";
  setRepeatFromSelection({ ...DEFAULT_TASK_REPEAT }, "task");
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], []);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    taskSubtaskScheduleSelect.value = SUBTASK_SCHEDULE_PARALLEL;
  }
  if (shouldClose) {
    closeTaskForm();
  }
}

function setTaskFormBasics({
  id = "",
  parentId = "",
  title = "",
  link = "",
  durationMin = DEFAULT_TASK_DURATION_MIN,
  minBlockMin = DEFAULT_TASK_MIN_BLOCK_MIN,
  priority = DEFAULT_TASK_PRIORITY,
  deadline = "",
  startFrom = "",
  repeat = { ...DEFAULT_TASK_REPEAT }
}) {
  document.getElementById("task-id").value = id;
  taskParentIdInput.value = parentId;
  document.getElementById("task-title").value = title;
  taskLinkInput.value = link;
  syncTaskLinkClear();
  document.getElementById("task-duration").value = durationMin || String(DEFAULT_TASK_DURATION_MIN);
  syncTaskDurationHelper();
  taskMinBlockInput.value = minBlockMin || String(DEFAULT_TASK_MIN_BLOCK_MIN);
  document.getElementById("task-priority").value = String(priority || DEFAULT_TASK_PRIORITY);
  applyPrioritySelectColor(taskPriorityInput);
  taskDeadlineInput.value = deadline ? deadline.slice(0, 10) : "";
  taskStartFromInput.value = startFrom ? startFrom.slice(0, 10) : "";
  setRepeatFromSelection(repeat, "task");
}

function setTaskFormSectionFields(sectionId = "", subsectionId = "") {
  renderTaskSectionOptions(sectionId);
  renderTaskSubsectionOptions(subsectionId);
  if (taskSectionSelect) {taskSectionSelect.value = sectionId || "";}
  if (taskSubsectionSelect) {taskSubsectionSelect.value = subsectionId || "";}
}

function setTaskSubtaskScheduleMode(mode) {
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    taskSubtaskScheduleSelect.value = mode;
  }
}

function resolveSubsectionTemplate(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return null;}
  return getSubsectionTemplate(sectionId, subsectionId);
}

export function startTaskInSection(sectionId = "", subsectionId = "") {
  resetTaskFormMode();
  repeatStore.repeatTarget = "task";
  const template = resolveSubsectionTemplate(sectionId, subsectionId);
  const templateSubtaskScheduleMode = normalizeSubtaskScheduleMode(template?.subtaskScheduleMode);
  setTaskFormBasics(buildTemplateFormValues(template));
  setTaskFormSectionFields(sectionId, subsectionId);
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], template?.timeMapIds || []);
  setTaskSubtaskScheduleMode(templateSubtaskScheduleMode);
  openTaskForm();
  switchView("tasks");
}

export function openNewTaskWithDefaults(options = {}) {
  resetTaskFormMode();
  const { title = "", link = "" } = options;
  resetTaskForm(false);
  setTaskFormBasics({ title, link });
  openTaskForm();
  switchView("tasks");
}

export function startSubtaskFromTask(task, options = {}) {
  resetTaskFormMode();
  repeatStore.repeatTarget = "task";
  setTaskFormBasics(buildSubtaskFormValues(task));
  setTaskFormSectionFields(task.section || "", task.subsection || "");
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], task.timeMapIds || []);
  setTaskSubtaskScheduleMode(resolveInheritedSubtaskScheduleMode(task));
  openTaskForm();
  if (options.switchView !== false) {
    switchView("tasks");
  }
}

export function openTaskEdit(task, options = {}) {
  if (!task) {return;}
  resetTaskFormMode();
  const { switchView: shouldSwitchView = true } = options;
  const isParentTask = state.tasksCache.some((t) => t.subtaskParentId === task.id);
  document.getElementById("task-id").value = task.id;
  document.getElementById("task-title").value = task.title;
  taskLinkInput.value = task.link || "";
  syncTaskLinkClear();
  document.getElementById("task-duration").value = task.durationMin;
  syncTaskDurationHelper();
  taskMinBlockInput.value = task.minBlockMin || String(DEFAULT_TASK_MIN_BLOCK_MIN);
  document.getElementById("task-priority").value = String(task.priority);
  applyPrioritySelectColor(taskPriorityInput);
  taskDeadlineInput.value = task.deadline ? task.deadline.slice(0, 10) : "";
  taskStartFromInput.value = task.startFrom ? task.startFrom.slice(0, 10) : "";
  taskParentIdInput.value = task.subtaskParentId || "";
  setRepeatFromSelection(task.repeat, "task");
  renderTaskSectionOptions(task.section);
  renderTaskSubsectionOptions(task.subsection);
  renderTaskTimeMapOptions(state.tasksTimeMapsCache, task.timeMapIds);
  if (taskSubtaskScheduleWrap) {
    const showSchedule = shouldShowSubtaskSchedule(task, isParentTask);
    taskSubtaskScheduleWrap.classList.toggle("hidden", !showSchedule);
  }
  if (taskSubtaskScheduleSelect) {
    const mode = normalizeSubtaskScheduleMode(task.subtaskScheduleMode);
    taskSubtaskScheduleSelect.value = mode;
  }
  openTaskForm();
  if (shouldSwitchView) {
    switchView("tasks");
  }
}

export function openTaskEditById(taskId, options = {}) {
  const task = state.tasksCache.find((t) => t.id === taskId);
  if (!task) {return;}
  openTaskEdit(task, options);
}

function resolveTemplateSubtaskParentId(parentId, existingSubtask) {
  if (parentId !== null && parentId !== undefined) {return parentId;}
  if (existingSubtask && existingSubtask.subtaskParentId) {return existingSubtask.subtaskParentId;}
  return null;
}

function resolveTemplateSubtaskFormId(subtask) {
  if (subtask && subtask.id) {return subtask.id;}
  return uuid();
}

function resolveTemplateSubtaskFormValues(subtask) {
  if (subtask) {return buildTemplateFormValues(subtask);}
  return buildTemplateFormValues({});
}

function resolveTemplateSubtaskModeId(subtask) {
  if (subtask && subtask.id) {return subtask.id;}
  return "";
}

function resolveTemplateSubtaskTimeMapIds(subtask, template) {
  if (subtask && Array.isArray(subtask.timeMapIds) && subtask.timeMapIds.length) {
    return subtask.timeMapIds;
  }
  if (template && Array.isArray(template.timeMapIds)) {
    return template.timeMapIds;
  }
  return [];
}

export function openTemplateEditor(template) {
  resetTaskFormMode();
  repeatStore.repeatTarget = "task";
  const values = buildTemplateFormValues(template);
  values.id = template?.id || uuid();
  setTaskFormMode({ type: "template-parent", templateId: values.id });
  setTaskFormBasics(values);
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], template?.timeMapIds || []);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.remove("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    const mode = normalizeSubtaskScheduleMode(template?.subtaskScheduleMode);
    taskSubtaskScheduleSelect.value = mode;
  }
  openTaskForm();
}

export function openTemplateSubtaskEditor(template, subtask, parentSubtaskId = null) {
  if (!template) {return;}
  resetTaskFormMode();
  repeatStore.repeatTarget = "task";
  const values = resolveTemplateSubtaskFormValues(subtask);
  values.id = resolveTemplateSubtaskFormId(subtask);
  const resolvedParentId = resolveTemplateSubtaskParentId(parentSubtaskId, subtask);
  setTaskFormMode({
    type: "template-subtask",
    templateId: template.id,
    subtaskId: resolveTemplateSubtaskModeId(subtask),
    subtaskParentId: resolvedParentId
  });
  setTaskFormBasics(values);
  const timeMapIds = resolveTemplateSubtaskTimeMapIds(subtask, template);
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], timeMapIds);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  openTaskForm();
}
