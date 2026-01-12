import { HALF, domRefs } from "./constants.js";
import {
  renderDayRows,
  loadTimeMaps,
  resetTimeMapForm,
  handleTimeMapSubmit,
  handleSetDefaultTimeMap,
  handleTimeMapListClick,
  openTimeMapForm,
  closeTimeMapForm
} from "./time-maps.js";
import {
  registerRepeatEventHandlers,
  setRepeatFromSelection
} from "./repeat.js";
import { DEFAULT_TASK_REPEAT } from "./constants.js";
import { initSettings } from "./settings.js";
import { loadTaskTemplates } from "./task-templates.js";
import {
  loadTasks,
  handleTaskSubmit,
  handleReschedule,
  syncTaskDurationHelper,
  updateScheduleSummary,
  startTaskInSection,
  handleRepeatOccurrenceComplete,
  closeRepeatCompleteModal,
  openTaskEditById,
  openNewTaskWithDefaults
} from "./tasks/tasks-actions.js";
import { initTaskTemplateSelect } from "./tasks/task-template-select.js";
import { initTaskListAssistant } from "./tasks/task-ai.js";
import { updateTaskTitleHelper } from "./tasks/task-form-ui.js";
import {
  handleTaskContainerDoubleClick,
  handleTaskListClick,
  handleTaskTitleDoubleClick
} from "./tasks/task-list-actions.js";
import { initTaskReminderModal } from "./tasks/task-reminders.js";
import {
  renderTaskSubsectionOptions,
  openSectionForm,
  closeSectionForm,
  handleAddSection,
  handleRemoveSection,
  closeSubsectionModal,
  handleSubsectionFormSubmit,
  handleAddSubsection
} from "./sections.js";
import {
  updateFavoriteOrder,
  toggleFavoriteGroup,
  toggleFavoriteSubsection
} from "./sections-favorites.js";
import {
  applyNavigationFromUrl,
  handleNavigationShortcuts,
  handleNavigationMouseButtons,
  initViewFromUrl,
  pushNavigation,
  setZoomFilter,
  switchView,
  goHome
} from "./navigation.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";
import {
  applyPrioritySelectColor,
  parseNewTaskFromUrl,
  parseZoomFromUrl,
  parseViewFromUrl,
  toggleClearButtonVisibility,
  updateUrlWithCalendarView
} from "./utils.js";
import { closeTaskForm } from "./ui.js";
import { indentTaskUnderPrevious, outdentTask } from "./tasks/tasks-sortable.js";
import {
  indentSelectedTasks,
  outdentSelectedTasks,
} from "./tasks/task-multi-select.js";
import { state } from "./state/page-state.js";
import { initCalendarView, renderCalendar } from "./calendar.js";
import { applyTheme } from "./theme.js";
import { initSidebarToggle } from "./sidebar-toggle.js";
import { initDatePicker } from "./date-picker.js";
import { initTaskModalSections } from "./task-modal-sections.js";
import { initTaskPriorityDropdown } from "./tasks/task-priority-dropdown.js";
import { initTaskDeleteShortcut } from "./tasks/task-delete-shortcut.js";

const {
  timeMapDayRows,
  timeMapFormWrap,
  timeMapToggle,
  timeMapCancel,
  taskFormWrap,
  taskToggle,
  taskModalCloseButtons,
  taskLinkInput,
  taskLinkClearBtn,
  taskDurationInput,
  taskPriorityInput,
  sectionAddBtn,
  sectionFormToggle,
  sectionInput,
  sectionList,
  taskSectionSelect,
  navButtons,
  settingsToggleBtn,
  sidebarFavorites,
  subsectionForm,
  subsectionModalCloseBtns,
  taskList,
  todayList,
  reportList,
  timeMapList,
  rescheduleButtons,
  repeatCompleteList,
  repeatCompleteCloseBtns,
  subsectionTaskPriorityInput
} = domRefs;

async function hydrate() {
  renderDayRows(timeMapDayRows);
  await initSettings();
  await loadTimeMaps();
  const initialZoom = parseZoomFromUrl();
  if (initialZoom) {
    state.zoomFilter = initialZoom;
  }
  await loadTasks();
  await loadTaskTemplates();
  const isCalendarView = domRefs.appShell?.dataset?.activeView === "calendar";
  const isCalendarSplit = domRefs.tasksCalendarSplitWrap?.dataset?.split === "true";
  if (isCalendarView || isCalendarSplit) {
    state.calendarExternalAllowFetch = true;
    await renderCalendar();
  }
  if (initialZoom) {
    pushNavigation(initialZoom);
  } else {
    pushNavigation(null);
  }
  await updateScheduleSummary();
}

