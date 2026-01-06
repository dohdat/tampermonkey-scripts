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
  handleTaskListClick,
  handleReschedule,
  updateScheduleSummary,
  startTaskInSection
} from "./tasks/tasks-actions.js";
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
import { parseZoomFromUrl, parseViewFromUrl } from "./utils.js";
import { closeTaskForm } from "./ui.js";
import { indentTaskUnderPrevious, outdentTask } from "./tasks/tasks-sortable.js";
import { state } from "./state/page-state.js";

const {
  timeMapDayRows,
  timeMapFormWrap,
  timeMapToggle,
  timeMapCancel,
  taskFormWrap,
  taskToggle,
  taskModalCloseButtons,
  sectionAddBtn,
  sectionFormToggle,
  sectionInput,
  sectionList,
  taskSectionSelect,
  navButtons,
  settingsToggleBtn,
  sidebarFavorites,
  horizonInput,
  subsectionForm,
  subsectionModalCloseBtns,
  taskList,
  todayList,
  timeMapList,
  rescheduleButtons
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
  document.getElementById("timemap-form")?.addEventListener("submit", handleTimeMapSubmit);
  document.getElementById("timemap-set-default")?.addEventListener("click", handleSetDefaultTimeMap);
  document.getElementById("task-form")?.addEventListener("submit", handleTaskSubmit);
  document.getElementById("timemap-reset")?.addEventListener("click", resetTimeMapForm);
  timeMapCancel?.addEventListener("click", () => {
    resetTimeMapForm();
    closeTimeMapForm();
  });

  rescheduleButtons.forEach((btn) => btn.addEventListener("click", handleReschedule));

  sectionAddBtn?.addEventListener("click", handleAddSection);
  sectionFormToggle?.addEventListener("click", () => {
    if (sectionFormToggle.classList.contains("hidden")) return;
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
    if (!btn) return;
    handleRemoveSection(btn.dataset.removeSection);
  });
  taskSectionSelect?.addEventListener("change", () => renderTaskSubsectionOptions());

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

  sidebarFavorites?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-fav-jump]");
    if (!btn) return;
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
    if (!item) return;
    const favKey = item.dataset.favKey || "";
    if (!favKey) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", favKey);
    item.classList.add("opacity-60");
    sidebarFavorites.dataset.draggingKey = favKey;
  });

  sidebarFavorites?.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingKey = sidebarFavorites.dataset.draggingKey;
    if (!draggingKey) return;
    const target = event.target.closest("[data-fav-row]");
    if (!target || target.dataset.favKey === draggingKey) return;
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
    if (!draggingKey) return;
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

  timeMapToggle?.addEventListener("click", () => {
    if (timeMapFormWrap.classList.contains("hidden")) {
      openTimeMapForm();
    } else {
      closeTimeMapForm();
    }
  });

  taskToggle?.addEventListener("click", () => {
    startTaskInSection();
  });

  timeMapList?.addEventListener("click", async (event) => {
    await handleTimeMapListClick(event, state.tasksTimeMapsCache);
  });

  taskList?.addEventListener("click", async (event) => {
    await handleTaskListClick(event);
  });

  todayList?.addEventListener("click", async (event) => {
    await handleTaskListClick(event);
  });

  subsectionModalCloseBtns.forEach((btn) => btn.addEventListener("click", closeSubsectionModal));

  subsectionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubsectionFormSubmit();
  });

  taskList?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const input = event.target;
    if (!(input instanceof HTMLElement)) return;
    if (input.matches("[data-subsection-input]")) {
      event.preventDefault();
      const sectionId = input.dataset.subsectionInput || "";
      const value = input.value || "";
      if (value.trim()) {
        await handleAddSubsection(sectionId, value);
        input.value = "";
        const wrap = input.closest(`[data-subsection-form="${sectionId}"]`);
        wrap?.classList.add("hidden");
      }
    } else if (input.matches("[data-child-subsection-input]")) {
      event.preventDefault();
      const parentSubId = input.dataset.childSubsectionInput || "";
      const card = input.closest(`[data-subsection-card="${parentSubId}"]`);
      const parentSectionId = card?.closest("[data-section-card]")?.dataset.sectionCard || "";
      const value = input.value || "";
      if (value.trim()) {
        await handleAddSubsection(parentSectionId, value, parentSubId);
        input.value = "";
        const wrap = input.closest(`[data-child-subsection-form="${parentSubId}"]`);
        wrap?.classList.add("hidden");
      }
    }
  });

  taskFormWrap?.addEventListener("click", (event) => {
    if (event.target === taskFormWrap) {
      closeTaskForm();
    }
  });

  taskModalCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskForm));

  taskList?.addEventListener("keydown", async (event) => {
    if (event.key !== "Tab") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const card = target.closest("[data-task-id]");
    if (!card || card !== document.activeElement) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      await outdentTask(card);
    } else {
      await indentTaskUnderPrevious(card);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !taskFormWrap.classList.contains("hidden")) {
      closeTaskForm();
    }
  });

  window.addEventListener("keydown", handleNavigationShortcuts);
  window.addEventListener("auxclick", handleNavigationMouseButtons);

  registerRepeatEventHandlers();
  setRepeatFromSelection({ type: "none" });

  horizonInput?.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    const parsed = Number.isFinite(value) ? Math.max(1, Math.min(90, value)) : 14;
    event.target.value = parsed;
  });
}

initViewFromUrl(parseViewFromUrl);
registerEventListeners();
hydrate();
