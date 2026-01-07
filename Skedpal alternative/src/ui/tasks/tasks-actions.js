import { getAllTasks, getAllTimeMaps, saveTask } from "../../data/db.js";
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
  getSubsectionTemplate,
  renderFavoriteShortcuts
} from "../sections.js";
import { renderTaskTimeMapOptions, collectSelectedValues } from "../time-maps.js";
import { renderTasks } from "./tasks-render.js";
import { renderTodayView } from "./today-view.js";
import { renderCalendar } from "../calendar.js";
import { ensureTaskIds, migrateSectionsAndTasks } from "./tasks.js";
import { renderBreadcrumb, switchView } from "../navigation.js";
import { showUndoBanner } from "../notifications.js";
import {
  repeatStore,
  setRepeatFromSelection
} from "../repeat.js";

const {
  taskTimeMapOptions,
  taskDeadlineInput,
  taskStartFromInput,
  taskLinkInput,
  taskLinkClearBtn,
  taskDurationInput,
  taskDurationHelper,
  taskMinBlockInput,
  taskParentIdInput,
  taskSectionSelect,
  taskSubsectionSelect,
  taskSubtaskScheduleSelect,
  taskSubtaskScheduleWrap,
  taskRepeatSelect,
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
  const horizonDays = Number(state.settingsCache?.schedulingHorizonDays) || 14;
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
  renderFavoriteShortcuts();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  state.tasksTimeMapsCache = timeMaps;
  state.tasksCache = tasks;
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(timeMaps);
  renderTimeMapsAndTasks(timeMaps);
}

export function renderTimeMapsAndTasks(timeMaps) {
  renderTasks(state.tasksCache, timeMaps);
  renderBreadcrumb();
  renderTodayView(state.tasksCache, timeMaps, {
    collapsedTasks: state.collapsedTasks,
    expandedTaskDetails: state.expandedTaskDetails
  });
  renderCalendar(state.tasksCache);
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
    parentId: (taskParentIdInput.value || "").trim()
  };
}

function validateTaskForm(values) {
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

export async function handleTaskSubmit(event) {
  event.preventDefault();
  const values = getTaskFormValues();
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
  if (isParentTask && existingTask) {
    await updateParentTaskDescendants(values.id, updatedTask);
  }
  resetTaskForm(true);
  await loadTasks();
}

export function resetTaskForm(shouldClose = false) {
  repeatStore.repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = "";
  document.getElementById("task-title").value = "";
  taskLinkInput.value = "";
  syncTaskLinkClear();
  document.getElementById("task-duration").value = "30";
  syncTaskDurationHelper();
  taskMinBlockInput.value = "30";
  document.getElementById("task-priority").value = "3";
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

function buildTemplateFormValues(template) {
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

function buildSubtaskFormValues(task) {
  return {
    id: "",
    parentId: task.id,
    title: task.title || "",
    link: task.link || "",
    durationMin: task.durationMin || 30,
    minBlockMin: task.minBlockMin || task.durationMin || 30,
    priority: task.priority || 3,
    deadline: task.deadline || "",
    startFrom: task.startFrom || "",
    repeat: task.repeat || { type: "none" }
  };
}

export function startTaskInSection(sectionId = "", subsectionId = "") {
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

export function startSubtaskFromTask(task) {
  repeatStore.repeatTarget = "task";
  setTaskFormBasics(buildSubtaskFormValues(task));
  setTaskFormSectionFields(task.section || "", task.subsection || "");
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], task.timeMapIds || []);
  setTaskSubtaskScheduleMode("parallel");
  openTaskForm();
  switchView("tasks");
}

export function openTaskEdit(task, options = {}) {
  if (!task) {return;}
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

window.addEventListener("skedpal:tasks-updated", () => {
  loadTasks().then(updateScheduleSummary);
});