function handleTimeMapCancelClick() {
  resetTimeMapForm();
  closeTimeMapForm();
}

function handleTimeMapToggleClick() {
  if (timeMapFormWrap.classList.contains("hidden")) {
    openTimeMapForm();
  } else {
    closeTimeMapForm();
  }
}

async function handleTimeMapListClickEvent(event) {
  await handleTimeMapListClick(event, state.tasksTimeMapsCache);
}

function handleTaskLinkClearClick() {
  taskLinkInput.value = "";
  taskLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
  taskLinkInput.focus();
}

function handleTaskStartFromClearClick() {
  const input = domRefs.taskStartFromInput;
  if (!input) {return;}
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
}

function handleTaskDeadlineClearClick() {
  const input = domRefs.taskDeadlineInput;
  if (!input) {return;}
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
}

function handleTaskToggleClick() {
  startTaskInSection();
}

async function handleTaskListClickEvent(event) {
  await handleTaskListClick(event);
}

function handleTaskListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleTodayListClickEvent(event) {
  await handleTaskListClick(event);
}

function handleTodayListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleReportListClickEvent(event) {
  await handleTaskListClick(event, { switchView: false });
}

function handleReportListDoubleClickEvent(event) {
  const card = event.target.closest?.('[data-test-skedpal="task-card"]');
  if (!card) {return;}
  const taskId = card.dataset.taskId || "";
  if (!taskId) {return;}
  setZoomFilter({
    type: "task",
    taskId,
    sectionId: card.dataset.sectionId || "",
    subsectionId: card.dataset.subsectionId || ""
  });
}

function handleSectionFormToggleClick() {
  if (sectionFormToggle.classList.contains("hidden")) {return;}
  if (sectionFormToggle.textContent?.includes("Hide")) {
    closeSectionForm();
  } else {
    openSectionForm();
  }
}

function handleSectionInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddSection();
  }
}

function handleSectionListClick(event) {
  const btn = event.target.closest("button[data-remove-section]");
  if (!btn) {return;}
  handleRemoveSection(btn.dataset.removeSection);
}

function handleTaskSectionSelectChange() {
  renderTaskSubsectionOptions();
}

function handleNavButtonClick(event) {
  const btn = event.currentTarget;
  const view = btn?.dataset?.view;
  const action = btn?.dataset?.action;
  if (action === "toggle-calendar-split") {
    state.tasksCalendarSplit = !state.tasksCalendarSplit;
    if (state.tasksCalendarSplit) {
      state.calendarViewMode = "day";
      state.calendarAnchorDate = new Date();
      updateUrlWithCalendarView("day");
    }
    switchView("tasks", {
      focusCalendar: state.tasksCalendarSplit,
      updateUrl: false,
      historyMode: "replace"
    });
    return;
  }
  if (view === "tasks") {
    goHome();
    return;
  }
  if (view === "calendar") {
    invalidateExternalEventsCache();
    state.calendarExternalAllowFetch = true;
  }
  if (view) {
    switchView(view);
  }
}

function handleSettingsToggleClick() {
  switchView("settings");
}

async function handleFavoritesClick(event) {
  const toggleBtn = event.target.closest("[data-fav-toggle]");
  if (toggleBtn) {
    await toggleFavoriteGroup(toggleBtn.dataset.favToggle || "");
    return;
  }
  const subToggleBtn = event.target.closest("[data-fav-sub-toggle]");
  if (subToggleBtn) {
    await toggleFavoriteSubsection(subToggleBtn.dataset.favSubToggle || "");
    return;
  }
  const btn = event.target.closest("[data-fav-jump]");
  if (!btn) {return;}
  const type = btn.dataset.favType;
  const sectionId = btn.dataset.sectionId || "";
  const subsectionId = btn.dataset.subsectionId || "";
  switchView("tasks");
  if (type === "subsection") {
    setZoomFilter({ type: "subsection", sectionId, subsectionId });
  } else {
    setZoomFilter({ type: "section", sectionId });
  }
}

function handleFavoritesDragStart(event) {
  const item = event.target.closest("[data-fav-row]");
  if (!item) {return;}
  const favKey = item.dataset.favKey || "";
  if (!favKey) {return;}
  const favGroup = item.dataset.favGroup || "";
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", favKey);
  item.classList.add("opacity-60");
  sidebarFavorites.dataset.draggingKey = favKey;
  sidebarFavorites.dataset.draggingGroup = favGroup;
}

