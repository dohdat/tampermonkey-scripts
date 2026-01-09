import {
  getAllTasks,
  getAllTimeMaps,
  saveTask,
  saveTaskTemplate,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import { domRefs } from "../constants.js";
import {
  getNextOrder,
  getNextSubtaskOrder,
  getContainerKey,
  getTaskAndDescendants,
  formatDate,
  formatDurationLong,
  getInheritedSubtaskFields,
  getLocalDateKey,
  isStartAfterDeadline,
  normalizeTimeMap,
  normalizeSubtaskScheduleMode,
  applyPrioritySelectColor,
  toggleClearButtonVisibility,
  uuid,
  parseLocalDateInput
} from "../utils.js";
import { state } from "../state/page-state.js";
import {
  ensureDefaultSectionsPresent,
  renderSections,
  renderTaskSectionOptions,
  renderTaskSubsectionOptions,
  getSubsectionTemplate
} from "../sections.js";
import { renderFavoriteShortcuts } from "../sections-favorites.js";
import { renderTaskTimeMapOptions, collectSelectedValues } from "../time-maps.js";
import { renderTasks } from "./tasks-render.js";
import { renderTodayView } from "./today-view.js";
import { focusCalendarEvent, renderCalendar } from "../calendar.js";
import { ensureTaskIds, migrateSectionsAndTasks } from "./tasks.js";
import { renderBreadcrumb, switchView } from "../navigation.js";
import { showUndoBanner } from "../notifications.js";
import { buildDuplicateTasks } from "./task-duplicate.js";
import {
  repeatStore,
  setRepeatFromSelection
} from "../repeat.js";
import {
  buildSubtaskFormValues,
  buildTemplateFormValues,
  validateTaskForm
} from "./task-form-helpers.js";
import { renderReport } from "../report.js";
import { requestCreateTaskOverlayClose } from "../overlay-messaging.js";
import {
  buildTasksFromTemplate,
  buildSubtasksFromTemplateForParent
} from "./task-templates-helpers.js";

const {
  taskTimeMapOptions,
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
  taskRepeatSelect,
  taskModalEyebrow,
  taskModalTitle,
  taskModalSubtitle,
  taskModalSubmit,
  taskTemplateSelect,
  repeatCompleteModal,
  repeatCompleteList,
  repeatCompleteEmpty,
  scheduleStatus,
  rescheduleButtons,
  scheduleSummary
} = domRefs;
import { openTaskForm, closeTaskForm } from "../ui.js";

function syncTaskLinkClear() {
  toggleClearButtonVisibility(taskLinkInput, taskLinkClearBtn);
}

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

function resetTaskFormMode() {
  setTaskFormMode(null);
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

export function closeRepeatCompleteModal() {
  if (repeatCompleteModal) {repeatCompleteModal.classList.add("hidden");}
  document.body.classList.remove("modal-open");
}

export function openRepeatCompleteModal(task) {
  if (!repeatCompleteModal || !repeatCompleteList) {return;}
  repeatCompleteList.innerHTML = "";
  const horizonDays =
    Number(state.settingsCache?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const now = new Date();
  const horizonEnd = new Date(now.getTime());
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  horizonEnd.setHours(23, 59, 59, 999);
  const occurrences = getUpcomingOccurrences(task, now, 10, 365);
  if (!occurrences.length) {
    repeatCompleteEmpty?.classList.remove("hidden");
  } else {
    repeatCompleteEmpty?.classList.add("hidden");
    occurrences.forEach(({ date, occurrenceId }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "repeat-complete-option";
      btn.dataset.repeatCompleteTask = task.id;
      btn.dataset.repeatCompleteDate = date.toISOString();
      btn.setAttribute("data-test-skedpal", "repeat-complete-option");
      const label = document.createElement("span");
      label.className = "repeat-complete-label";
      label.textContent = formatDate(date) || date.toLocaleDateString();
      label.setAttribute("data-test-skedpal", "repeat-complete-label");
      const meta = document.createElement("span");
      meta.className = "repeat-complete-meta";
      meta.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
      meta.setAttribute("data-test-skedpal", "repeat-complete-meta");
      const time = document.createElement("span");
      time.className = "repeat-complete-time";
      time.setAttribute("data-test-skedpal", "repeat-complete-time");
      if (date > horizonEnd) {
        time.textContent = "Out of range";
      } else {
        const instances = task.scheduledInstances || [];
        let matches = instances.filter((instance) => instance.occurrenceId === occurrenceId);
        if (!matches.length) {
          const targetKey = getLocalDateKey(date);
          matches = instances.filter(
            (instance) => getLocalDateKey(instance.start) === targetKey
          );
        }
        if (matches.length) {
          const starts = matches.map((m) => new Date(m.start));
          const ends = matches.map((m) => new Date(m.end));
          const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
          const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
          const startLabel = minStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          const endLabel = maxEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          time.textContent = `${startLabel} - ${endLabel}`;
        } else {
          time.textContent = "Unscheduled";
        }
      }
      btn.appendChild(label);
      btn.appendChild(meta);
      btn.appendChild(time);
      repeatCompleteList.appendChild(btn);
    });
  }
  repeatCompleteModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

export async function handleRepeatOccurrenceComplete(taskId, occurrenceIso) {
  if (!taskId || !occurrenceIso) {return;}
  const task = state.tasksCache.find((t) => t.id === taskId);
  if (!task) {return;}
  const previous = JSON.parse(JSON.stringify(task));
  const completedOccurrences = new Set(task.completedOccurrences || []);
  if (completedOccurrences.has(occurrenceIso)) {
    closeRepeatCompleteModal();
    return;
  }
  completedOccurrences.add(occurrenceIso);
  await saveTask({
    ...task,
    completedOccurrences: Array.from(completedOccurrences),
    completed: false,
    completedAt: task.completedAt || null,
    scheduleStatus: task.scheduleStatus || "unscheduled"
  });
  await loadTasks();
  closeRepeatCompleteModal();
  const dateLabel = formatDate(occurrenceIso) || new Date(occurrenceIso).toLocaleDateString();
  showUndoBanner(`Completed "${task.title}" on ${dateLabel}.`, async () => {
    await saveTask(previous);
    await loadTasks();
  });
}

export async function loadTasks() {
  const [tasksRaw, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const tasksWithIds = await ensureTaskIds(tasksRaw);
  const { tasks, settings: normalizedSettings } = await migrateSectionsAndTasks(
    tasksWithIds,
    state.settingsCache
  );
  state.settingsCache = { ...state.settingsCache, ...normalizedSettings };
  await ensureDefaultSectionsPresent();
  renderSections();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  state.tasksTimeMapsCache = timeMaps;
  state.tasksCache = tasks;
  renderFavoriteShortcuts();
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(timeMaps);
  renderTimeMapsAndTasks(timeMaps);
}

export async function duplicateTaskWithChildren(taskId) {
  if (!taskId) {return;}
  const originals = getTaskAndDescendants(taskId, state.tasksCache);
  if (!originals.length) {return;}
  const duplicates = buildDuplicateTasks(originals, state.tasksCache);
  await Promise.all(duplicates.map((task) => saveTask(task)));
  await loadTasks();
}

function resolveFirstScheduledDate(task) {
  if (!task) {return null;}
  if (task.scheduledStart) {
    const start = new Date(task.scheduledStart);
    return Number.isNaN(start.getTime()) ? null : start;
  }
  const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
  if (!instances.length) {return null;}
  const starts = instances
    .map((instance) => new Date(instance.start))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!starts.length) {return null;}
  return new Date(Math.min(...starts.map((date) => date.getTime())));
}

export async function viewTaskOnCalendar(taskId) {
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task || task.scheduleStatus !== "scheduled") {return false;}
  const targetDate = resolveFirstScheduledDate(task);
  if (!targetDate) {return false;}
  switchView("calendar", { calendarAnchorDate: targetDate, focusCalendar: false });
  renderCalendar(state.tasksCache);
  return focusCalendarEvent(taskId, { behavior: "smooth" });
}

export async function applyTaskTemplateToSubsection(templateId, sectionId = "", subsectionId = "") {
  if (!templateId) {return false;}
  const template = state.taskTemplatesCache.find((entry) => entry.id === templateId);
  if (!template) {return false;}
  const newTasks = buildTasksFromTemplate(
    template,
    sectionId,
    subsectionId,
    state.tasksCache,
    uuid,
    { includeParent: false }
  );
  if (!newTasks.length) {return false;}
  await Promise.all(newTasks.map((task) => saveTask(task)));
  await loadTasks();
  return true;
}

export function renderTimeMapsAndTasks(timeMaps) {
  renderTasks(state.tasksCache, timeMaps);
  renderBreadcrumb();
  renderTodayView(state.tasksCache, timeMaps, {
    collapsedTasks: state.collapsedTasks,
    expandedTaskDetails: state.expandedTaskDetails
  });
  renderCalendar(state.tasksCache);
  renderReport(state.tasksCache);
}

function getTaskFormValues() {
  return {
    id: document.getElementById("task-id").value || uuid(),
    title: document.getElementById("task-title").value.trim(),
    durationMin: Number(document.getElementById("task-duration").value),
    minBlockMin: Number(taskMinBlockInput.value) || 30,
    priority: Number(document.getElementById("task-priority").value),
    deadline: taskDeadlineInput.value,
    startFrom: taskStartFromInput.value,
    link: (taskLinkInput.value || "").trim(),
    timeMapIds: collectSelectedValues(taskTimeMapOptions),
    section: taskSectionSelect.value || (state.settingsCache.sections || [])[0]?.id || "",
    subsection: taskSubsectionSelect.value || "",
    parentId: (taskParentIdInput.value || "").trim(),
    templateId: taskTemplateSelect?.value || ""
  };
}

export { validateTaskForm };

function validateTemplateForm(values) {
  if (!values.title || !values.durationMin) {
    return "Title and duration are required.";
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

function buildTemplatePayload(values, existing = null) {
  const repeat = repeatStore.lastRepeatSelection || { type: "none" };
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
    subtaskScheduleMode: normalizeSubtaskScheduleMode(taskSubtaskScheduleSelect?.value),
    subtasks: existing?.subtasks || []
  };
}

function getTemplateRepeatSelection() {
  return repeatStore.lastRepeatSelection || { type: "none" };
}

function cloneTemplateSubtasks(subtasks) {
  return Array.isArray(subtasks) ? [...subtasks] : [];
}

function resolveTemplateSubtaskParentId(parentId, existingSubtask) {
  if (parentId !== null && parentId !== undefined) {return parentId;}
  if (existingSubtask && existingSubtask.subtaskParentId) {return existingSubtask.subtaskParentId;}
  return null;
}

function buildTemplateSubtaskPayload(values, subtaskId, parentId, existingSubtask) {
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
    subtaskScheduleMode: normalizeSubtaskScheduleMode(taskSubtaskScheduleSelect?.value),
    subtaskParentId: resolveTemplateSubtaskParentId(parentId, existingSubtask)
  };
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

function resolveTaskOrder(existingTask, parentTask, section, subsection) {
  const targetKey = getContainerKey(section, subsection);
  const isEditingInPlace =
    existingTask && getContainerKey(existingTask.section, existingTask.subsection) === targetKey;
  const canUseParentOrdering =
    parentTask && getContainerKey(parentTask.section, parentTask.subsection) === targetKey;
  if (isEditingInPlace) {
    return existingTask.order;
  }
  if (canUseParentOrdering) {
    return getNextSubtaskOrder(parentTask, section, subsection, state.tasksCache);
  }
  return getNextOrder(section, subsection, state.tasksCache);
}

function buildTaskPayload(values, existingTask, parentTask, isParentTask, order) {
  const repeat = taskRepeatSelect.value === "custom" ? repeatStore.lastRepeatSelection : { type: "none" };
  const normalizedSubtaskScheduleMode = normalizeSubtaskScheduleMode(taskSubtaskScheduleSelect?.value);
  const subtaskScheduleMode = isParentTask
    ? normalizedSubtaskScheduleMode
    : existingTask?.subtaskScheduleMode || normalizedSubtaskScheduleMode;
  return {
    id: values.id,
    title: values.title,
    durationMin: values.durationMin,
    minBlockMin: values.minBlockMin,
    priority: values.priority,
    deadline: parseLocalDateInput(values.deadline),
    startFrom: parseLocalDateInput(values.startFrom),
    subtaskParentId: parentTask?.id || values.parentId || null,
    link: values.link || "",
    timeMapIds: values.timeMapIds,
    section: values.section,
    subsection: values.subsection,
    order,
    subtaskScheduleMode,
    repeat,
    completed: existingTask?.completed || false,
    completedAt: existingTask?.completedAt || null,
    completedOccurrences: existingTask?.completedOccurrences || [],
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null
  };
}

async function updateParentTaskDescendants(taskId, updatedTask) {
  const descendants = getTaskAndDescendants(taskId, state.tasksCache).slice(1);
  if (!descendants.length) {return;}
  const inherited = getInheritedSubtaskFields(updatedTask);
  await Promise.all(
    descendants.map((task) =>
      saveTask({
        ...task,
        ...inherited,
        scheduleStatus: "unscheduled",
        scheduledStart: null,
        scheduledEnd: null,
        scheduledTimeMapId: null,
        scheduledInstances: []
      })
    )
  );
}

async function handleTemplateParentSubmit(values) {
  const existing = state.taskTemplatesCache.find((entry) => entry.id === values.id) || null;
  const template = buildTemplatePayload(values, existing);
  await saveTaskTemplate(template);
  window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
  resetTaskForm(true);
  resetTaskFormMode();
}

async function handleTemplateSubtaskSubmit(
  values,
  templateId,
  subtaskId = "",
  subtaskParentId = null
) {
  const template = state.taskTemplatesCache.find((entry) => entry.id === templateId);
  if (!template) {return;}
  const existingSubtask =
    cloneTemplateSubtasks(template.subtasks).find((entry) => entry.id === subtaskId) || null;
  const subtaskPayload = buildTemplateSubtaskPayload(
    values,
    subtaskId,
    subtaskParentId,
    existingSubtask
  );
  const subtasks = cloneTemplateSubtasks(template.subtasks);
  const idx = subtasks.findIndex((entry) => entry.id === subtaskPayload.id);
  if (idx >= 0) {
    subtasks[idx] = { ...subtasks[idx], ...subtaskPayload };
  } else {
    subtasks.push(subtaskPayload);
  }
  await saveTaskTemplate({ ...template, subtasks });
  window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
  resetTaskForm(true);
  resetTaskFormMode();
}

export async function handleTaskSubmit(event) {
  event.preventDefault();
  const values = getTaskFormValues();
  const selectedTemplateId = values.templateId;
  if (state.taskFormMode?.type === "template-parent") {
    const error = validateTemplateForm(values);
    if (error) {
      alert(error);
      return;
    }
    await handleTemplateParentSubmit(values);
    return;
  }
  if (state.taskFormMode?.type === "template-subtask") {
    const error = validateTemplateForm(values);
    if (error) {
      alert(error);
      return;
    }
    const mode = state.taskFormMode || {};
    await handleTemplateSubtaskSubmit(
      values,
      mode.templateId || "",
      mode.subtaskId || "",
      mode.subtaskParentId ?? null
    );
    return;
  }
  const parentTask = values.parentId ? state.tasksCache.find((t) => t.id === values.parentId) : null;
  const existingTask = state.tasksCache.find((t) => t.id === values.id);
  const isParentTask = state.tasksCache.some((t) => t.subtaskParentId === values.id);
  const error = validateTaskForm(values);
  if (error) {
    alert(error);
    return;
  }
  const order = resolveTaskOrder(existingTask, parentTask, values.section, values.subsection);
  const updatedTask = buildTaskPayload(values, existingTask, parentTask, isParentTask, order);
  await saveTask(updatedTask);
  if (selectedTemplateId) {
    const template = state.taskTemplatesCache.find((entry) => entry.id === selectedTemplateId);
    if (template) {
      const subtasks = buildSubtasksFromTemplateForParent(
        template,
        updatedTask,
        [...state.tasksCache, updatedTask],
        uuid
      );
      if (subtasks.length) {
        await Promise.all(subtasks.map((task) => saveTask(task)));
      }
    }
  }
  if (isParentTask && existingTask) {
    await updateParentTaskDescendants(values.id, updatedTask);
  }
  resetTaskForm(true);
  await loadTasks();
  requestCreateTaskOverlayClose();
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
  document.getElementById("task-duration").value = "30";
  syncTaskDurationHelper();
  taskMinBlockInput.value = "30";
  document.getElementById("task-priority").value = "3";
  applyPrioritySelectColor(taskPriorityInput);
  taskDeadlineInput.value = "";
  taskStartFromInput.value = "";
  setRepeatFromSelection({ type: "none" }, "task");
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], []);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    taskSubtaskScheduleSelect.value = "parallel";
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
  durationMin = 30,
  minBlockMin = 30,
  priority = 3,
  deadline = "",
  startFrom = "",
  repeat = { type: "none" }
}) {
  document.getElementById("task-id").value = id;
  taskParentIdInput.value = parentId;
  document.getElementById("task-title").value = title;
  taskLinkInput.value = link;
  syncTaskLinkClear();
  document.getElementById("task-duration").value = durationMin || "30";
  syncTaskDurationHelper();
  taskMinBlockInput.value = minBlockMin || "30";
  document.getElementById("task-priority").value = String(priority || 3);
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
  setTaskSubtaskScheduleMode("parallel");
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
  taskMinBlockInput.value = task.minBlockMin || "30";
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
    taskSubtaskScheduleWrap.classList.toggle("hidden", !isParentTask);
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

export async function updateScheduleSummary() {
  const [tasks] = await Promise.all([getAllTasks()]);
  const scheduled = tasks.filter((t) => t.scheduleStatus === "scheduled").length;
  const unscheduled = tasks.filter((t) => t.scheduleStatus === "unscheduled").length;
  const ignored = tasks.filter((t) => t.scheduleStatus === "ignored").length;
  const lastRun = tasks.reduce((latest, t) => {
    if (!t.lastScheduledRun) {return latest;}
    return latest ? Math.max(latest, new Date(t.lastScheduledRun)) : new Date(t.lastScheduledRun);
  }, null);
  scheduleSummary.innerHTML = `
    <div class="flex flex-wrap gap-2 text-sm">
      <span class="rounded-lg bg-lime-400/10 px-3 py-1 text-lime-300">Scheduled: ${scheduled}</span>
      <span class="rounded-lg bg-amber-400/10 px-3 py-1 text-amber-300">Unscheduled: ${unscheduled}</span>
      <span class="rounded-lg bg-slate-500/10 px-3 py-1 text-slate-300">Ignored (outside horizon): ${ignored}</span>
    </div>
    <div class="mt-2 text-xs text-slate-400">Last run: ${lastRun ? new Date(lastRun).toLocaleString() : "never"}</div>
  `;
}

export async function handleReschedule() {
  rescheduleButtons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("opacity-60", "cursor-not-allowed");
  });
  scheduleStatus.textContent = "Scheduling...";
  try {
    if (state.pendingSettingsSave) {
      await state.pendingSettingsSave.catch((error) => {
        console.warn("Failed to save settings before scheduling.", error);
      });
    }
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "reschedule" }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Scheduling failed");
    }
    const blockInfo =
      typeof response.placements === "number" ? ` (${response.placements} blocks)` : "";
    scheduleStatus.textContent = `Scheduled ${response.scheduled}${blockInfo}, unscheduled ${response.unscheduled}, ignored ${response.ignored}.`;
  } catch (error) {
    scheduleStatus.textContent = `Error: ${error.message}`;
  } finally {
    rescheduleButtons.forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove("opacity-60", "cursor-not-allowed");
    });
    await Promise.all([loadTasks(), updateScheduleSummary()]);
  }
}

function handleTasksUpdated() {
  loadTasks().then(updateScheduleSummary);
}

window.addEventListener("skedpal:tasks-updated", handleTasksUpdated);
