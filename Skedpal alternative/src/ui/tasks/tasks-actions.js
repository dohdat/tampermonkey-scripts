import { getAllTasks, getAllTimeMaps, saveTask, deleteTask } from "../../data/db.js";
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
  openSubsectionModal,
  handleAddSubsection,
  handleRenameSection,
  handleRemoveSection,
  handleRemoveSubsection,
  handleToggleSectionFavorite,
  handleToggleSubsectionFavorite,
  renderFavoriteShortcuts
} from "../sections.js";
import { renderTaskTimeMapOptions, collectSelectedValues } from "../time-maps.js";
import { renderTasks } from "./tasks-render.js";
import { renderTodayView } from "./today-view.js";
import { renderCalendar } from "../calendar.js";
import { ensureTaskIds, migrateSectionsAndTasks } from "./tasks.js";
import { renderBreadcrumb, setZoomFilter, switchView } from "../navigation.js";
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
  if (!taskDurationInput || !taskDurationHelper) return;
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
  if (repeatCompleteModal) repeatCompleteModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function openRepeatCompleteModal(task) {
  if (!repeatCompleteModal || !repeatCompleteList) return;
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
  if (!taskId || !occurrenceIso) return;
  const task = state.tasksCache.find((t) => t.id === taskId);
  if (!task) return;
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

function renderTimeMapsAndTasks(timeMaps) {
  renderTasks(state.tasksCache, timeMaps);
  renderBreadcrumb();
  renderTodayView(state.tasksCache, timeMaps, {
    collapsedTasks: state.collapsedTasks,
    expandedTaskDetails: state.expandedTaskDetails
  });
  renderCalendar(state.tasksCache);
}

export async function handleTaskSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("task-id").value || uuid();
  const title = document.getElementById("task-title").value.trim();
  const durationMin = Number(document.getElementById("task-duration").value);
  const minBlockMin = Number(taskMinBlockInput.value) || 30;
  const priority = Number(document.getElementById("task-priority").value);
  const deadline = taskDeadlineInput.value;
  const startFrom = taskStartFromInput.value;
  const link = (taskLinkInput.value || "").trim();
  const timeMapIds = collectSelectedValues(taskTimeMapOptions);
  const defaultSectionId = (state.settingsCache.sections || [])[0]?.id || "";
  const section = taskSectionSelect.value || defaultSectionId;
  const subsection = taskSubsectionSelect.value || "";
  const parentId = (taskParentIdInput.value || "").trim();
  const parentTask = parentId ? state.tasksCache.find((t) => t.id === parentId) : null;
  const existingTask = state.tasksCache.find((t) => t.id === id);
  const isParentTask = state.tasksCache.some((t) => t.subtaskParentId === id);
  const targetKey = getContainerKey(section, subsection);
  const isEditingInPlace =
    existingTask && getContainerKey(existingTask.section, existingTask.subsection) === targetKey;
  const canUseParentOrdering =
    parentTask && getContainerKey(parentTask.section, parentTask.subsection) === targetKey;
  const order = isEditingInPlace
    ? existingTask.order
    : canUseParentOrdering
      ? getNextSubtaskOrder(parentTask, section, subsection, state.tasksCache)
      : getNextOrder(section, subsection, state.tasksCache);

  if (!title || !durationMin) {
    alert("Title and duration are required.");
    return;
  }
  if (durationMin < 15 || durationMin % 15 !== 0) {
    alert("Duration must be at least 15 minutes and in 15 minute steps.");
    return;
  }
  if (timeMapIds.length === 0) {
    alert("Select at least one TimeMap.");
    return;
  }
  if (isStartAfterDeadline(startFrom, deadline)) {
    alert("Start from cannot be after deadline.");
    return;
  }

  const repeat = taskRepeatSelect.value === "custom" ? repeatStore.lastRepeatSelection : { type: "none" };
  const normalizedSubtaskScheduleMode = normalizeSubtaskScheduleMode(taskSubtaskScheduleSelect?.value);
  const subtaskScheduleMode = isParentTask
    ? normalizedSubtaskScheduleMode
    : existingTask?.subtaskScheduleMode || normalizedSubtaskScheduleMode;

  const updatedTask = {
    id,
    title,
    durationMin,
    minBlockMin,
    priority,
    deadline: parseLocalDateInput(deadline),
    startFrom: parseLocalDateInput(startFrom),
    subtaskParentId: parentTask?.id || parentId || null,
    link: link || "",
    timeMapIds,
    section,
    subsection,
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

  await saveTask(updatedTask);

  if (isParentTask && existingTask) {
    const inherited = getInheritedSubtaskFields(updatedTask);
    const descendants = getTaskAndDescendants(id, state.tasksCache).slice(1);
    if (descendants.length) {
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

export function startTaskInSection(sectionId = "", subsectionId = "") {
  repeatStore.repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = "";
  const template =
    subsectionId && sectionId ? getSubsectionTemplate(sectionId, subsectionId) : null;
  const templateSubtaskScheduleMode = normalizeSubtaskScheduleMode(template?.subtaskScheduleMode);
  document.getElementById("task-title").value = template?.title || "";
  taskLinkInput.value = template?.link || "";
  syncTaskLinkClear();
  document.getElementById("task-duration").value = template?.durationMin || "30";
  syncTaskDurationHelper();
  taskMinBlockInput.value = template?.minBlockMin || "30";
  document.getElementById("task-priority").value = String(template?.priority || 3);
  taskDeadlineInput.value = template?.deadline ? template.deadline.slice(0, 10) : "";
  taskStartFromInput.value = template?.startFrom ? template.startFrom.slice(0, 10) : "";
  setRepeatFromSelection(template?.repeat || { type: "none" }, "task");
  renderTaskSectionOptions(sectionId);
  renderTaskSubsectionOptions(subsectionId);
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], template?.timeMapIds || []);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    taskSubtaskScheduleSelect.value = templateSubtaskScheduleMode;
  }
  openTaskForm();
  switchView("tasks");
}

export function startSubtaskFromTask(task) {
  repeatStore.repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = task.id;
  document.getElementById("task-title").value = task.title || "";
  taskLinkInput.value = task.link || "";
  syncTaskLinkClear();
  document.getElementById("task-duration").value = task.durationMin || "30";
  syncTaskDurationHelper();
  taskMinBlockInput.value = task.minBlockMin || task.durationMin || "30";
  document.getElementById("task-priority").value = String(task.priority || 3);
  taskDeadlineInput.value = task.deadline ? task.deadline.slice(0, 10) : "";
  taskStartFromInput.value = task.startFrom ? task.startFrom.slice(0, 10) : "";
  setRepeatFromSelection(task.repeat || { type: "none" }, "task");
  renderTaskSectionOptions(task.section || "");
  renderTaskSubsectionOptions(task.subsection || "");
  taskSectionSelect.value = task.section || "";
  taskSubsectionSelect.value = task.subsection || "";
  renderTaskTimeMapOptions(state.tasksTimeMapsCache || [], task.timeMapIds || []);
  if (taskSubtaskScheduleWrap) {
    taskSubtaskScheduleWrap.classList.add("hidden");
  }
  if (taskSubtaskScheduleSelect) {
    taskSubtaskScheduleSelect.value = "parallel";
  }
  openTaskForm();
  switchView("tasks");
}

export function openTaskEdit(task, options = {}) {
  if (!task) return;
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
  if (!task) return;
  openTaskEdit(task, options);
}

export async function handleTaskListClick(event) {
  const btn = event.target.closest("button");
  if (!btn) return;
  const completeTaskId = btn.dataset.completeTask;
  const addSection = btn.dataset.addSection;
  const addSubsectionFor = btn.dataset.addSubsection;
  const toggleSubsectionFor = btn.dataset.toggleSubsection;
  const addSubsectionTaskTarget = btn.dataset.addSubsectionTarget;
  const zoomSectionId = btn.dataset.zoomSection;
  const zoomSubsectionId = btn.dataset.zoomSubsection;
  const zoomTaskId = btn.dataset.zoomTask;
  const hasZoomSubAttr = btn.getAttribute("data-zoom-subsection") !== null;
  const addChildSubsectionId = btn.dataset.addChildSubsection;
  const addChildSectionId = btn.dataset.sectionId;
  const submitChildSubsectionId = btn.dataset.submitChildSubsection;
  const editSectionId = btn.dataset.editSection;
  const favoriteSectionId = btn.dataset.favoriteSection;
  const removeSectionId = btn.dataset.removeSection;
  const editSubsectionId = btn.dataset.editSubsection;
  const favoriteSubsectionId = btn.dataset.favoriteSubsection;
  const removeSubsectionId = btn.dataset.removeSubsection;
  const parentSectionId = btn.dataset.parentSection;
  const editId = btn.dataset.edit;
  const deleteId = btn.dataset.delete;
  const addSubtaskId = btn.dataset.addSubtask;
  const toggleTaskDetailsId = btn.dataset.toggleTaskDetails;
  const toggleTaskCollapseId = btn.dataset.toggleTaskCollapse;
  if (completeTaskId !== undefined) {
    const affected = getTaskAndDescendants(completeTaskId, state.tasksCache);
    const target = affected[0];
    if (target) {
      if (target.repeat && target.repeat.type !== "none" && !target.completed) {
        openRepeatCompleteModal(target);
        return;
      }
      const snapshots = affected.map((t) => JSON.parse(JSON.stringify(t)));
      const completed = !target.completed;
      const timestamp = completed ? new Date().toISOString() : null;
      const updates = snapshots.map((t) => {
        const updatedStatus =
          completed && t.scheduleStatus !== "completed"
            ? "completed"
            : !completed && t.scheduleStatus === "completed"
              ? "unscheduled"
              : t.scheduleStatus || "unscheduled";
        return {
          ...t,
          completed,
          completedAt: timestamp,
          scheduleStatus: updatedStatus
        };
      });
      await Promise.all(updates.map((t) => saveTask(t)));
      await loadTasks();
      const name = target.title || "Untitled task";
      const extra = updates.length > 1 ? ` and ${updates.length - 1} subtasks` : "";
      showUndoBanner(
        `${completed ? "Completed" : "Marked incomplete"} "${name}"${extra}.`,
        async () => {
          await Promise.all(snapshots.map((snap) => saveTask(snap)));
          await loadTasks();
        }
      );
    }
  } else if (zoomTaskId !== undefined) {
    switchView("tasks");
    setZoomFilter({
      type: "task",
      taskId: zoomTaskId,
      sectionId: zoomSectionId || "",
      subsectionId: zoomSubsectionId || ""
    });
  } else if (hasZoomSubAttr && zoomSubsectionId !== "") {
    switchView("tasks");
    setZoomFilter({
      type: "subsection",
      sectionId: zoomSectionId || "",
      subsectionId: zoomSubsectionId || ""
    });
  } else if (zoomSectionId !== undefined && hasZoomSubAttr) {
    switchView("tasks");
    setZoomFilter({ type: "section", sectionId: zoomSectionId || "" });
  } else if (addChildSubsectionId !== undefined) {
    const sectionId = addChildSectionId || "";
    openSubsectionModal(sectionId, addChildSubsectionId);
  } else if (submitChildSubsectionId !== undefined) {
    const card = btn.closest(`[data-subsection-card="${submitChildSubsectionId}"]`);
    const form = card?.querySelector(`[data-child-subsection-form="${submitChildSubsectionId}"]`);
    const input = card?.querySelector(`[data-child-subsection-input="${submitChildSubsectionId}"]`);
    const value = input?.value?.trim();
    if (value) {
      const parentSection = btn.dataset.parentSection || "";
      await handleAddSubsection(parentSection, value, submitChildSubsectionId);
      input.value = "";
      form?.classList.add("hidden");
    }
  } else if (favoriteSectionId !== undefined) {
    await handleToggleSectionFavorite(favoriteSectionId);
  } else if (favoriteSubsectionId !== undefined) {
    await handleToggleSubsectionFavorite(parentSectionId, favoriteSubsectionId);
  } else if (editSectionId !== undefined) {
    await handleRenameSection(editSectionId);
  } else if (removeSectionId !== undefined) {
    await handleRemoveSection(removeSectionId);
  } else if (editSubsectionId !== undefined) {
    openSubsectionModal(parentSectionId || "", "", editSubsectionId);
  } else if (removeSubsectionId !== undefined) {
    await handleRemoveSubsection(parentSectionId, removeSubsectionId);
  } else if (btn.dataset.toggleSectionCollapse !== undefined) {
    const sectionId = btn.dataset.toggleSectionCollapse || "";
    if (state.collapsedSections.has(sectionId)) {
      state.collapsedSections.delete(sectionId);
    } else {
      state.collapsedSections.add(sectionId);
    }
    renderTimeMapsAndTasks(state.tasksTimeMapsCache);
  } else if (btn.dataset.toggleSubsectionCollapse !== undefined) {
    const subId = btn.dataset.toggleSubsectionCollapse || "";
    if (state.collapsedSubsections.has(subId)) {
      state.collapsedSubsections.delete(subId);
    } else {
      state.collapsedSubsections.add(subId);
    }
    renderTimeMapsAndTasks(state.tasksTimeMapsCache);
  } else if (toggleSubsectionFor !== undefined) {
    openSubsectionModal(toggleSubsectionFor, "");
  } else if (addSubsectionFor !== undefined) {
    openSubsectionModal(addSubsectionFor, "");
  } else if (addSection !== undefined) {
    startTaskInSection(addSection, addSubsectionTaskTarget || "");
  } else if (editId) {
    openTaskEditById(editId, { switchView: true });
  } else if (addSubtaskId !== undefined) {
    const parentTask = state.tasksCache.find((t) => t.id === addSubtaskId);
    if (parentTask) {
      startSubtaskFromTask(parentTask);
    }
  } else if (toggleTaskDetailsId !== undefined) {
    if (state.expandedTaskDetails.has(toggleTaskDetailsId)) {
      state.expandedTaskDetails.delete(toggleTaskDetailsId);
    } else {
      state.expandedTaskDetails.add(toggleTaskDetailsId);
    }
    renderTimeMapsAndTasks(state.tasksTimeMapsCache);
  } else if (toggleTaskCollapseId !== undefined) {
    if (state.collapsedTasks.has(toggleTaskCollapseId)) {
      state.collapsedTasks.delete(toggleTaskCollapseId);
    } else {
      state.collapsedTasks.add(toggleTaskCollapseId);
    }
    renderTimeMapsAndTasks(state.tasksTimeMapsCache);
  } else if (deleteId) {
    const affected = getTaskAndDescendants(deleteId, state.tasksCache);
    const snapshot = affected.map((t) => JSON.parse(JSON.stringify(t)));
    await Promise.all(affected.map((t) => deleteTask(t.id)));
    await loadTasks();
    if (snapshot.length) {
      const name = snapshot[0].title || "Untitled task";
      const extra = snapshot.length > 1 ? ` and ${snapshot.length - 1} subtasks` : "";
      showUndoBanner(`Deleted "${name}"${extra}.`, async () => {
        await Promise.all(snapshot.map((t) => saveTask(t)));
        await loadTasks();
      });
    }
  }
}

export async function updateScheduleSummary() {
  const [tasks] = await Promise.all([getAllTasks()]);
  const scheduled = tasks.filter((t) => t.scheduleStatus === "scheduled").length;
  const unscheduled = tasks.filter((t) => t.scheduleStatus === "unscheduled").length;
  const ignored = tasks.filter((t) => t.scheduleStatus === "ignored").length;
  const lastRun = tasks.reduce((latest, t) => {
    if (!t.lastScheduledRun) return latest;
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