function handleFavoritesDragOver(event) {
  event.preventDefault();
  const draggingKey = sidebarFavorites.dataset.draggingKey;
  if (!draggingKey) {return;}
  const draggingGroup = sidebarFavorites.dataset.draggingGroup;
  const target = event.target.closest("[data-fav-row]");
  if (!target || target.dataset.favKey === draggingKey) {return;}
  if (draggingGroup && target.dataset.favGroup !== draggingGroup) {return;}
  const rect = target.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height * HALF;
  if (after) {
    target.after(
      sidebarFavorites.querySelector(`[data-fav-row][data-fav-key="${draggingKey}"]`)
    );
  } else {
    target.before(
      sidebarFavorites.querySelector(`[data-fav-row][data-fav-key="${draggingKey}"]`)
    );
  }
}

async function handleFavoritesDrop(event) {
  event.preventDefault();
  const draggingKey = sidebarFavorites.dataset.draggingKey;
  if (!draggingKey) {return;}
  const orderedKeys = [...sidebarFavorites.querySelectorAll("[data-fav-row]")]
    .map((node) => node.dataset.favKey || "")
    .filter(Boolean);
  await updateFavoriteOrder(orderedKeys);
}

function handleFavoritesDragEnd(event) {
  const item = event.target.closest("[data-fav-row]");
  if (item) {
    item.classList.remove("opacity-60");
  }
  delete sidebarFavorites.dataset.draggingKey;
  delete sidebarFavorites.dataset.draggingGroup;
}

async function handleSubsectionFormSubmitEvent(event) {
  event.preventDefault();
  await handleSubsectionFormSubmit();
}

async function handleTaskListTabIndent(event) {
  if (event.key !== "Tab") {return;}
  const target = event.target;
  if (!(target instanceof HTMLElement)) {return;}
  const card = target.closest("[data-task-id]");
  if (!card || card !== document.activeElement) {return;}
  event.preventDefault();
  event.stopPropagation();
  if (event.shiftKey) {
    const handled = await outdentSelectedTasks();
    if (!handled) {
      await outdentTask(card);
    }
  } else {
    const handled = await indentSelectedTasks();
    if (!handled) {
      await indentTaskUnderPrevious(card);
    }
  }
}

function handleTaskFormWrapClick(event) {
  if (event.target === taskFormWrap) {
    closeTaskForm();
  }
}

async function handleRepeatCompleteListClick(event) {
  const btn = event.target.closest("[data-repeat-complete-date]");
  if (!btn) {return;}
  await handleRepeatOccurrenceComplete(
    btn.dataset.repeatCompleteTask || "",
    btn.dataset.repeatCompleteDate || ""
  );
}

function handleDocumentKeydown(event) {
  if (!taskFormWrap) {return;}
  if (event.key === "Escape" && !taskFormWrap.classList.contains("hidden")) {
    closeTaskForm();
  }
}

async function handleRepeatOccurrenceCompleteEvent(event) {
  const detail = event?.detail || {};
  if (!detail.taskId || !detail.occurrenceIso) {return;}
  await handleRepeatOccurrenceComplete(detail.taskId, detail.occurrenceIso);
}

function handleTaskEditEvent(event) {
  const detail = event?.detail || {};
  if (!detail.taskId) {return;}
  const shouldSwitch = detail.switchView !== false;
  openTaskEditById(detail.taskId, { switchView: shouldSwitch });
}

function registerEventListeners() {
  registerTimeMapHandlers();
  registerTaskFormHandlers();
  registerSectionHandlers();
  registerNavigationHandlers();
  initSidebarToggle();
  registerFavoritesHandlers();
  registerListHandlers();
  registerSubsectionHandlers();
  registerModalHandlers();
  registerKeyboardHandlers();
  registerCustomEventHandlers();
  registerRepeatEventHandlers();
  setRepeatFromSelection({ ...DEFAULT_TASK_REPEAT });
}

function registerTimeMapHandlers() {
  document.getElementById("timemap-form")?.addEventListener("submit", handleTimeMapSubmit);
  document.getElementById("timemap-set-default")?.addEventListener("click", handleSetDefaultTimeMap);
  document.getElementById("timemap-reset")?.addEventListener("click", resetTimeMapForm);
  timeMapCancel?.addEventListener("click", handleTimeMapCancelClick);
  timeMapToggle?.addEventListener("click", handleTimeMapToggleClick);
  timeMapList?.addEventListener("click", handleTimeMapListClickEvent);
}

