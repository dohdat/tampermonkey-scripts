import { DEFAULT_TASK_REPEAT, HALF, domRefs } from "./constants.js";
import {
  resetTimeMapForm,
  handleTimeMapSubmit,
  handleSetDefaultTimeMap,
  handleTimeMapListClick,
  openTimeMapForm,
  closeTimeMapForm
} from "./time-maps.js";
import { setRepeatFromSelection } from "./repeat.js";
import { registerRepeatEventHandlers } from "./repeat-events.js";
import {
  handleRepeatOccurrenceComplete,
  closeRepeatCompleteModal,
  openTaskEditById
} from "./tasks/tasks-actions.js";
import {
  handleTaskListInputKeydown,
  handleTaskListInputPaste
} from "./tasks/task-list-inputs.js";
import { initTaskReminderModal, cleanupTaskReminderModal } from "./tasks/task-reminders.js";
import { registerTaskFormHandlers } from "./page-task-listeners.js";
import {
  renderTaskSubsectionOptions,
  openSectionForm,
  closeSectionForm,
  handleAddSection,
  closeSubsectionModal,
  handleSubsectionFormSubmit
} from "./sections.js";
import { handleSectionInputKeydown, handleSectionListClick } from "./section-inputs.js";
import {
  updateFavoriteOrder,
  toggleFavoriteGroup,
  toggleFavoriteSubsection
} from "./sections-favorites.js";
import {
  applyNavigationFromUrl,
  handleNavigationShortcuts,
  handleNavigationMouseButtons,
  setZoomFilter,
  switchView,
  goHome
} from "./navigation.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";
import { applyPrioritySelectColor, updateUrlWithCalendarView } from "./utils.js";
import { closeTaskForm } from "./ui.js";
import { indentTaskUnderPrevious, outdentTask } from "./tasks/tasks-sortable.js";
import { indentSelectedTasks, outdentSelectedTasks } from "./tasks/task-multi-select.js";
import { state } from "./state/page-state.js";
import { initSidebarToggle } from "./sidebar-toggle.js";
import { initDatePicker } from "./date-picker.js";
import { initTaskModalSections } from "./task-modal-sections.js";
import { initTaskPriorityDropdown } from "./tasks/task-priority-dropdown.js";
import { initTaskDeleteShortcut } from "./tasks/task-delete-shortcut.js";

const {
  timeMapFormWrap,
  timeMapToggle,
  timeMapCancel,
  taskFormWrap,
  taskModalCloseButtons,
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
  timeMapList,
  repeatCompleteList,
  repeatCompleteCloseBtns,
  subsectionTaskPriorityInput
} = domRefs;

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

