import { domRefs } from "./constants.js";
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
import { initSettings } from "./settings.js";
import {
  loadTasks,
  handleTaskSubmit,
  handleReschedule,
  syncTaskDurationHelper,
  updateScheduleSummary,
  startTaskInSection,
  handleRepeatOccurrenceComplete,
  closeRepeatCompleteModal,
  openTaskEditById
} from "./tasks/tasks-actions.js";
import { handleTaskListClick } from "./tasks/task-list-actions.js";
import {
  renderTaskSubsectionOptions,
  openSectionForm,
  closeSectionForm,
  handleAddSection,
  handleRemoveSection,
  closeSubsectionModal,
  handleSubsectionFormSubmit,
  handleAddSubsection,
  updateFavoriteOrder
} from "./sections.js";
import {
  handleNavigationShortcuts,
  handleNavigationMouseButtons,
  initViewFromUrl,
  pushNavigation,
  setZoomFilter,
  switchView,
  goHome
} from "./navigation.js";
import {
  applyPrioritySelectColor,
  parseZoomFromUrl,
  parseViewFromUrl,
  toggleClearButtonVisibility
} from "./utils.js";
import { closeTaskForm } from "./ui.js";
import { indentTaskUnderPrevious, outdentTask } from "./tasks/tasks-sortable.js";
import { state } from "./state/page-state.js";
import { initCalendarView } from "./calendar.js";
import { applyTheme } from "./theme.js";

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
  await loadTasks();
  const initialZoom = parseZoomFromUrl();
  if (initialZoom) {
    setZoomFilter(initialZoom);
  } else {
    pushNavigation(null);
  }
  await updateScheduleSummary();
}

function registerEventListeners() {
  registerTimeMapHandlers();
  registerTaskFormHandlers();
  registerSectionHandlers();
  registerNavigationHandlers();
  registerFavoritesHandlers();
  registerListHandlers();
  registerSubsectionHandlers();
  registerModalHandlers();
  registerKeyboardHandlers();
  registerCustomEventHandlers();
  registerRepeatEventHandlers();
  setRepeatFromSelection({ type: "none" });
}

function registerTimeMapHandlers() {
  document.getElementById("timemap-form")?.addEventListener("submit", handleTimeMapSubmit);
  document.getElementById("timemap-set-default")?.addEventListener("click", handleSetDefaultTimeMap);
  document.getElementById("timemap-reset")?.addEventListener("click", resetTimeMapForm);
  timeMapCancel?.addEventListener("click", () => {
    resetTimeMapForm();
    closeTimeMapForm();
  });
  timeMapToggle?.addEventListener("click", () => {
    if (timeMapFormWrap.classList.contains("hidden")) {
      openTimeMapForm();
    } else {
      closeTimeMapForm();
    }
  });
  timeMapList?.addEventListener("click", async (event) => {
    await handleTimeMapListClick(event, state.tasksTimeMapsCache);
  });
}

function registerTaskFormHandlers() {
  document.getElementById("task-form")?.addEventListener("submit", handleTaskSubmit);
  if (taskLinkInput && taskLinkClearBtn) {
    const syncClear = () => toggleClearButtonVisibility(taskLinkInput, taskLinkClearBtn);
    taskLinkInput.addEventListener("input", syncClear);
    taskLinkClearBtn.addEventListener("click", () => {
      taskLinkInput.value = "";
      taskLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
      taskLinkInput.focus();
    });
    syncClear();
  }
  if (taskDurationInput) {
    taskDurationInput.addEventListener("input", syncTaskDurationHelper);
    syncTaskDurationHelper();
  }
  if (taskPriorityInput) {
    const applyPriority = () => applyPrioritySelectColor(taskPriorityInput);
    taskPriorityInput.addEventListener("change", applyPriority);
    applyPriority();
  }
  taskToggle?.addEventListener("click", () => {
    startTaskInSection();
  });
  taskList?.addEventListener("click", async (event) => {
    await handleTaskListClick(event);
  });
  todayList?.addEventListener("click", async (event) => {
    await handleTaskListClick(event);
  });
  rescheduleButtons.forEach((btn) => btn.addEventListener("click", handleReschedule));
}

function registerSectionHandlers() {
  sectionAddBtn?.addEventListener("click", handleAddSection);
  sectionFormToggle?.addEventListener("click", () => {
    if (sectionFormToggle.classList.contains("hidden")) {return;}
    if (sectionFormToggle.textContent?.includes("Hide")) {
      closeSectionForm();
    } else {
      openSectionForm();
    }
  });
  sectionInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddSection();
    }
  });
  sectionList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-remove-section]");
    if (!btn) {return;}
    handleRemoveSection(btn.dataset.removeSection);
  });
  taskSectionSelect?.addEventListener("change", () => renderTaskSubsectionOptions());
}