function registerTaskFormHandlers() {
  const cleanupFns = [];
  document.getElementById("task-form")?.addEventListener("submit", handleTaskSubmit);
  if (taskLinkInput && taskLinkClearBtn) {
    const syncClear = () => toggleClearButtonVisibility(taskLinkInput, taskLinkClearBtn);
    taskLinkInput.addEventListener("input", syncClear);
    taskLinkClearBtn.addEventListener("click", handleTaskLinkClearClick);
    syncClear();
    cleanupFns.push(() => taskLinkInput?.removeEventListener("input", syncClear));
    cleanupFns.push(() => taskLinkClearBtn?.removeEventListener("click", handleTaskLinkClearClick));
  }
  const taskStartFromClearBtn = document.querySelector('[data-test-skedpal="task-start-from-clear"]');
  const taskDeadlineClearBtn = document.querySelector('[data-test-skedpal="task-deadline-clear"]');
  if (domRefs.taskStartFromInput && taskStartFromClearBtn) {
    const syncStartFromClear = () =>
      toggleClearButtonVisibility(domRefs.taskStartFromInput, taskStartFromClearBtn);
    domRefs.taskStartFromInput.addEventListener("input", syncStartFromClear);
    taskStartFromClearBtn.addEventListener("click", handleTaskStartFromClearClick);
    syncStartFromClear();
    cleanupFns.push(() =>
      domRefs.taskStartFromInput?.removeEventListener("input", syncStartFromClear)
    );
    cleanupFns.push(() =>
      taskStartFromClearBtn?.removeEventListener("click", handleTaskStartFromClearClick)
    );
  }
  if (domRefs.taskDeadlineInput && taskDeadlineClearBtn) {
    const syncDeadlineClear = () =>
      toggleClearButtonVisibility(domRefs.taskDeadlineInput, taskDeadlineClearBtn);
    domRefs.taskDeadlineInput.addEventListener("input", syncDeadlineClear);
    taskDeadlineClearBtn.addEventListener("click", handleTaskDeadlineClearClick);
    syncDeadlineClear();
    cleanupFns.push(() =>
      domRefs.taskDeadlineInput?.removeEventListener("input", syncDeadlineClear)
    );
    cleanupFns.push(() =>
      taskDeadlineClearBtn?.removeEventListener("click", handleTaskDeadlineClearClick)
    );
  }
  if (taskDurationInput) {
    taskDurationInput.addEventListener("input", syncTaskDurationHelper);
    syncTaskDurationHelper();
  }
  if (domRefs.taskTitleInput) {
    const handleTitleInput = () => updateTaskTitleHelper();
    domRefs.taskTitleInput.addEventListener("input", handleTitleInput);
    updateTaskTitleHelper();
    cleanupFns.push(() => domRefs.taskTitleInput?.removeEventListener("input", handleTitleInput));
  }
  if (taskPriorityInput) {
    const applyPriority = () => applyPrioritySelectColor(taskPriorityInput);
    taskPriorityInput.addEventListener("change", applyPriority);
    applyPriority();
  }
  taskToggle?.addEventListener("click", handleTaskToggleClick);
  taskList?.addEventListener("click", handleTaskListClickEvent);
  taskList?.addEventListener("dblclick", handleTaskListDoubleClickEvent);
  todayList?.addEventListener("click", handleTodayListClickEvent);
  todayList?.addEventListener("dblclick", handleTodayListDoubleClickEvent);
  reportList?.addEventListener("click", handleReportListClickEvent);
  reportList?.addEventListener("dblclick", handleReportListDoubleClickEvent);
  rescheduleButtons.forEach((btn) => btn.addEventListener("click", handleReschedule));
  cleanupFns.push(initTaskTemplateSelect());
  cleanupFns.push(initTaskListAssistant());
  cleanupFns.push(() => taskList?.removeEventListener("dblclick", handleTaskListDoubleClickEvent));
  cleanupFns.push(() => todayList?.removeEventListener("dblclick", handleTodayListDoubleClickEvent));
  cleanupFns.push(() => reportList?.removeEventListener("dblclick", handleReportListDoubleClickEvent));
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerSectionHandlers() {
  sectionAddBtn?.addEventListener("click", handleAddSection);
  sectionFormToggle?.addEventListener("click", handleSectionFormToggleClick);
  sectionInput?.addEventListener("keydown", handleSectionInputKeydown);
  sectionList?.addEventListener("click", handleSectionListClick);
  taskSectionSelect?.addEventListener("change", handleTaskSectionSelectChange);
}

function registerNavigationHandlers() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", handleNavButtonClick);
  });
  settingsToggleBtn?.addEventListener("click", handleSettingsToggleClick);
  window.addEventListener("popstate", applyNavigationFromUrl);
}

