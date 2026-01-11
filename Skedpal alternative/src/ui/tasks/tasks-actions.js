import {
  getAllTasks,
  getAllTimeMaps,
  saveTask,
  saveTaskTemplate,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import {
  DAYS_PER_YEAR,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_REPEAT,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TEN,
  TASK_DURATION_STEP_MIN,
  TASK_STATUS_IGNORED,
  TASK_STATUS_SCHEDULED,
  TASK_STATUS_UNSCHEDULED,
  domRefs
} from "../constants.js";
import {
  getNextOrder,
  getNextSubtaskOrder,
  getContainerKey,
  getTaskAndDescendants,
  formatDate,
  getInheritedSubtaskFields,
  getLocalDateKey,
  isStartAfterDeadline,
  normalizeTimeMap,
  normalizeSubtaskScheduleMode,
  uuid,
  parseLocalDateInput
} from "../utils.js";
import { state } from "../state/page-state.js";
import {
  ensureDefaultSectionsPresent,
  renderSections,
  renderTaskSectionOptions
} from "../sections.js";
import { renderFavoriteShortcuts } from "../sections-favorites.js";
import { renderTaskTimeMapOptions, collectSelectedValues } from "../time-maps.js";
import { renderTasks } from "./tasks-render.js";
import { refreshTodayView, renderTodayView } from "./today-view.js";
import { renderCalendar } from "../calendar.js";
import { ensureTaskIds, migrateSectionsAndTasks } from "./tasks.js";
import { renderBreadcrumb } from "../navigation.js";
import { showUndoBanner } from "../notifications.js";
import { buildDuplicateTasks } from "./task-duplicate.js";
import { repeatStore } from "../repeat.js";
import { resolveSavedSubtaskScheduleMode, validateTaskForm } from "./task-form-helpers.js";
import { renderReport } from "../report.js";
import { renderTaskReminderBadge } from "./task-reminders.js";
import { requestCreateTaskOverlayClose } from "../overlay-messaging.js";
import { buildTasksFromAiList } from "./task-ai-helpers.js";
import {
  buildTasksFromTemplate,
  buildSubtasksFromTemplateForParent
} from "./task-templates-helpers.js";
import {
  resetTaskForm,
  resetTaskFormMode,
  syncTaskDurationHelper,
  startTaskInSection,
  openNewTaskWithDefaults,
  startSubtaskFromTask,
  openTaskEdit,
  openTaskEditById,
  openTemplateEditor,
  openTemplateSubtaskEditor
} from "./task-form-ui.js";

const {
  taskTimeMapOptions,
  taskDeadlineInput,
  taskStartFromInput,
  taskLinkInput,
  taskMinBlockInput,
  taskParentIdInput,
  taskSectionSelect,
  taskSubsectionSelect,
  taskSubtaskScheduleSelect,
  taskSubtaskScheduleWrap,
  taskRepeatSelect,
  taskTemplateSelect,
  repeatCompleteModal,
  repeatCompleteList,
  repeatCompleteEmpty,
  scheduleStatus,
  rescheduleButtons,
  scheduleSummary
} = domRefs;

export {
  resetTaskForm,
  syncTaskDurationHelper,
  startTaskInSection,
  openNewTaskWithDefaults,
  startSubtaskFromTask,
  openTaskEdit,
  openTaskEditById,
  openTemplateEditor,
  openTemplateSubtaskEditor
};
export { viewTaskOnCalendar } from "./task-calendar-actions.js";

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
  horizonEnd.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  const occurrences = getUpcomingOccurrences(task, now, TEN, DAYS_PER_YEAR);
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
    scheduleStatus: task.scheduleStatus || TASK_STATUS_UNSCHEDULED
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
  const todayOptions = {
    collapsedTasks: state.collapsedTasks,
    expandedTaskDetails: state.expandedTaskDetails
  };
  const isTodayActive = domRefs.appShell?.dataset?.activeView === "today";
  if (isTodayActive) {
    refreshTodayView(state.tasksCache, timeMaps, todayOptions).catch((error) => {
      console.warn("Failed to refresh today view external events.", error);
    });
  } else {
    renderTodayView(state.tasksCache, timeMaps, todayOptions);
  }
  renderCalendar(state.tasksCache);
  renderReport(state.tasksCache);
  renderTaskReminderBadge(state.tasksCache);
}
function getTaskFormValues() {
  return {
    id: document.getElementById("task-id").value || uuid(),
    title: document.getElementById("task-title").value.trim(),
    durationMin: Number(document.getElementById("task-duration").value),
    minBlockMin: Number(taskMinBlockInput.value) || DEFAULT_TASK_MIN_BLOCK_MIN,
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

function buildTemplatePayload(values, existing = null) {
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
    subtaskScheduleMode: normalizeSubtaskScheduleMode(taskSubtaskScheduleSelect?.value),
    subtasks: existing?.subtasks || []
  };
}

function getTemplateRepeatSelection() {
  return repeatStore.lastRepeatSelection || { ...DEFAULT_TASK_REPEAT };
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
function resolveTaskRepeatSelection() {
  return taskRepeatSelect.value === "custom"
    ? repeatStore.lastRepeatSelection
    : { ...DEFAULT_TASK_REPEAT };
}
function resolveTaskSubtaskScheduleMode(existingTask, isParentTask) {
  const isSelectorVisible = taskSubtaskScheduleWrap
    ? !taskSubtaskScheduleWrap.classList.contains("hidden")
    : false;
  return resolveSavedSubtaskScheduleMode({
    selectedMode: taskSubtaskScheduleSelect?.value,
    existingMode: existingTask?.subtaskScheduleMode,
    isSelectorVisible: isParentTask || isSelectorVisible
  });
}
function buildTaskPayload(values, existingTask, parentTask, isParentTask, order) {
  const repeat = resolveTaskRepeatSelection();
  const subtaskScheduleMode = resolveTaskSubtaskScheduleMode(existingTask, isParentTask);
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
    reminders: existingTask?.reminders || [],
    completed: existingTask?.completed || false,
    completedAt: existingTask?.completedAt || null,
    completedOccurrences: existingTask?.completedOccurrences || [],
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
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
        scheduleStatus: TASK_STATUS_UNSCHEDULED,
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

function getTaskFormContext(values) {
  const parentTask = values.parentId ? state.tasksCache.find((t) => t.id === values.parentId) : null;
  const existingTask = state.tasksCache.find((t) => t.id === values.id);
  const isParentTask = state.tasksCache.some((t) => t.subtaskParentId === values.id);
  return { parentTask, existingTask, isParentTask };
}

async function maybeHandleTemplateSubmit(values) {
  const modeType = state.taskFormMode?.type;
  if (modeType === "template-parent") {
    const error = validateTemplateForm(values);
    if (error) {
      alert(error);
      return true;
    }
    await handleTemplateParentSubmit(values);
    return true;
  }
  if (modeType === "template-subtask") {
    const error = validateTemplateForm(values);
    if (error) {
      alert(error);
      return true;
    }
    const mode = state.taskFormMode || {};
    await handleTemplateSubtaskSubmit(
      values,
      mode.templateId || "",
      mode.subtaskId || "",
      mode.subtaskParentId ?? null
    );
    return true;
  }
  return false;
}

async function applySelectedTemplateSubtasks(selectedTemplateId, updatedTask) {
  if (!selectedTemplateId) {return;}
  const template = state.taskTemplatesCache.find((entry) => entry.id === selectedTemplateId);
  if (!template) {return;}
  const subtasks = buildSubtasksFromTemplateForParent(
    template,
    updatedTask,
    [...state.tasksCache, updatedTask],
    uuid
  );
  if (!subtasks.length) {return;}
  await Promise.all(subtasks.map((task) => saveTask(task)));
}

async function applyTaskAiSuggestions(updatedTask) {
  const list = Array.isArray(state.taskAiList) ? state.taskAiList : [];
  if (!list.length) {return;}
  const tasks = buildTasksFromAiList(list, updatedTask, state.tasksCache);
  if (!tasks.length) {return;}
  await Promise.all(tasks.map((task) => saveTask(task)));
}

export async function handleTaskSubmit(event) {
  event.preventDefault();
  const values = getTaskFormValues();
  const selectedTemplateId = values.templateId;
  if (await maybeHandleTemplateSubmit(values)) {return;}
  const { parentTask, existingTask, isParentTask } = getTaskFormContext(values);
  const error = validateTaskForm(values);
  if (error) {
    alert(error);
    return;
  }
  const order = resolveTaskOrder(existingTask, parentTask, values.section, values.subsection);
  const updatedTask = buildTaskPayload(values, existingTask, parentTask, isParentTask, order);
  await saveTask(updatedTask);
  await applySelectedTemplateSubtasks(selectedTemplateId, updatedTask);
  await applyTaskAiSuggestions(updatedTask);
  if (isParentTask && existingTask) {
    await updateParentTaskDescendants(values.id, updatedTask);
  }
  resetTaskForm(true);
  await loadTasks();
  requestCreateTaskOverlayClose();
}

export async function updateScheduleSummary() {
  const [tasks] = await Promise.all([getAllTasks()]);
  const scheduled = tasks.filter((t) => t.scheduleStatus === TASK_STATUS_SCHEDULED).length;
  const unscheduled = tasks.filter((t) => t.scheduleStatus === TASK_STATUS_UNSCHEDULED).length;
  const ignored = tasks.filter((t) => t.scheduleStatus === TASK_STATUS_IGNORED).length;
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

let tasksUpdatedCleanup = null;

function initTasksUpdatedListener() {
  if (tasksUpdatedCleanup) {return;}
  window.addEventListener("skedpal:tasks-updated", handleTasksUpdated);
  tasksUpdatedCleanup = () => {
    window.removeEventListener("skedpal:tasks-updated", handleTasksUpdated);
  };
}

export function cleanupTasksUpdatedListener() {
  if (!tasksUpdatedCleanup) {return;}
  tasksUpdatedCleanup();
  tasksUpdatedCleanup = null;
}

initTasksUpdatedListener();