function registerNavigationHandlers() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view === "tasks") {
        goHome();
        return;
      }
      switchView(btn.dataset.view);
    });
  });
  settingsToggleBtn?.addEventListener("click", () => switchView("settings"));
}

function registerFavoritesHandlers() {
  sidebarFavorites?.addEventListener("click", (event) => {
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
  });
  sidebarFavorites?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-fav-row]");
    if (!item) {return;}
    const favKey = item.dataset.favKey || "";
    if (!favKey) {return;}
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", favKey);
    item.classList.add("opacity-60");
    sidebarFavorites.dataset.draggingKey = favKey;
  });
  sidebarFavorites?.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingKey = sidebarFavorites.dataset.draggingKey;
    if (!draggingKey) {return;}
    const target = event.target.closest("[data-fav-row]");
    if (!target || target.dataset.favKey === draggingKey) {return;}
    const rect = target.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (after) {
      target.after(
        sidebarFavorites.querySelector(`[data-fav-row][data-fav-key="${draggingKey}"]`)
      );
    } else {
      target.before(
        sidebarFavorites.querySelector(`[data-fav-row][data-fav-key="${draggingKey}"]`)
      );
    }
  });
  sidebarFavorites?.addEventListener("drop", async (event) => {
    event.preventDefault();
    const draggingKey = sidebarFavorites.dataset.draggingKey;
    if (!draggingKey) {return;}
    const orderedKeys = [...sidebarFavorites.querySelectorAll("[data-fav-row]")]
      .map((node) => node.dataset.favKey || "")
      .filter(Boolean);
    await updateFavoriteOrder(orderedKeys);
  });
  sidebarFavorites?.addEventListener("dragend", (event) => {
    const item = event.target.closest("[data-fav-row]");
    if (item) {
      item.classList.remove("opacity-60");
    }
    delete sidebarFavorites.dataset.draggingKey;
  });
}

function registerListHandlers() {
  subsectionModalCloseBtns.forEach((btn) => btn.addEventListener("click", closeSubsectionModal));
  if (subsectionTaskPriorityInput) {
    const applyPriority = () => applyPrioritySelectColor(subsectionTaskPriorityInput);
    subsectionTaskPriorityInput.addEventListener("change", applyPriority);
    applyPriority();
  }
  subsectionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubsectionFormSubmit();
  });
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
  taskList?.addEventListener("keydown", async (event) => {
    if (event.key !== "Tab") {return;}
    const target = event.target;
    if (!(target instanceof HTMLElement)) {return;}
    const card = target.closest("[data-task-id]");
    if (!card || card !== document.activeElement) {return;}
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      await outdentTask(card);
    } else {
      await indentTaskUnderPrevious(card);
    }
  });
}

function registerModalHandlers() {
  taskFormWrap?.addEventListener("click", (event) => {
    if (event.target === taskFormWrap) {
      closeTaskForm();
    }
  });
  taskModalCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskForm));
  repeatCompleteCloseBtns.forEach((btn) =>
    btn.addEventListener("click", closeRepeatCompleteModal)
  );
  repeatCompleteList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-repeat-complete-date]");
    if (!btn) {return;}
    await handleRepeatOccurrenceComplete(
      btn.dataset.repeatCompleteTask || "",
      btn.dataset.repeatCompleteDate || ""
    );
  });
}

function registerKeyboardHandlers() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !taskFormWrap.classList.contains("hidden")) {
      closeTaskForm();
    }
  });
  window.addEventListener("keydown", handleNavigationShortcuts);
  window.addEventListener("auxclick", handleNavigationMouseButtons);
}

function registerCustomEventHandlers() {
  window.addEventListener("skedpal:repeat-occurrence-complete", async (event) => {
    const detail = event?.detail || {};
    if (!detail.taskId || !detail.occurrenceIso) {return;}
    await handleRepeatOccurrenceComplete(detail.taskId, detail.occurrenceIso);
  });
  window.addEventListener("skedpal:task-edit", (event) => {
    const detail = event?.detail || {};
    if (!detail.taskId) {return;}
    const shouldSwitch = detail.switchView !== false;
    openTaskEditById(detail.taskId, { switchView: shouldSwitch });
  });
}

applyTheme();
initViewFromUrl(parseViewFromUrl);
registerEventListeners();
initCalendarView();
hydrate();