function registerFavoritesHandlers() {
  sidebarFavorites?.addEventListener("click", handleFavoritesClick);
  sidebarFavorites?.addEventListener("dragstart", handleFavoritesDragStart);
  sidebarFavorites?.addEventListener("dragover", handleFavoritesDragOver);
  sidebarFavorites?.addEventListener("drop", handleFavoritesDrop);
  sidebarFavorites?.addEventListener("dragend", handleFavoritesDragEnd);
}

function registerListHandlers() {
  subsectionModalCloseBtns.forEach((btn) => btn.addEventListener("click", closeSubsectionModal));
  if (subsectionTaskPriorityInput) {
    const applyPriority = () => applyPrioritySelectColor(subsectionTaskPriorityInput);
    subsectionTaskPriorityInput.addEventListener("change", applyPriority);
    applyPriority();
  }
  subsectionForm?.addEventListener("submit", handleSubsectionFormSubmitEvent);
  taskList?.addEventListener("keydown", handleSubsectionInputKeydown);
}

async function handleSubsectionInputKeydown(event) {
  if (event.key !== "Enter") {return;}
  const input = event.target;
  if (!(input instanceof HTMLElement)) {return;}
  if (input.matches("[data-subsection-input]")) {
    event.preventDefault();
    await handleSubsectionInputSubmit(input);
    return;
  }
  if (input.matches("[data-child-subsection-input]")) {
    event.preventDefault();
    await handleChildSubsectionInputSubmit(input);
  }
}

async function handleSubsectionInputSubmit(input) {
  const sectionId = input.dataset.subsectionInput || "";
  const value = input.value || "";
  if (!value.trim()) {return;}
  await handleAddSubsection(sectionId, value);
  input.value = "";
  const wrap = input.closest(`[data-subsection-form="${sectionId}"]`);
  wrap?.classList.add("hidden");
}

async function handleChildSubsectionInputSubmit(input) {
  const parentSubId = input.dataset.childSubsectionInput || "";
  const card = input.closest(`[data-subsection-card="${parentSubId}"]`);
  const parentSectionId = card?.closest("[data-section-card]")?.dataset.sectionCard || "";
  const value = input.value || "";
  if (!value.trim()) {return;}
  await handleAddSubsection(parentSectionId, value, parentSubId);
  input.value = "";
  const wrap = input.closest(`[data-child-subsection-form="${parentSubId}"]`);
  wrap?.classList.add("hidden");
}

function registerSubsectionHandlers() {
  taskList?.addEventListener("keydown", handleTaskListTabIndent);
}

function registerModalHandlers() {
  taskFormWrap?.addEventListener("click", handleTaskFormWrapClick);
  taskModalCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskForm));
  repeatCompleteCloseBtns.forEach((btn) =>
    btn.addEventListener("click", closeRepeatCompleteModal)
  );
  repeatCompleteList?.addEventListener("click", handleRepeatCompleteListClick);
  initTaskReminderModal();
  initDatePicker();
  initTaskModalSections();
  initTaskPriorityDropdown();
}

function registerKeyboardHandlers() {
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("keydown", handleNavigationShortcuts);
  window.addEventListener("auxclick", handleNavigationMouseButtons);
  if (typeof state.taskDeleteShortcutCleanup === "function") {
    state.taskDeleteShortcutCleanup();
  }
  state.taskDeleteShortcutCleanup = initTaskDeleteShortcut();
}

function registerCustomEventHandlers() {
  window.addEventListener("skedpal:repeat-occurrence-complete", handleRepeatOccurrenceCompleteEvent);
  window.addEventListener("skedpal:task-edit", handleTaskEditEvent);
}

function clearNewTaskParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("newTask");
  url.searchParams.delete("title");
  url.searchParams.delete("url");
  history.replaceState({}, "", url.toString());
}

function handleNewTaskIntentFromUrl() {
  const payload = parseNewTaskFromUrl();
  if (!payload) {return;}
  openNewTaskWithDefaults(payload);
  clearNewTaskParams();
}

applyTheme();
initViewFromUrl(parseViewFromUrl);
registerEventListeners();
initCalendarView();
hydrate()
  .catch((error) => {
    console.error("Failed to hydrate SkedPal page.", error);
  })
  .finally(() => {
    handleNewTaskIntentFromUrl();
  });