function handleSectionFormToggleClick() {
  if (sectionFormToggle.classList.contains("hidden")) {return;}
  if (sectionFormToggle.textContent?.includes("Hide")) {
    closeSectionForm();
  } else {
    openSectionForm();
  }
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

async function handleRepeatCompleteListClick(event) {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  if (!target) {return;}
  const separator = target.closest("[data-repeat-complete-separator]");
  if (separator) {
    const targetId = separator.getAttribute("aria-controls");
    if (!targetId) {return;}
    const target = document.getElementById(targetId);
    if (!target) {return;}
    const isHidden = target.classList.contains("hidden");
    if (isHidden) {
      target.classList.remove("hidden");
      separator.classList.add("repeat-complete-separator--open");
      separator.setAttribute("aria-expanded", "true");
    } else {
      target.classList.add("hidden");
      separator.classList.remove("repeat-complete-separator--open");
      separator.setAttribute("aria-expanded", "false");
    }
    return;
  }
  const btn = target.closest("[data-repeat-complete-date]");
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

export function registerEventListeners() {
  if (typeof state.pageCleanup === "function") {
    state.pageCleanup();
  }
  const cleanupFns = [
    registerTimeMapHandlers(),
    registerTaskFormHandlers(),
    registerSectionHandlers(),
    registerNavigationHandlers(),
    initSidebarToggle(),
    registerFavoritesHandlers(),
    registerListHandlers(),
    registerSubsectionHandlers(),
    registerModalHandlers(),
    registerKeyboardHandlers(),
    registerCustomEventHandlers(),
    registerRepeatEventHandlers()
  ];

  setRepeatFromSelection({ ...DEFAULT_TASK_REPEAT });

  const cleanupAll = () => {
    cleanupFns.forEach((cleanup) => cleanup?.());
    cleanupFns.length = 0;
    if (state.pageCleanup === cleanupAll) {
      state.pageCleanup = null;
    }
  };

  function handlePageHide() {
    cleanupAll();
  }

  window.addEventListener("pagehide", handlePageHide);
  cleanupFns.push(() => window.removeEventListener("pagehide", handlePageHide));

  state.pageCleanup = cleanupAll;
  return cleanupAll;
}

function registerTimeMapHandlers() {
  const cleanupFns = [];
  const timeMapForm = document.getElementById("timemap-form");
  const timeMapSetDefault = document.getElementById("timemap-set-default");
  const timeMapReset = document.getElementById("timemap-reset");
  if (timeMapForm) {
    timeMapForm.addEventListener("submit", handleTimeMapSubmit);
    cleanupFns.push(() => timeMapForm.removeEventListener("submit", handleTimeMapSubmit));
  }
  if (timeMapSetDefault) {
    timeMapSetDefault.addEventListener("click", handleSetDefaultTimeMap);
    cleanupFns.push(() => timeMapSetDefault.removeEventListener("click", handleSetDefaultTimeMap));
  }
  if (timeMapReset) {
    timeMapReset.addEventListener("click", resetTimeMapForm);
    cleanupFns.push(() => timeMapReset.removeEventListener("click", resetTimeMapForm));
  }
  if (timeMapCancel) {
    timeMapCancel.addEventListener("click", handleTimeMapCancelClick);
    cleanupFns.push(() => timeMapCancel.removeEventListener("click", handleTimeMapCancelClick));
  }
  if (timeMapToggle) {
    timeMapToggle.addEventListener("click", handleTimeMapToggleClick);
    cleanupFns.push(() => timeMapToggle.removeEventListener("click", handleTimeMapToggleClick));
  }
  if (timeMapList) {
    timeMapList.addEventListener("click", handleTimeMapListClickEvent);
    cleanupFns.push(() => timeMapList.removeEventListener("click", handleTimeMapListClickEvent));
  }
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerSectionHandlers() {
  const cleanupFns = [];
  if (sectionAddBtn) {
    sectionAddBtn.addEventListener("click", handleAddSection);
    cleanupFns.push(() => sectionAddBtn.removeEventListener("click", handleAddSection));
  }
  if (sectionFormToggle) {
    sectionFormToggle.addEventListener("click", handleSectionFormToggleClick);
    cleanupFns.push(() =>
      sectionFormToggle.removeEventListener("click", handleSectionFormToggleClick)
    );
  }
  if (sectionInput) {
    sectionInput.addEventListener("keydown", handleSectionInputKeydown);
    cleanupFns.push(() => sectionInput.removeEventListener("keydown", handleSectionInputKeydown));
  }
  if (sectionList) {
    sectionList.addEventListener("click", handleSectionListClick);
    cleanupFns.push(() => sectionList.removeEventListener("click", handleSectionListClick));
  }
  if (taskSectionSelect) {
    taskSectionSelect.addEventListener("change", handleTaskSectionSelectChange);
    cleanupFns.push(() =>
      taskSectionSelect.removeEventListener("change", handleTaskSectionSelectChange)
    );
  }
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerNavigationHandlers() {
  const cleanupFns = [];
  navButtons.forEach((btn) => {
    btn.addEventListener("click", handleNavButtonClick);
    cleanupFns.push(() => btn.removeEventListener("click", handleNavButtonClick));
  });
  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener("click", handleSettingsToggleClick);
    cleanupFns.push(() =>
      settingsToggleBtn.removeEventListener("click", handleSettingsToggleClick)
    );
  }
  window.addEventListener("popstate", applyNavigationFromUrl);
  cleanupFns.push(() => window.removeEventListener("popstate", applyNavigationFromUrl));
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerFavoritesHandlers() {
  const cleanupFns = [];
  if (sidebarFavorites) {
    sidebarFavorites.addEventListener("click", handleFavoritesClick);
    sidebarFavorites.addEventListener("dragstart", handleFavoritesDragStart);
    sidebarFavorites.addEventListener("dragover", handleFavoritesDragOver);
    sidebarFavorites.addEventListener("drop", handleFavoritesDrop);
    sidebarFavorites.addEventListener("dragend", handleFavoritesDragEnd);
    cleanupFns.push(() => sidebarFavorites.removeEventListener("click", handleFavoritesClick));
    cleanupFns.push(() =>
      sidebarFavorites.removeEventListener("dragstart", handleFavoritesDragStart)
    );
    cleanupFns.push(() =>
      sidebarFavorites.removeEventListener("dragover", handleFavoritesDragOver)
    );
    cleanupFns.push(() => sidebarFavorites.removeEventListener("drop", handleFavoritesDrop));
    cleanupFns.push(() =>
      sidebarFavorites.removeEventListener("dragend", handleFavoritesDragEnd)
    );
  }
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerListHandlers() {
  const cleanupFns = [];
  subsectionModalCloseBtns.forEach((btn) => {
    btn.addEventListener("click", closeSubsectionModal);
    cleanupFns.push(() => btn.removeEventListener("click", closeSubsectionModal));
  });
  if (subsectionTaskPriorityInput) {
    const applyPriority = () => applyPrioritySelectColor(subsectionTaskPriorityInput);
    subsectionTaskPriorityInput.addEventListener("change", applyPriority);
    applyPriority();
    cleanupFns.push(() =>
      subsectionTaskPriorityInput.removeEventListener("change", applyPriority)
    );
  }
  if (subsectionForm) {
    subsectionForm.addEventListener("submit", handleSubsectionFormSubmitEvent);
    cleanupFns.push(() =>
      subsectionForm.removeEventListener("submit", handleSubsectionFormSubmitEvent)
    );
  }
  if (taskList) {
    taskList.addEventListener("keydown", handleTaskListInputKeydown);
    cleanupFns.push(() => taskList.removeEventListener("keydown", handleTaskListInputKeydown));
    taskList.addEventListener("paste", handleTaskListInputPaste);
    cleanupFns.push(() => taskList.removeEventListener("paste", handleTaskListInputPaste));
  }
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerSubsectionHandlers() {
  const cleanupFns = [];
  if (taskList) {
    taskList.addEventListener("keydown", handleTaskListTabIndent);
    cleanupFns.push(() => taskList.removeEventListener("keydown", handleTaskListTabIndent));
  }
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerModalHandlers() {
  const cleanupFns = [];
  taskModalCloseButtons.forEach((btn) => {
    btn.addEventListener("click", closeTaskForm);
    cleanupFns.push(() => btn.removeEventListener("click", closeTaskForm));
  });
  repeatCompleteCloseBtns.forEach((btn) => {
    btn.addEventListener("click", closeRepeatCompleteModal);
    cleanupFns.push(() => btn.removeEventListener("click", closeRepeatCompleteModal));
  });
  if (repeatCompleteList) {
    repeatCompleteList.addEventListener("click", handleRepeatCompleteListClick);
    cleanupFns.push(() =>
      repeatCompleteList.removeEventListener("click", handleRepeatCompleteListClick)
    );
  }
  initTaskReminderModal();
  cleanupFns.push(() => cleanupTaskReminderModal());
  cleanupFns.push(initDatePicker());
  cleanupFns.push(initTaskModalSections());
  cleanupFns.push(initTaskPriorityDropdown());
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerKeyboardHandlers() {
  const cleanupFns = [];
  document.addEventListener("keydown", handleDocumentKeydown);
  cleanupFns.push(() => document.removeEventListener("keydown", handleDocumentKeydown));
  window.addEventListener("keydown", handleNavigationShortcuts);
  cleanupFns.push(() => window.removeEventListener("keydown", handleNavigationShortcuts));
  window.addEventListener("auxclick", handleNavigationMouseButtons);
  cleanupFns.push(() => window.removeEventListener("auxclick", handleNavigationMouseButtons));
  if (typeof state.taskDeleteShortcutCleanup === "function") {
    state.taskDeleteShortcutCleanup();
  }
  state.taskDeleteShortcutCleanup = initTaskDeleteShortcut();
  cleanupFns.push(() => {
    if (typeof state.taskDeleteShortcutCleanup === "function") {
      state.taskDeleteShortcutCleanup();
    }
    state.taskDeleteShortcutCleanup = null;
  });
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerCustomEventHandlers() {
  const cleanupFns = [];
  window.addEventListener("skedpal:repeat-occurrence-complete", handleRepeatOccurrenceCompleteEvent);
  cleanupFns.push(() =>
    window.removeEventListener(
      "skedpal:repeat-occurrence-complete",
      handleRepeatOccurrenceCompleteEvent
    )
  );
  window.addEventListener("skedpal:task-edit", handleTaskEditEvent);
  cleanupFns.push(() => window.removeEventListener("skedpal:task-edit", handleTaskEditEvent));
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
