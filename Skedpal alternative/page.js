import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveTask,
  deleteTask,
  saveTimeMap,
  deleteTimeMap,
  saveSettings,
  DEFAULT_SETTINGS
} from "./db.js";
import {
  bulletIconSvg,
  caretDownIconSvg,
  caretRightIconSvg,
  checkboxCheckedIconSvg,
  checkboxIconSvg,
  dayOptions,
  editIconSvg,
  favoriteIconSvg,
  plusIconSvg,
  removeIconSvg,
  subtaskIconSvg,
  TASK_PLACEHOLDER_CLASS,
  TASK_SORTABLE_STYLE_ID,
  TASK_SORT_GROUP,
  TASK_ZONE_CLASS,
  SUBTASK_ORDER_OFFSET,
  zoomInIconSvg,
  zoomOutIconSvg,
  sortableHighlightClasses,
  domRefs,
  homeIconSvg
} from "./constants.js";
import {
  updateUrlWithZoom,
  parseZoomFromUrl,
  uuid,
  normalizeTimeMap,
  formatDateTime,
  formatDate,
  formatDurationShort,
  getWeekdayShortLabel,
  getNthWeekday,
  formatOrdinal,
  formatRRuleDate,
  sortTasksByOrder,
  getContainerKey,
  getNextOrder,
  getNextSubtaskOrder,
  getTaskDepth,
  getTaskAndDescendants
} from "./utils.js";
import Sortable from "./sortable.esm.js";

const {
  views,
  navButtons,
  taskList,
  timeMapList,
  timeMapDayRows,
  timeMapFormWrap,
  timeMapToggle,
  taskFormWrap,
  taskToggle,
  taskModalCloseButtons,
  taskTimeMapOptions,
  taskDeadlineInput,
  taskStartFromInput,
  taskLinkInput,
  taskMinBlockInput,
  taskParentIdInput,
  taskSectionSelect,
  taskSubsectionSelect,
  taskRepeatSelect,
  taskRepeatCustom,
  taskRepeatUnit,
  taskRepeatInterval,
  taskRepeatWeekdays,
  taskRepeatMonthlyMode,
  taskRepeatMonthlyDay,
  taskRepeatMonthlyNth,
  taskRepeatMonthlyWeekday,
  taskRepeatWeeklySection,
  taskRepeatMonthlySection,
  taskRepeatMonthlyDayWrap,
  taskRepeatMonthlyNthWrap,
  taskRepeatEndNever,
  taskRepeatEndOn,
  taskRepeatEndAfter,
  taskRepeatEndDate,
  taskRepeatEndCount,
  repeatModal,
  repeatModalCloseBtns,
  repeatModalSaveBtn,
  subsectionFormWrap,
  subsectionForm,
  subsectionSectionIdInput,
  subsectionParentIdInput,
  subsectionNameInput,
  subsectionTaskTitleInput,
  subsectionTaskLinkInput,
  subsectionTaskDurationInput,
  subsectionTaskMinBlockInput,
  subsectionTaskPriorityInput,
  subsectionTaskDeadlineInput,
  subsectionTaskStartFromInput,
  subsectionTaskRepeatSelect,
  subsectionTimeMapOptions,
  subsectionModalCloseBtns,
  sectionList,
  sectionInput,
  sectionAddBtn,
  sectionFormRow,
  sectionFormToggle,
  timeMapColorInput,
  scheduleStatus,
  rescheduleButtons,
  scheduleSummary,
  horizonInput,
  notificationBanner,
  notificationMessage,
  notificationUndoButton,
  navBreadcrumb,
  settingsToggleBtn
} = domRefs;

let settingsCache = { ...DEFAULT_SETTINGS };
let tasksTimeMapsCache = [];
let tasksCache = [];
let zoomFilter = null;
const collapsedSections = new Set();
const collapsedSubsections = new Set();
const collapsedTasks = new Set();
const expandedTaskDetails = new Set();
let notificationHideTimeout = null;
let notificationUndoHandler = null;
let navStack = [];
let navIndex = -1;

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (!tag) return false;
  const name = tag.toLowerCase();
  return (
    target.isContentEditable ||
    name === "input" ||
    name === "textarea" ||
    name === "select" ||
    name === "option"
  );
}

function pushNavigation(filter) {
  navStack = navStack.slice(0, navIndex + 1);
  const snapshot = filter ? { ...filter } : null;
  navStack.push(snapshot);
  navIndex = navStack.length - 1;
}

function hideNotificationBanner() {
  if (notificationHideTimeout) {
    clearTimeout(notificationHideTimeout);
    notificationHideTimeout = null;
  }
  notificationBanner?.classList.add("hidden");
  if (notificationUndoButton) {
    notificationUndoButton.disabled = false;
  }
  notificationUndoHandler = null;
}

function showUndoBanner(message, undoHandler) {
  if (!notificationBanner || !notificationMessage || !notificationUndoButton) return;
  hideNotificationBanner();
  notificationMessage.textContent = message;
  notificationUndoHandler = undoHandler;
  notificationBanner.classList.remove("hidden");
  notificationUndoButton.disabled = false;
  notificationUndoButton.onclick = async () => {
    notificationUndoButton.disabled = true;
    try {
      await notificationUndoHandler?.();
    } catch (error) {
      console.error("Undo failed", error);
    }
    hideNotificationBanner();
  };
  notificationHideTimeout = window.setTimeout(() => {
    hideNotificationBanner();
  }, 6500);
}

function getSectionById(id) {
  return (settingsCache.sections || []).find((s) => s.id === id);
}

function getSectionName(id) {
  if (!id) return "";
  if (id === "section-work-default") return "Work";
  if (id === "section-personal-default") return "Personal";
  return getSectionById(id)?.name || "";
}

async function ensureDefaultSectionsPresent() {
  const defaults = [
    { id: "section-work-default", name: "Work", favorite: false },
    { id: "section-personal-default", name: "Personal", favorite: false }
  ];
  let sections = [...(settingsCache.sections || [])];
  const subsections = { ...(settingsCache.subsections || {}) };
  let changed = false;
  defaults.forEach((def) => {
    const idx = sections.findIndex((s) => s.id === def.id);
    if (idx >= 0) {
      const current = sections[idx];
      if (current.name !== def.name) {
        sections[idx] = { ...current, name: def.name };
        changed = true;
      }
    } else {
      sections.push(def);
      changed = true;
    }
    if (!Array.isArray(subsections[def.id])) {
      subsections[def.id] = [];
      changed = true;
    }
  });
  if (changed) {
    settingsCache = { ...settingsCache, sections, subsections };
    await saveSettings(settingsCache);
  }
  return settingsCache.sections;
}

function getSubsectionsFor(sectionId) {
  return ((settingsCache.subsections || {})[sectionId] || []).map((s) => ({
    favorite: false,
    parentId: "",
    template: {
      title: "",
      link: "",
      durationMin: 30,
      minBlockMin: 30,
      priority: 3,
      deadline: "",
      startFrom: "",
      repeat: { type: "none" },
      timeMapIds: [],
      ...(s.template || {})
    },
    ...s
  }));
}

function switchView(target) {
  views.forEach((view) => {
    const active = view.id === target;
    view.classList.toggle("hidden", !active);
  });
  navButtons.forEach((btn) => {
    const active = btn.dataset.view === target;
    btn.className = [
      "nav-btn",
      "rounded-xl",
      "px-3",
      "py-2",
      "text-sm",
      "font-semibold",
      "shadow",
      active
        ? "border border-lime-400/60 bg-slate-900/70 text-slate-100 ring-1 ring-lime-400/50"
        : "border border-slate-800 bg-slate-900/50 text-slate-200"
    ].join(" ");
  });
}

function renderDayRows(container, rules = []) {
  container.innerHTML = "";
  const rulesMap = new Map();
  rules.forEach((r) => {
    const day = Number(r.day);
    if (!rulesMap.has(day)) rulesMap.set(day, []);
    rulesMap.get(day).push({ ...r, day });
  });

  const createBlock = (day, block = { startTime: "09:00", endTime: "12:00" }) => {
    const wrapper = document.createElement("div");
    wrapper.className =
      "flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200";
    wrapper.dataset.block = day;

    const start = document.createElement("input");
    start.type = "time";
    start.value = block.startTime || "09:00";
    start.className =
      "w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-lime-400 focus:outline-none";
    start.dataset.startFor = day;

    const end = document.createElement("input");
    end.type = "time";
    end.value = block.endTime || "12:00";
    end.className =
      "w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-lime-400 focus:outline-none";
    end.dataset.endFor = day;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove block";
    removeBtn.className =
      "h-6 w-6 rounded-full border border-slate-700 text-xs font-semibold text-slate-200 hover:border-orange-400 hover:text-orange-300";
    removeBtn.addEventListener("click", () => {
      wrapper.remove();
    });

    wrapper.appendChild(start);
    wrapper.appendChild(document.createTextNode("–"));
    wrapper.appendChild(end);
    wrapper.appendChild(removeBtn);
    return wrapper;
  };

  dayOptions.forEach((day) => {
    const dayBlocks = rulesMap.get(day.value) || [];
    const row = document.createElement("div");
    row.dataset.dayRow = String(day.value);
    row.className =
      "flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = day.value;
    checkbox.checked = dayBlocks.length > 0;
    checkbox.className = "h-4 w-4 rounded border-slate-600 bg-slate-900 text-lime-400";
    checkbox.dataset.day = day.value;
    const label = document.createElement("span");
    label.textContent = day.label;
    label.className = "w-8";
    const blocksContainer = document.createElement("div");
    blocksContainer.className = "flex flex-col gap-2 flex-1";
    blocksContainer.dataset.blocksFor = day.value;

    const addBlockBtn = document.createElement("button");
    addBlockBtn.type = "button";
    addBlockBtn.textContent = "Add block";
    addBlockBtn.className =
      "h-8 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:border-lime-400";
    addBlockBtn.addEventListener("click", () => {
      blocksContainer.appendChild(createBlock(day.value));
      checkbox.checked = true;
    });

    if (dayBlocks.length > 0) {
      dayBlocks.forEach((block) => blocksContainer.appendChild(createBlock(day.value, block)));
    }

    const controls = document.createElement("div");
    controls.className = "flex items-center gap-2";
    controls.appendChild(addBlockBtn);

    const toggleBlocks = (enabled) => {
      blocksContainer.querySelectorAll("input").forEach((input) => {
        input.disabled = !enabled;
      });
      addBlockBtn.disabled = !enabled;
      addBlockBtn.classList.toggle("opacity-60", !enabled);
      addBlockBtn.classList.toggle("cursor-not-allowed", !enabled);
    };

    checkbox.addEventListener("change", () => {
      if (!checkbox.checked) {
        blocksContainer.innerHTML = "";
      } else if (blocksContainer.children.length === 0) {
        blocksContainer.appendChild(createBlock(day.value));
      }
      toggleBlocks(checkbox.checked);
    });

    if (!checkbox.checked) {
      toggleBlocks(false);
    }

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(blocksContainer);
    row.appendChild(controls);
    container.appendChild(row);
  });
}

function renderTimeMaps(timeMaps) {
  timeMapList.innerHTML = "";
  if (timeMaps.length === 0) {
    timeMapList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No TimeMaps yet. Add at least one availability map.</div>';
    return;
  }
  timeMaps.forEach((tmRaw) => {
    const tm = normalizeTimeMap(tmRaw);
    const isDefault = settingsCache.defaultTimeMapId === tm.id;
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    if (tm.color) {
      card.style.borderColor = tm.color;
      card.style.backgroundColor = `${tm.color}1a`;
    }
    const rulesText =
      tm.rules
        ?.map(
          (r) =>
            `${dayOptions.find((d) => d.value === Number(r.day))?.label || r.day}: ${r.startTime} – ${r.endTime}`
        )
        .join(" • ") || "";
    card.innerHTML = `
      <h3 class="text-base font-semibold flex items-center gap-2">
        <span>${tm.name}</span>
        ${isDefault ? '<span class="rounded-full border border-lime-400/60 bg-lime-400/10 px-2 py-1 text-xs font-semibold text-lime-300">Default</span>' : ""}
      </h3>
      <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">${rulesText}</div>
      <div class="mt-3 flex gap-2">
        <button style="background:${tm.color || "transparent"};border-color:${tm.color || "#334155"};color:${tm.color ? "#0f172a" : "#e2e8f0"}" class="rounded-lg border px-3 py-1 text-xs font-semibold" data-edit="${tm.id}">Edit</button>
        <button class="rounded-lg bg-orange-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-orange-400" data-delete="${tm.id}">Delete</button>
      </div>
    `;
    timeMapList.appendChild(card);
  });
}

async function loadTimeMaps() {
  const timeMapsRaw = await getAllTimeMaps();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  renderTimeMaps(timeMaps);
  renderTaskTimeMapOptions(timeMaps);
}

function renderTaskTimeMapOptions(timeMaps, selected = [], defaultTimeMapId = settingsCache.defaultTimeMapId) {
  taskTimeMapOptions.innerHTML = "";
  if (timeMaps.length === 0) {
    taskTimeMapOptions.innerHTML = `<span class="text-xs text-slate-400">Create TimeMaps first.</span>`;
    return;
  }
  timeMaps.forEach((tmRaw) => {
    const tm = normalizeTimeMap(tmRaw);
    const id = `task-tm-${tm.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.className =
      "flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tm.id;
    input.id = id;
    const hasExplicitSelection = Array.isArray(selected) && selected.length > 0;
    input.checked = hasExplicitSelection ? selected.includes(tm.id) : tm.id === defaultTimeMapId;
    input.className = "h-4 w-4 rounded border-slate-600 bg-slate-900 text-lime-400";
    const text = document.createElement("span");
    text.textContent = tm.name;
    if (tm.color) {
      text.style.color = tm.color;
    }
    const swatch = document.createElement("span");
    swatch.className = "h-3 w-3 rounded-full border border-slate-700";
    swatch.style.backgroundColor = tm.color || "#cbd5e1";
    swatch.style.borderColor = tm.color || "#334155";
    label.appendChild(input);
    label.appendChild(swatch);
    label.appendChild(text);
    taskTimeMapOptions.appendChild(label);
  });
}

function renderSections() {
  sectionList.innerHTML = "";
  (settingsCache.sections || []).forEach((section) => {
    const isDefault =
      section.id === "section-work-default" || section.id === "section-personal-default";
    const chip = document.createElement("div");
    chip.className =
      "flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200";
    chip.setAttribute("data-test-skedpal", "section-chip");
    const label = document.createElement("span");
    label.textContent = getSectionName(section.id) || section.name;
    label.setAttribute("data-test-skedpal", "section-chip-name");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.dataset.removeSection = section.id;
    removeBtn.className =
      "h-5 w-5 rounded-full border border-slate-700 text-[10px] font-bold text-slate-300 hover:border-orange-400 hover:text-orange-300";
    removeBtn.setAttribute("data-test-skedpal", "section-remove-btn");
    removeBtn.textContent = "×";
    if (isDefault) {
      removeBtn.classList.add("hidden");
    }
    chip.appendChild(label);
    chip.appendChild(removeBtn);
    sectionList.appendChild(chip);
  });
}

function openSectionForm() {
  if (sectionFormRow) {
    sectionFormRow.classList.remove("hidden");
  }
  if (sectionFormToggle) {
    sectionFormToggle.textContent = "Hide section form";
  }
  sectionInput?.focus();
}

function closeSectionForm() {
  if (sectionFormRow) {
    sectionFormRow.classList.add("hidden");
  }
  if (sectionFormToggle) {
    sectionFormToggle.textContent = "Add section";
  }
  if (sectionInput) {
    sectionInput.value = "";
  }
}

function renderTaskSectionOptions(selected) {
  const sections = [...(settingsCache.sections || [])];
  const selectedSection = selected
    ? sections.find((s) => s.id === selected) || sections.find((s) => s.name === selected)
    : null;
  taskSectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No section";
  if (!selectedSection) noneOpt.selected = true;
  taskSectionSelect.appendChild(noneOpt);
  sections.forEach((section) => {
    const opt = document.createElement("option");
    opt.value = section.id;
    opt.textContent = section.name;
    if (selectedSection) opt.selected = selectedSection.id === section.id;
    taskSectionSelect.appendChild(opt);
  });
  taskSectionSelect.disabled = false;
  renderTaskSubsectionOptions();
}

function renderTaskSubsectionOptions(selected) {
  const section = taskSectionSelect.value;
  const subsections = section ? getSubsectionsFor(section) : [];
  const selectedSubsection =
    selected && section
      ? subsections.find((s) => s.id === selected) || subsections.find((s) => s.name === selected)
      : null;
  taskSubsectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "None";
  taskSubsectionSelect.appendChild(noneOpt);

  const addOptions = (parentId = "", depth = 0) => {
    const siblings = subsections.filter((s) => (s.parentId || "") === (parentId || ""));
    siblings.forEach((sub) => {
      const opt = document.createElement("option");
      opt.value = sub.id;
      const prefix = depth > 0 ? `${"-- ".repeat(depth)}` : "";
      opt.textContent = `${prefix}${sub.name}`;
      if (selectedSubsection) opt.selected = selectedSubsection.id === sub.id;
      taskSubsectionSelect.appendChild(opt);
      addOptions(sub.id, depth + 1);
    });
  };

  addOptions();
  if (!taskSubsectionSelect.value) {
    taskSubsectionSelect.value = "";
  }
}

function getStartDate() {
  const raw = taskDeadlineInput?.value;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date) ? new Date() : date;
}

function renderTimeMapOptions(container, selectedIds = [], timeMaps = tasksTimeMapsCache || []) {
  if (!container) return;
  container.innerHTML = "";
  const normalized = timeMaps.map(normalizeTimeMap);
  normalized.forEach((tm) => {
    const label = document.createElement("label");
    label.className =
      "flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-200";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tm.id;
    checkbox.checked = selectedIds.includes(tm.id);
    checkbox.className = "h-4 w-4 rounded border-slate-700 bg-slate-900 text-lime-400";
    const colorDot = document.createElement("span");
    colorDot.className = "h-3 w-3 rounded-full";
    colorDot.style.backgroundColor = tm.color || "#22c55e";
    const name = document.createElement("span");
    name.textContent = tm.name || "Unnamed TimeMap";
    label.appendChild(checkbox);
    label.appendChild(colorDot);
    label.appendChild(name);
    container.appendChild(label);
  });
}
function defaultRepeatState(startDate = getStartDate()) {
  const monthDay = startDate.getDate();
  const { nth, weekday } = getNthWeekday(startDate);
  return {
    unit: "none",
    interval: 1,
    weeklyDays: [weekday],
    monthlyMode: "day",
    monthlyDay: monthDay,
    monthlyNth: nth,
    monthlyWeekday: weekday,
    yearlyMonth: startDate.getMonth() + 1,
    yearlyDay: monthDay,
    end: { type: "never", date: "", count: 1 }
  };
}

let repeatState = defaultRepeatState();
let lastRepeatSelection = { type: "none" };
let repeatSelectionBeforeModal = { type: "none" };
let repeatTarget = "task";
let subsectionRepeatSelection = { type: "none" };
let subsectionRepeatBeforeModal = { type: "none" };
let editingSubsectionId = "";
let editingSectionId = "";

function renderRepeatWeekdayOptions(selected = []) {
  if (!taskRepeatWeekdays) return;
  taskRepeatWeekdays.innerHTML = "";
  dayOptions.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.dayValue = String(day.value);
    btn.className =
      "rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200";
    btn.textContent = getWeekdayShortLabel(day.value);
    if (selected.includes(day.value)) {
      btn.classList.add("bg-lime-400/10", "border-lime-400", "text-lime-300");
    }
    taskRepeatWeekdays.appendChild(btn);
  });
}

function openRepeatModal() {
  if (repeatModal) repeatModal.classList.remove("hidden");
}

function closeRepeatModal() {
  if (repeatModal) repeatModal.classList.add("hidden");
}

function renderRepeatUI(target = repeatTarget) {
  if (!taskRepeatUnit) return;
  taskRepeatUnit.value = repeatState.unit === "none" ? "week" : repeatState.unit;
  taskRepeatInterval.value = repeatState.interval;
  taskRepeatWeeklySection.classList.toggle("hidden", repeatState.unit !== "week");
  taskRepeatMonthlySection.classList.toggle("hidden", repeatState.unit !== "month");
  renderRepeatWeekdayOptions(repeatState.weeklyDays || []);
  if (taskRepeatMonthlyMode) taskRepeatMonthlyMode.value = repeatState.monthlyMode || "day";
  if (taskRepeatMonthlyDay) taskRepeatMonthlyDay.value = repeatState.monthlyDay || 1;
  if (taskRepeatMonthlyNth) taskRepeatMonthlyNth.value = String(repeatState.monthlyNth || 1);
  if (taskRepeatMonthlyWeekday)
    taskRepeatMonthlyWeekday.value = String(repeatState.monthlyWeekday ?? 0);
  if (taskRepeatMonthlyMode) {
    const dayOpt = taskRepeatMonthlyMode.querySelector('option[value="day"]');
    const nthOpt = taskRepeatMonthlyMode.querySelector('option[value="nth"]');
    if (dayOpt) dayOpt.textContent = `Monthly on day ${repeatState.monthlyDay || 1}`;
    if (nthOpt)
      nthOpt.textContent = `Monthly on the ${formatOrdinal(
        repeatState.monthlyNth || 1
      )} ${dayOptions.find((d) => d.value === repeatState.monthlyWeekday)?.label || "weekday"}`;
  }
  if (taskRepeatMonthlyDay) taskRepeatMonthlyDay.disabled = repeatState.monthlyMode !== "day";
  if (taskRepeatMonthlyNth) taskRepeatMonthlyNth.disabled = repeatState.monthlyMode !== "nth";
  if (taskRepeatMonthlyWeekday)
    taskRepeatMonthlyWeekday.disabled = repeatState.monthlyMode !== "nth";
  const isDayMode = repeatState.monthlyMode === "day";
  const isNthMode = repeatState.monthlyMode === "nth";
  if (taskRepeatMonthlyDayWrap) {
    taskRepeatMonthlyDayWrap.classList.toggle("hidden", !isDayMode);
    taskRepeatMonthlyDayWrap.style.display = isDayMode ? "" : "none";
  }
  if (taskRepeatMonthlyNthWrap) {
    taskRepeatMonthlyNthWrap.classList.toggle("hidden", !isNthMode);
    taskRepeatMonthlyNthWrap.style.display = isNthMode ? "" : "none";
  }
  const endType = repeatState.end?.type || "never";
  taskRepeatEndNever.checked = endType === "never";
  taskRepeatEndOn.checked = endType === "on";
  taskRepeatEndAfter.checked = endType === "after";
  taskRepeatEndDate.value = repeatState.end?.date ? repeatState.end.date.slice(0, 10) : "";
  taskRepeatEndCount.value = repeatState.end?.count ? Number(repeatState.end.count) : 1;
  if (target === "task") {
    taskRepeatSelect.value = lastRepeatSelection.type === "custom" ? "custom" : "none";
    syncRepeatSelectLabel();
  } else if (target === "subsection") {
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value =
        subsectionRepeatSelection.type === "custom" ? "custom" : "none";
    }
    syncSubsectionRepeatLabel();
  }
}

function getSubsectionTemplate(sectionId, subsectionId) {
  const subs = getSubsectionsFor(sectionId);
  const sub = subs.find((s) => s.id === subsectionId);
  return sub?.template || null;
}

function openSubsectionModal(sectionId, parentId = "", existingSubsectionId = "") {
  if (!subsectionFormWrap) return;
  repeatTarget = "subsection";
  const subs = getSubsectionsFor(sectionId);
  const existing = subs.find((s) => s.id === existingSubsectionId);
  editingSubsectionId = existing ? existing.id : "";
  editingSectionId = sectionId;
  subsectionSectionIdInput.value = sectionId || "";
  subsectionParentIdInput.value = parentId || existing?.parentId || "";
  subsectionNameInput.value = existing?.name || "";
  const template = existing?.template || {
    title: "",
    link: "",
    durationMin: 30,
    minBlockMin: 30,
    priority: 3,
    deadline: "",
    startFrom: "",
    repeat: { type: "none" },
    timeMapIds: []
  };
  subsectionTaskTitleInput.value = template.title || "";
  subsectionTaskLinkInput.value = template.link || "";
  subsectionTaskDurationInput.value = template.durationMin || 30;
  subsectionTaskMinBlockInput.value = template.minBlockMin || 30;
  subsectionTaskPriorityInput.value = String(template.priority || 3);
  subsectionTaskDeadlineInput.value = template.deadline ? template.deadline.slice(0, 10) : "";
  subsectionTaskStartFromInput.value = template.startFrom ? template.startFrom.slice(0, 10) : "";
  subsectionTaskRepeatSelect.value = template.repeat?.type === "custom" ? "custom" : "none";
  setRepeatFromSelection(template.repeat || { type: "none" }, "subsection");
  syncSubsectionRepeatLabel();
  renderTimeMapOptions(subsectionTimeMapOptions, template.timeMapIds || [], tasksTimeMapsCache);
  subsectionFormWrap.classList.remove("hidden");
}

function setRepeatFromSelection(repeat = { type: "none" }, target = repeatTarget || "task") {
  const base = defaultRepeatState();
  if (!repeat || repeat.type === "none") {
    repeatState = { ...base, unit: "none" };
    if (target === "task") {
      lastRepeatSelection = { type: "none" };
    } else {
      subsectionRepeatSelection = { type: "none" };
    }
    renderRepeatUI(target);
    return;
  }
  const unit = repeat.unit || (repeat.frequency === "daily"
    ? "day"
    : repeat.frequency === "weekly"
      ? "week"
      : repeat.frequency === "monthly"
        ? "month"
        : repeat.frequency === "yearly"
          ? "year"
          : "week");
  repeatState = {
    ...base,
    ...repeat,
    unit,
    interval: Math.max(1, Number(repeat.interval) || 1),
    weeklyDays: Array.isArray(repeat.weeklyDays)
      ? repeat.weeklyDays
      : Array.isArray(repeat.byWeekdays)
        ? repeat.byWeekdays
        : base.weeklyDays,
    monthlyMode: repeat.monthlyMode
      ? repeat.monthlyMode
      : repeat.bySetPos
        ? "nth"
        : repeat.byMonthDay
          ? "day"
          : "day",
    monthlyDay: repeat.monthlyDay || repeat.byMonthDay || base.monthlyDay,
    monthlyNth: repeat.monthlyNth || repeat.bySetPos || base.monthlyNth,
    monthlyWeekday: repeat.monthlyWeekday ??
      (Array.isArray(repeat.byWeekdays) && repeat.byWeekdays.length
        ? repeat.byWeekdays[0]
        : base.monthlyWeekday),
    yearlyMonth: repeat.yearlyMonth || repeat.byMonth || base.yearlyMonth,
    yearlyDay: repeat.yearlyDay || repeat.byMonthDay || base.yearlyDay,
    end: repeat.end || { type: "never", date: "", count: 1 }
  };
  const built = buildRepeatFromState();
  if (target === "task") {
    lastRepeatSelection = built;
  } else {
    subsectionRepeatSelection = built;
  }
  renderRepeatUI(target);
}

function syncRepeatSelectLabel() {
  if (!taskRepeatSelect) return;
  const noneOpt = taskRepeatSelect.querySelector('option[value="none"]');
  const customOpt = taskRepeatSelect.querySelector('option[value="custom"]');
  const customNewOpt = taskRepeatSelect.querySelector('option[value="custom-new"]');
  if (noneOpt) noneOpt.textContent = "Does not repeat";
  if (customOpt) {
    customOpt.textContent =
      lastRepeatSelection.type === "custom"
        ? getRepeatSummary(lastRepeatSelection)
        : "Saved pattern";
  }
  if (customNewOpt) {
    customNewOpt.textContent = "Custom...";
  }
}

function syncSubsectionRepeatLabel() {
  if (!subsectionTaskRepeatSelect) return;
  const noneOpt = subsectionTaskRepeatSelect.querySelector('option[value="none"]');
  const customOpt = subsectionTaskRepeatSelect.querySelector('option[value="custom"]');
  const customNewOpt = subsectionTaskRepeatSelect.querySelector('option[value="custom-new"]');
  if (noneOpt) noneOpt.textContent = "Does not repeat";
  if (customOpt) {
    customOpt.textContent =
      subsectionRepeatSelection.type === "custom"
        ? getRepeatSummary(subsectionRepeatSelection)
        : "Saved pattern";
  }
  if (customNewOpt) customNewOpt.textContent = "Custom...";
}

function buildRepeatFromState() {
  if (!repeatState || repeatState.unit === "none") return { type: "none" };
  const startDate = getStartDate();
  const unit = repeatState.unit;
  const interval = Math.max(1, Number(repeatState.interval) || 1);
  const end = repeatState.end || { type: "never" };
  let rule = "";
  const byDayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  if (unit === "day") {
    rule = `FREQ=DAILY;INTERVAL=${interval}`;
  } else if (unit === "week") {
    const days = (repeatState.weeklyDays || [startDate.getDay()]).map((d) => byDayCodes[d]);
    rule = `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(",")}`;
  } else if (unit === "month") {
    if (repeatState.monthlyMode === "nth") {
      const byday = byDayCodes[repeatState.monthlyWeekday ?? startDate.getDay()];
      const bysetpos = repeatState.monthlyNth ?? getNthWeekday(startDate).nth;
      rule = `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${byday};BYSETPOS=${bysetpos}`;
    } else {
      const day = repeatState.monthlyDay || startDate.getDate();
      rule = `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${day}`;
    }
  } else if (unit === "year") {
    const month = repeatState.yearlyMonth || startDate.getMonth() + 1;
    const day = repeatState.yearlyDay || startDate.getDate();
    rule = `FREQ=YEARLY;INTERVAL=${interval};BYMONTH=${month};BYMONTHDAY=${day}`;
  }
  if (end.type === "after" && end.count) {
    rule += `;COUNT=${end.count}`;
  } else if (end.type === "on" && end.date) {
    const until = formatRRuleDate(end.date);
    if (until) rule += `;UNTIL=${until}`;
  }
  return {
    type: "custom",
    unit,
    interval,
    weeklyDays: repeatState.weeklyDays,
    monthlyMode: repeatState.monthlyMode,
    monthlyDay: repeatState.monthlyDay,
    monthlyNth: repeatState.monthlyNth,
    monthlyWeekday: repeatState.monthlyWeekday,
    yearlyMonth: repeatState.yearlyMonth,
    yearlyDay: repeatState.yearlyDay,
    end,
    rrule: rule
  };
}

function renderTasks(tasks, timeMaps) {
  destroyTaskSortables();
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const parentById = tasks.reduce((map, task) => {
    if (task.subtaskParentId) {
      map.set(task.id, task.subtaskParentId);
    }
    return map;
  }, new Map());
  const depthMemo = new Map();
  const getTaskDepthById = (taskId) => {
    if (!taskId) return 0;
    if (depthMemo.has(taskId)) return depthMemo.get(taskId);
    const parentId = parentById.get(taskId);
    if (!parentId) {
      depthMemo.set(taskId, 0);
      return 0;
    }
    const depth = getTaskDepthById(parentId) + 1;
    depthMemo.set(taskId, depth);
    return depth;
  };
  const collapsedAncestorMemo = new Map();
  const hasCollapsedAncestor = (taskId) => {
    if (!taskId) return false;
    if (collapsedAncestorMemo.has(taskId)) return collapsedAncestorMemo.get(taskId);
    const parentId = parentById.get(taskId);
    if (!parentId) {
      collapsedAncestorMemo.set(taskId, false);
      return false;
    }
    if (collapsedTasks.has(parentId)) {
      collapsedAncestorMemo.set(taskId, true);
      return true;
    }
    const result = hasCollapsedAncestor(parentId);
    collapsedAncestorMemo.set(taskId, result);
    return result;
  };
  const childrenByParent = tasks.reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!pid) return map;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(task);
    return map;
  }, new Map());
  const durationMemo = new Map();
  const computeTotalDuration = (task) => {
    if (!task?.id) return 0;
    if (durationMemo.has(task.id)) return durationMemo.get(task.id);
    const children = childrenByParent.get(task.id) || [];
    if (children.length === 0) {
      const own = Number(task.durationMin) || 0;
      durationMemo.set(task.id, own);
      return own;
    }
    const total = children.reduce((sum, child) => sum + computeTotalDuration(child), 0);
    durationMemo.set(task.id, total);
    return total;
  };
  const filteredTasks = (() => {
    const base = tasks.filter((t) => !t.completed);
    const zoomTaskIds =
      zoomFilter?.type === "task"
        ? (() => {
            const ids = new Set([zoomFilter.taskId]);
            const stack = [zoomFilter.taskId];
            const childrenByParent = base.reduce((map, task) => {
              if (!task.subtaskParentId) return map;
              if (!map.has(task.subtaskParentId)) map.set(task.subtaskParentId, []);
              map.get(task.subtaskParentId).push(task.id);
              return map;
            }, new Map());
            while (stack.length) {
              const current = stack.pop();
              const children = childrenByParent.get(current) || [];
              children.forEach((childId) => {
                if (ids.has(childId)) return;
                ids.add(childId);
                stack.push(childId);
              });
            }
            return ids;
          })()
        : null;
    const visible = base.filter((t) => !hasCollapsedAncestor(t.id));
    if (zoomFilter?.type === "section") {
      return visible.filter((t) => (t.section || "") === (zoomFilter.sectionId || ""));
    }
    if (zoomFilter?.type === "subsection") {
      return visible.filter(
        (t) =>
          (t.section || "") === (zoomFilter.sectionId || "") &&
          (t.subsection || "") === (zoomFilter.subsectionId || "")
      );
    }
    if (zoomFilter?.type === "task") {
      return visible.filter((t) => zoomTaskIds?.has(t.id));
    }
    return visible;
  })();
  const suppressPlaceholders = Boolean(zoomFilter);
  const sections = [...(settingsCache.sections || [])];
  const seenSectionIds = new Set(sections.map((s) => s.id));
  const missingSections = [];
  filteredTasks.forEach((t) => {
    if (t.section && !seenSectionIds.has(t.section)) {
      seenSectionIds.add(t.section);
      missingSections.push({ id: t.section, name: "Untitled section", favorite: false });
    }
  });
  const hasUnsectioned = filteredTasks.some((t) => !t.section);
  const relevantSectionIds = new Set(
    filteredTasks.map((t) => (t.section === undefined ? "" : t.section || ""))
  );
  if (zoomFilter?.type === "section") relevantSectionIds.add(zoomFilter.sectionId || "");
  if (zoomFilter?.type === "subsection") relevantSectionIds.add(zoomFilter.sectionId || "");
  if (zoomFilter?.type === "task") relevantSectionIds.add(zoomFilter.sectionId || "");
  const allSections = [
    ...sections,
    ...missingSections,
    ...(hasUnsectioned || sections.length === 0 ? [{ id: "", name: "No section" }] : [])
  ].filter((s) => (zoomFilter ? relevantSectionIds.has(s.id || "") : true));

  const getSubsectionName = (sectionId, subsectionId) => {
    const subs = getSubsectionsFor(sectionId);
    return subs.find((s) => s.id === subsectionId)?.name || "";
  };

  const renderTaskCard = (task) => {
    const childTasks = tasks.filter((t) => t.subtaskParentId === task.id);
    const hasChildren = childTasks.length > 0;
    const isCollapsed = collapsedTasks.has(task.id);
    const depth = getTaskDepthById(task.id);
    const baseDurationMin = Number(task.durationMin) || 0;
    const displayDurationMin = hasChildren ? computeTotalDuration(task) : baseDurationMin;
    const statusValue = task.completed ? "completed" : task.scheduleStatus || "unscheduled";
    const statusClass =
      statusValue === "scheduled"
        ? "text-lime-300 font-semibold"
        : statusValue === "ignored"
          ? "text-slate-400 font-semibold"
          : statusValue === "completed"
            ? "text-lime-300 font-semibold"
            : "text-amber-300 font-semibold";
    const timeMapNames = task.timeMapIds.map((id) => timeMapById.get(id)?.name || "Unknown");
    const sectionName = task.section ? getSectionName(task.section) : "";
    const subsectionName = task.subsection ? getSubsectionName(task.section, task.subsection) : "";
    const repeatSummary = getRepeatSummary(task.repeat);
    const taskCard = document.createElement("div");
    const isSubtask = depth > 0;
    taskCard.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    taskCard.setAttribute("data-test-skedpal", "task-card");
    taskCard.dataset.taskId = task.id;
    taskCard.dataset.sectionId = task.section || "";
    taskCard.dataset.subsectionId = task.subsection || "";
    taskCard.tabIndex = 0;
    taskCard.style.minHeight = "fit-content";
    taskCard.style.padding = "5px";
    if (isSubtask) {
      taskCard.style.marginLeft = `${depth * 10}px`;
      taskCard.style.borderStyle = "dashed";
    }
    const color = timeMapById.get(task.timeMapIds[0])?.color;
    if (color) {
      taskCard.style.borderColor = color;
      taskCard.style.backgroundColor = `${color}1a`;
    }
    const titleMarkup = task.link
      ? `<a href="${task.link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-lime-300 hover:text-lime-200 underline decoration-lime-400">
          <span>${task.title}</span>
          <span>🔗</span>
        </a>`
      : task.title;
    const isLongTitle = (task.title || "").length > 60;
    const header = document.createElement("div");
    header.className = `task-title-row title-hover-group${isLongTitle ? " task-title-row--stacked" : ""}`;
    const titleWrap = document.createElement("h3");
    titleWrap.className = "task-title-main text-base font-semibold";
    if (hasChildren) {
      const collapseTaskBtn = document.createElement("button");
      collapseTaskBtn.type = "button";
      collapseTaskBtn.dataset.toggleTaskCollapse = task.id;
      collapseTaskBtn.className = "title-icon-btn";
      collapseTaskBtn.title = "Expand/collapse subtasks";
      collapseTaskBtn.setAttribute("data-test-skedpal", "task-collapse-btn");
      collapseTaskBtn.innerHTML = isCollapsed ? caretRightIconSvg : caretDownIconSvg;
      titleWrap.appendChild(collapseTaskBtn);
    }
    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.dataset.completeTask = task.id;
    completeBtn.className = "title-icon-btn task-complete-btn";
    completeBtn.setAttribute("data-test-skedpal", "task-complete-btn");
    completeBtn.title = task.completed ? "Mark incomplete" : "Mark completed";
    completeBtn.innerHTML = task.completed ? checkboxCheckedIconSvg : checkboxIconSvg;
    if (task.completed) {
      completeBtn.classList.add("task-complete-btn--checked");
    }
    titleWrap.appendChild(completeBtn);
    const titleTextWrap = document.createElement("div");
    titleTextWrap.className = "task-title-text";
    titleTextWrap.setAttribute("data-test-skedpal", "task-title");
    titleTextWrap.innerHTML = titleMarkup;
    titleWrap.appendChild(titleTextWrap);
    if (task.completed) {
      titleTextWrap.style.opacity = "0.8";
      titleTextWrap.style.textDecoration = "line-through";
      titleTextWrap.style.textDecorationColor = "#4ade80";
    }
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "task-actions-wrap";
    const durationPill = document.createElement("span");
    durationPill.className = "pill pill-muted";
    durationPill.setAttribute("data-test-skedpal", "task-duration");
    durationPill.textContent = formatDurationShort(displayDurationMin);
    const titleActions = document.createElement("div");
    titleActions.className = "title-actions task-title-actions";
    titleActions.setAttribute("data-test-skedpal", "task-title-actions");
    titleActions.setAttribute("data-test-skedpal", "task-title-actions");
    const zoomTaskBtn = document.createElement("button");
    zoomTaskBtn.type = "button";
    zoomTaskBtn.dataset.zoomTask = task.id;
    zoomTaskBtn.dataset.zoomSection = task.section || "";
    zoomTaskBtn.dataset.zoomSubsection = task.subsection || "";
    zoomTaskBtn.className = "title-icon-btn";
    zoomTaskBtn.title = "Zoom into task";
    zoomTaskBtn.setAttribute("data-test-skedpal", "task-zoom-btn");
    zoomTaskBtn.innerHTML = zoomInIconSvg;
    const editTaskBtn = document.createElement("button");
    editTaskBtn.type = "button";
    editTaskBtn.dataset.edit = task.id;
    editTaskBtn.className = "title-icon-btn";
    editTaskBtn.title = "Edit task";
    editTaskBtn.setAttribute("data-test-skedpal", "task-edit-btn");
    editTaskBtn.innerHTML = editIconSvg;
    editTaskBtn.style.borderColor = "#22c55e";
    editTaskBtn.style.color = "#22c55e";
    const deleteTaskBtn = document.createElement("button");
    deleteTaskBtn.type = "button";
    deleteTaskBtn.dataset.delete = task.id;
    deleteTaskBtn.className = "title-icon-btn";
    deleteTaskBtn.title = "Delete task";
    deleteTaskBtn.setAttribute("data-test-skedpal", "task-delete-btn");
    deleteTaskBtn.innerHTML = removeIconSvg;
    deleteTaskBtn.style.borderColor = "#f97316";
    deleteTaskBtn.style.color = "#f97316";
    const addSubtaskBtn = document.createElement("button");
    addSubtaskBtn.type = "button";
    addSubtaskBtn.dataset.addSubtask = task.id;
    addSubtaskBtn.className = "title-icon-btn";
    addSubtaskBtn.title = "Add subtask";
    addSubtaskBtn.setAttribute("aria-label", "Add subtask");
    addSubtaskBtn.setAttribute("data-test-skedpal", "task-add-subtask-btn");
    addSubtaskBtn.innerHTML = plusIconSvg;
    const detailsToggleBtn = document.createElement("button");
    detailsToggleBtn.type = "button";
    detailsToggleBtn.dataset.toggleTaskDetails = task.id;
    detailsToggleBtn.className = "title-icon-btn";
    const detailsOpen = expandedTaskDetails.has(task.id);
    detailsToggleBtn.title = detailsOpen ? "Hide details" : "Show details";
    detailsToggleBtn.setAttribute("aria-label", detailsOpen ? "Hide details" : "Show details");
    detailsToggleBtn.setAttribute("data-test-skedpal", "task-details-toggle");
    detailsToggleBtn.innerHTML = detailsOpen ? caretDownIconSvg : caretRightIconSvg;
    actionsWrap.appendChild(durationPill);
    titleActions.appendChild(zoomTaskBtn);
    titleActions.appendChild(editTaskBtn);
    titleActions.appendChild(addSubtaskBtn);
    titleActions.appendChild(detailsToggleBtn);
    titleActions.appendChild(deleteTaskBtn);
    actionsWrap.appendChild(titleActions);
    header.appendChild(titleWrap);
    header.appendChild(actionsWrap);
    taskCard.appendChild(header);

    const summaryRow = document.createElement("div");
    summaryRow.className = `task-summary-row${isLongTitle ? " task-summary-row--stacked" : ""}`;
    if (statusValue !== "unscheduled" && statusValue) {
      const statusSpan = document.createElement("span");
      statusSpan.className = statusClass;
      statusSpan.textContent = statusValue;
      summaryRow.appendChild(statusSpan);
    }
    if (task.scheduledStart) {
      const schedSpan = document.createElement("span");
      schedSpan.textContent = `Scheduled: ${formatDateTime(task.scheduledStart)}`;
      summaryRow.appendChild(schedSpan);
    }
    taskCard.appendChild(summaryRow);

    if (detailsOpen) {
      const meta = document.createElement("div");
      meta.className = "mt-2 flex flex-wrap gap-2 text-xs text-slate-400";
      meta.innerHTML = `
          <span>Deadline: ${formatDateTime(task.deadline)}</span>
          ${task.minBlockMin ? `<span>Min block: ${task.minBlockMin}m</span>` : ""}
          <span>Priority: ${task.priority}</span>
          <span>TimeMaps: ${timeMapNames.join(", ")}</span>
          <span>Repeat: ${repeatSummary}</span>
          ${sectionName ? `<span>Section: ${sectionName}</span>` : ""}
          ${subsectionName ? `<span>Subsection: ${subsectionName}</span>` : ""}
          ${task.link ? `<span class="text-lime-300 underline">Link attached</span>` : ""}
        `;
      taskCard.appendChild(meta);

      const statusRow = document.createElement("div");
      statusRow.className = "mt-1 flex flex-wrap gap-3 text-xs text-slate-400";
      statusRow.innerHTML = `
          <span>Scheduled start: ${formatDateTime(task.scheduledStart)}</span>
          <span>Scheduled end: ${formatDateTime(task.scheduledEnd)}</span>
        `;
      taskCard.appendChild(statusRow);
    }

    return taskCard;
  };

  const renderSectionCard = (section) => {
    const isNoSection = !section.id;
    const sectionTasks = filteredTasks.filter((t) =>
      isNoSection ? !t.section : t.section === section.id
    );
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
    card.dataset.sectionCard = section.id;
    const isCollapsed = zoomFilter ? false : collapsedSections.has(section.id);
    const header = document.createElement("div");
    header.className = "flex flex-wrap items-center justify-between gap-2";
    const title = document.createElement("div");
    title.className =
      "title-hover-group flex items-center gap-2 text-base font-semibold text-slate-100";
    const titleText = document.createElement("span");
    titleText.textContent = getSectionName(section.id) || section.name || "Untitled section";
    title.appendChild(titleText);
    if (!isNoSection) {
      const titleActions = document.createElement("div");
      titleActions.className = "title-actions";
      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.dataset.toggleSectionCollapse = section.id;
      collapseBtn.className = "title-icon-btn";
      collapseBtn.title = "Expand/collapse section";
      collapseBtn.innerHTML = isCollapsed ? caretRightIconSvg : caretDownIconSvg;
      const isDefaultSection =
        section.id === "section-work-default" || section.id === "section-personal-default";
      const editSectionBtn = document.createElement("button");
      editSectionBtn.type = "button";
      editSectionBtn.dataset.editSection = section.id;
      editSectionBtn.className = "title-icon-btn";
      editSectionBtn.title = "Edit section";
      editSectionBtn.innerHTML = editIconSvg;
      editSectionBtn.style.borderColor = "#22c55e";
      editSectionBtn.style.color = "#22c55e";
      const zoomSectionBtn = document.createElement("button");
      zoomSectionBtn.type = "button";
      zoomSectionBtn.dataset.zoomSection = section.id;
      zoomSectionBtn.dataset.zoomSubsection = "";
      zoomSectionBtn.className = "title-icon-btn";
      zoomSectionBtn.title = "Zoom into section";
      zoomSectionBtn.innerHTML = zoomInIconSvg;
      const favoriteSectionBtn = document.createElement("button");
      favoriteSectionBtn.type = "button";
      favoriteSectionBtn.dataset.favoriteSection = section.id;
      favoriteSectionBtn.className = `title-icon-btn${section.favorite ? " favorite-active" : ""}`;
      favoriteSectionBtn.title = section.favorite ? "Unfavorite section" : "Favorite section";
      favoriteSectionBtn.innerHTML = favoriteIconSvg;
      const removeSectionBtn = document.createElement("button");
      removeSectionBtn.type = "button";
      removeSectionBtn.dataset.removeSection = section.id;
      removeSectionBtn.className = "title-icon-btn";
      removeSectionBtn.title = "Remove section";
      removeSectionBtn.innerHTML = removeIconSvg;
      removeSectionBtn.style.borderColor = "#f97316";
      removeSectionBtn.style.color = "#f97316";
      if (isDefaultSection) {
        removeSectionBtn.disabled = true;
        removeSectionBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      const addSubsectionToggle = document.createElement("button");
      addSubsectionToggle.type = "button";
      addSubsectionToggle.dataset.toggleSubsection = section.id;
      addSubsectionToggle.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
      addSubsectionToggle.textContent = "Add subsection";
      const addTaskBtn = document.createElement("button");
      addTaskBtn.type = "button";
      addTaskBtn.dataset.addSection = section.id;
      addTaskBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
      addTaskBtn.textContent = "Add task";
      titleActions.appendChild(collapseBtn);
      titleActions.appendChild(editSectionBtn);
      titleActions.appendChild(zoomSectionBtn);
      titleActions.appendChild(favoriteSectionBtn);
      titleActions.appendChild(addSubsectionToggle);
      titleActions.appendChild(addTaskBtn);
      titleActions.appendChild(removeSectionBtn);
      title.appendChild(titleActions);
    }
    header.appendChild(title);
    card.appendChild(header);

    const sectionBody = document.createElement("div");
    sectionBody.dataset.sectionBody = section.id;
    sectionBody.style.display = isCollapsed ? "none" : "";

    if (!isNoSection) {
    const subsectionInputWrap = document.createElement("div");
    subsectionInputWrap.className = "flex flex-col gap-2 md:flex-row md:items-center";
    subsectionInputWrap.style.display = "none";
      subsectionInputWrap.dataset.subsectionForm = section.id;
      subsectionInputWrap.innerHTML = `
        <input data-subsection-input="${section.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${section.id}" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
      `;
      sectionBody.appendChild(subsectionInputWrap);
    }

    const subsectionMap = settingsCache.subsections || {};
    const subsections = !isNoSection
      ? [...(subsectionMap[section.id] || [])].map((s) => ({ favorite: false, parentId: "", ...s }))
      : [];
    const taskSubsections = Array.from(new Set(sectionTasks.map((t) => t.subsection).filter(Boolean)));
    taskSubsections.forEach((subId) => {
      if (subsections.find((s) => s.id === subId)) return;
      if (subId) {
        subsections.push({
          id: subId,
          name: getSubsectionName(section.id, subId) || "Unnamed subsection",
          favorite: false
        });
      }
    });
    if (zoomFilter?.type === "task" || zoomFilter?.type === "subsection") {
      const subsectionsById = new Map(subsections.map((s) => [s.id, s]));
      const childrenByParent = subsections.reduce((map, sub) => {
        const pid = sub.parentId || "";
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push(sub.id);
        return map;
      }, new Map());
      const allowedSubsections = new Set();
      const markWithAncestors = (subsectionId) => {
        let current = subsectionsById.get(subsectionId);
        while (current) {
          if (allowedSubsections.has(current.id)) break;
          allowedSubsections.add(current.id);
          const parentId = current.parentId || "";
          current = parentId ? subsectionsById.get(parentId) : null;
        }
      };
      const markDescendants = (subsectionId) => {
        (childrenByParent.get(subsectionId) || []).forEach((childId) => {
          if (allowedSubsections.has(childId)) return;
          allowedSubsections.add(childId);
          markDescendants(childId);
        });
      };
      if (zoomFilter?.type === "task") {
        taskSubsections.filter(Boolean).forEach((id) => markWithAncestors(id));
      }
      if (zoomFilter?.type === "subsection" && zoomFilter.sectionId === section.id) {
        const targetId = zoomFilter.subsectionId || "";
        markWithAncestors(targetId);
        markDescendants(targetId);
      }
      if (allowedSubsections.size > 0) {
        const filtered = subsections.filter((s) => allowedSubsections.has(s.id));
        subsections.splice(0, subsections.length, ...filtered);
      }
    }

    const ungroupedTasks = sortTasksByOrder(sectionTasks.filter((t) => !t.subsection));
    const ungroupedZone = document.createElement("div");
    ungroupedZone.dataset.dropSection = isNoSection ? "" : section.id;
    ungroupedZone.dataset.dropSubsection = "";
    ungroupedZone.className =
      "space-y-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-3 py-3";
    ungroupedZone.classList.add(TASK_ZONE_CLASS);
    if (ungroupedTasks.length === 0 && !suppressPlaceholders) {
      const empty = document.createElement("div");
      empty.className = `text-xs text-slate-500 ${TASK_PLACEHOLDER_CLASS}`;
      empty.textContent = "Drag tasks here or add new.";
      ungroupedZone.appendChild(empty);
    } else {
      ungroupedTasks.forEach((task) => {
        ungroupedZone.appendChild(renderTaskCard(task));
      });
    }
    sectionBody.appendChild(ungroupedZone);

    const buildChildren = (parentId = "") =>
      subsections.filter((s) => (s.parentId || "") === (parentId || ""));

    const renderSubsection = (sub) => {
      const subWrap = document.createElement("div");
      subWrap.className =
        "space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 pl-4 md:pl-6";
      subWrap.style.marginLeft = "12px";
      subWrap.dataset.subsectionCard = sub.id;
      const subHeader = document.createElement("div");
      subHeader.className = "flex items-center justify-between text-sm font-semibold text-slate-200";
      const subTitle = document.createElement("div");
      subTitle.className = "title-hover-group flex items-center gap-2";
      const subTitleText = document.createElement("span");
      subTitleText.textContent = sub.name;
      const subTitleActions = document.createElement("div");
      subTitleActions.className = "title-actions";
      const collapseSubBtn = document.createElement("button");
      collapseSubBtn.type = "button";
      collapseSubBtn.dataset.toggleSubsectionCollapse = sub.id;
      collapseSubBtn.dataset.parentSection = section.id;
      collapseSubBtn.className = "title-icon-btn";
      const subCollapsed = zoomFilter ? false : collapsedSubsections.has(sub.id);
      collapseSubBtn.title = "Expand/collapse subsection";
      collapseSubBtn.innerHTML = subCollapsed ? caretRightIconSvg : caretDownIconSvg;
      const editSubBtn = document.createElement("button");
      editSubBtn.type = "button";
      editSubBtn.dataset.editSubsection = sub.id;
      editSubBtn.dataset.parentSection = section.id;
      editSubBtn.className = "title-icon-btn";
      editSubBtn.title = "Edit subsection";
      editSubBtn.innerHTML = editIconSvg;
      editSubBtn.style.borderColor = "#22c55e";
      editSubBtn.style.color = "#22c55e";
      const zoomSubBtn = document.createElement("button");
      zoomSubBtn.type = "button";
      zoomSubBtn.dataset.zoomSubsection = sub.id;
      zoomSubBtn.dataset.zoomSection = section.id;
      zoomSubBtn.className = "title-icon-btn";
      zoomSubBtn.title = "Zoom into subsection";
      zoomSubBtn.innerHTML = zoomInIconSvg;
      const favoriteSubBtn = document.createElement("button");
      favoriteSubBtn.type = "button";
      favoriteSubBtn.dataset.favoriteSubsection = sub.id;
      favoriteSubBtn.dataset.parentSection = section.id;
      favoriteSubBtn.className = `title-icon-btn${sub.favorite ? " favorite-active" : ""}`;
      favoriteSubBtn.title = sub.favorite ? "Unfavorite subsection" : "Favorite subsection";
      favoriteSubBtn.innerHTML = favoriteIconSvg;
      const removeSubBtn = document.createElement("button");
      removeSubBtn.type = "button";
      removeSubBtn.dataset.removeSubsection = sub.id;
      removeSubBtn.dataset.parentSection = section.id;
      removeSubBtn.className = "title-icon-btn";
      removeSubBtn.title = "Remove subsection";
      removeSubBtn.innerHTML = removeIconSvg;
      removeSubBtn.style.borderColor = "#f97316";
      removeSubBtn.style.color = "#f97316";
      const addSubTaskBtn = document.createElement("button");
      addSubTaskBtn.type = "button";
      addSubTaskBtn.dataset.addSection = isNoSection ? "" : section.id;
      addSubTaskBtn.dataset.addSubsectionTarget = sub.id;
      addSubTaskBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
      addSubTaskBtn.textContent = "Add task";
      const addChildSubBtn = document.createElement("button");
      addChildSubBtn.type = "button";
      addChildSubBtn.dataset.addChildSubsection = sub.id;
      addChildSubBtn.dataset.sectionId = isNoSection ? "" : section.id;
      addChildSubBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
      addChildSubBtn.textContent = "Add subsection";
      subTitleActions.appendChild(collapseSubBtn);
      subTitleActions.appendChild(editSubBtn);
      subTitleActions.appendChild(zoomSubBtn);
      subTitleActions.appendChild(favoriteSubBtn);
      subTitleActions.appendChild(addChildSubBtn);
      subTitleActions.appendChild(addSubTaskBtn);
      subTitleActions.appendChild(removeSubBtn);
      subTitle.appendChild(subTitleText);
      subTitle.appendChild(subTitleActions);
      subHeader.appendChild(subTitle);
      subWrap.appendChild(subHeader);

      const subBody = document.createElement("div");
      subBody.dataset.subsectionBody = sub.id;
      subBody.style.display = subCollapsed ? "none" : "";

      const childSubsectionInputWrap = document.createElement("div");
      childSubsectionInputWrap.className =
        "hidden flex flex-col gap-2 md:flex-row md:items-center";
      childSubsectionInputWrap.dataset.childSubsectionForm = sub.id;
      childSubsectionInputWrap.innerHTML = `
        <input data-child-subsection-input="${sub.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-submit-child-subsection="${sub.id}" data-parent-section="${
          isNoSection ? "" : section.id
        }" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add</button>
      `;
      subBody.appendChild(childSubsectionInputWrap);

      const subZone = document.createElement("div");
      subZone.dataset.dropSection = isNoSection ? "" : section.id;
      subZone.dataset.dropSubsection = sub.id;
      subZone.className =
        "space-y-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-2 py-2";
      subZone.classList.add(TASK_ZONE_CLASS);
      const subTasks = sortTasksByOrder(sectionTasks.filter((t) => t.subsection === sub.id));
      if (subTasks.length === 0 && !suppressPlaceholders) {
        const empty = document.createElement("div");
        empty.className = `text-xs text-slate-500 ${TASK_PLACEHOLDER_CLASS}`;
        empty.textContent = "Drag tasks here or add new.";
        subZone.appendChild(empty);
      } else {
        subTasks.forEach((task) => {
          subZone.appendChild(renderTaskCard(task));
        });
      }
      subBody.appendChild(subZone);

      const children = buildChildren(sub.id);
      if (children.length) {
        const childWrap = document.createElement("div");
        childWrap.className = "space-y-2 border-l border-slate-800/60 pl-4 md:pl-6 border-lime-500/10";
        childWrap.style.marginLeft = "18px";
        children.forEach((child) => childWrap.appendChild(renderSubsection(child)));
        subBody.appendChild(childWrap);
      }
      subWrap.appendChild(subBody);
      return subWrap;
    };

    buildChildren().forEach((sub) => {
      sectionBody.appendChild(renderSubsection(sub));
    });

    card.appendChild(sectionBody);
    return card;
  };

  if (allSections.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No sections yet. Add a section to begin.</div>';
    return;
  }

  allSections.forEach((section) => {
    taskList.appendChild(renderSectionCard(section));
  });
  setupTaskSortables();
}

async function loadTasks() {
  const [tasksRaw, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const tasks = await ensureTaskIds(tasksRaw);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  await ensureDefaultSectionsPresent();
  tasksCache = tasks;
  renderTasks(tasksCache, timeMaps);
  renderBreadcrumb();
}

async function handleAddSection() {
  const name = sectionInput.value.trim();
  if (!name) return;
  const sections = settingsCache.sections || [];
  if (sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    sectionInput.value = "";
    return;
  }
  const newSection = { id: uuid(), name, favorite: false };
  const updated = [...sections, newSection];
  const subsections = { ...(settingsCache.subsections || {}), [newSection.id]: [] };
  settingsCache = { ...settingsCache, sections: updated, subsections };
  await saveSettings(settingsCache);
  renderSections();
  renderTaskSectionOptions(newSection.id);
  sectionInput.value = "";
  closeSectionForm();
  await loadTasks();
}

async function handleRemoveSection(id) {
  if (id === "section-work-default" || id === "section-personal-default") return;
  const sections = settingsCache.sections || [];
  const nextSections = sections.filter((s) => s.id !== id);
  if (nextSections.length === sections.length) return;
  const target = sections.find((s) => s.id === id);
  const confirmRemove = confirm(
    `Delete section "${target?.name || "Untitled section"}" and clear its tasks' section/subsection?`
  );
  if (!confirmRemove) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  delete subsections[id];
  settingsCache = { ...settingsCache, sections: nextSections, subsections };
  await saveSettings(settingsCache);
  const tasks = await getAllTasks();
  const updates = tasks
    .filter((t) => t.section === id)
    .map((t) => saveTask({ ...t, section: "", subsection: "" }));
  if (updates.length) {
    await Promise.all(updates);
  }
  renderSections();
  renderTaskSectionOptions();
  await loadTasks();
}

async function handleAddSubsection(sectionId, value, parentSubsectionId = "") {
  const name = value.trim();
  if (!sectionId || !name) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const parentId = parentSubsectionId || "";
  if (
    list.some(
      (s) =>
        (s.parentId || "") === parentId &&
        s.name &&
        s.name.toLowerCase() === name.toLowerCase()
    )
  )
    return;
  const entry = {
    id: uuid(),
    name,
    favorite: false,
    parentId,
    template: {
      title: subsectionTaskTitleInput?.value || "",
      link: subsectionTaskLinkInput?.value || "",
      durationMin: Number(subsectionTaskDurationInput?.value) || 30,
      minBlockMin: Number(subsectionTaskMinBlockInput?.value) || 30,
      priority: Number(subsectionTaskPriorityInput?.value) || 3,
      deadline: subsectionTaskDeadlineInput?.value || "",
      repeat:
        subsectionRepeatSelection?.type && subsectionRepeatSelection.type !== "none"
          ? subsectionRepeatSelection
          : { type: "none" },
      startFrom: subsectionTaskStartFromInput?.value || "",
      timeMapIds: collectSelectedValues(subsectionTimeMapOptions) || []
    }
  };
  subsections[sectionId] = [...list, entry];
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  renderTaskSectionOptions(sectionId);
  await loadTasks();
  return entry;
}

async function handleRenameSection(sectionId) {
  const sections = settingsCache.sections || [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return;
  const next = prompt("Rename section", section.name || "");
  if (next === null) return;
  const name = next.trim();
  if (!name || name.toLowerCase() === section.name.toLowerCase()) return;
  if (sections.some((s) => s.id !== sectionId && s.name.toLowerCase() === name.toLowerCase())) return;
  const updatedSections = sections.map((s) => (s.id === sectionId ? { ...s, name } : s));
  settingsCache = { ...settingsCache, sections: updatedSections };
  await saveSettings(settingsCache);
  renderSections();
  renderTaskSectionOptions(sectionId);
  await loadTasks();
}

async function handleRenameSubsection(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const target = list.find((s) => s.id === subsectionId);
  if (!target) return;
  const next = prompt("Rename subsection", target.name || "");
  if (next === null) return;
  const name = next.trim();
  if (!name || name.toLowerCase() === target.name.toLowerCase()) return;
  if (list.some((s) => s.id !== subsectionId && s.name.toLowerCase() === name.toLowerCase())) return;
  const updatedList = list.map((s) => (s.id === subsectionId ? { ...s, name } : s));
  subsections[sectionId] = updatedList;
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  renderTaskSectionOptions(sectionId);
  await loadTasks();
}

async function handleRemoveSubsection(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const nextList = list.filter((s) => s.id !== subsectionId);
  if (nextList.length === list.length) return;
  const target = list.find((s) => s.id === subsectionId);
  const confirmRemove = confirm(
    `Delete subsection "${target?.name || "Untitled subsection"}" and clear its tasks from this subsection?`
  );
  if (!confirmRemove) return;
  subsections[sectionId] = nextList;
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  const tasks = await getAllTasks();
  const updates = tasks
    .filter((t) => t.section === sectionId && t.subsection === subsectionId)
    .map((t) => saveTask({ ...t, subsection: "" }));
  if (updates.length) {
    await Promise.all(updates);
  }
  renderTaskSectionOptions(sectionId);
  await loadTasks();
}

async function handleToggleSectionFavorite(sectionId) {
  const sections = settingsCache.sections || [];
  const updatedSections = sections.map((s) =>
    s.id === sectionId ? { ...s, favorite: !s.favorite } : { favorite: false, ...s }
  );
  settingsCache = { ...settingsCache, sections: updatedSections };
  await saveSettings(settingsCache);
  renderSections();
  await loadTasks();
}

async function handleToggleSubsectionFavorite(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const updatedList = list.map((s) =>
    s.id === subsectionId ? { ...s, favorite: !s.favorite } : { favorite: false, ...s }
  );
  subsections[sectionId] = updatedList;
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  renderTaskSectionOptions(sectionId);
  await loadTasks();
}

function getZoomLabel() {
  if (!zoomFilter) return "";
  if (zoomFilter.type === "section") {
    const name = zoomFilter.sectionId ? getSectionName(zoomFilter.sectionId) : "No section";
    return `section "${name || "Untitled section"}"`;
  }
  if (zoomFilter.type === "subsection") {
    const subName = getSubsectionsFor(zoomFilter.sectionId).find(
      (s) => s.id === zoomFilter.subsectionId
    )?.name;
    return `subsection "${subName || "Untitled subsection"}"`;
  }
  if (zoomFilter.type === "task") {
    const task = tasksCache.find((t) => t.id === zoomFilter.taskId);
    return task ? `task "${task.title}"` : "task";
  }
  return "";
}

function setZoomFilter(filter, options = {}) {
  const { record = true } = options;
  zoomFilter = filter;
  updateUrlWithZoom(filter);
  renderTasks(tasksCache, tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) pushNavigation(filter);
}

function clearZoomFilter(options = {}) {
  const { record = true } = options;
  zoomFilter = null;
  updateUrlWithZoom(null);
  renderTasks(tasksCache, tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) pushNavigation(null);
}

function goHome() {
  clearZoomFilter();
  switchView("tasks");
}

function applyNavEntry(entry) {
  if (!entry) {
    clearZoomFilter({ record: false });
    return;
  }
  setZoomFilter(entry, { record: false });
}

function goBackInNavigation() {
  if (navIndex <= 0) return false;
  navIndex -= 1;
  applyNavEntry(navStack[navIndex]);
  return true;
}

function goForwardInNavigation() {
  if (navIndex < 0 || navIndex >= navStack.length - 1) return false;
  navIndex += 1;
  applyNavEntry(navStack[navIndex]);
  return true;
}

function zoomOutOneLevel() {
  if (!zoomFilter) return;
  if (zoomFilter.type === "task") {
    if (zoomFilter.subsectionId) {
      setZoomFilter(
        {
          type: "subsection",
          sectionId: zoomFilter.sectionId || "",
          subsectionId: zoomFilter.subsectionId
        },
        { record: true }
      );
      return;
    }
    if (zoomFilter.sectionId !== undefined) {
      setZoomFilter({ type: "section", sectionId: zoomFilter.sectionId || "" }, { record: true });
      return;
    }
    clearZoomFilter();
    return;
  }
  if (zoomFilter.type === "subsection") {
    setZoomFilter({ type: "section", sectionId: zoomFilter.sectionId || "" }, { record: true });
    return;
  }
  if (zoomFilter.type === "section") {
    clearZoomFilter();
  }
}

function renderBreadcrumb() {
  if (!navBreadcrumb) return;
  navBreadcrumb.innerHTML = "";
  const crumbs = [];
  const addSectionCrumb = (sectionId) => {
    if (sectionId === undefined || sectionId === null) return;
    const label = sectionId ? getSectionName(sectionId) || "Untitled section" : "No section";
    crumbs.push({
      label,
      onClick: () => setZoomFilter({ type: "section", sectionId: sectionId || "" })
    });
  };
  const addSubsectionCrumb = (sectionId, subsectionId) => {
    if (!subsectionId) return;
    const name = getSubsectionsFor(sectionId).find((s) => s.id === subsectionId)?.name || "Untitled subsection";
    crumbs.push({
      label: name,
      onClick: () =>
        setZoomFilter({
          type: "subsection",
          sectionId: sectionId || "",
          subsectionId
        })
    });
  };
  const addTaskCrumb = (taskId, sectionId, subsectionId) => {
    if (!taskId) return;
    const task = tasksCache.find((t) => t.id === taskId);
    if (!task) return;
    crumbs.push({
      label: task.title || "Task",
      onClick: () =>
        setZoomFilter({
          type: "task",
          taskId,
          sectionId: sectionId || "",
          subsectionId: subsectionId || ""
        })
    });
  };

  // Always start with Home.
  crumbs.push({
    label: "Home",
    icon: homeIconSvg,
    onClick: () => goHome()
  });

  if (zoomFilter) {
    if (zoomFilter.type === "section") {
      addSectionCrumb(zoomFilter.sectionId);
    } else if (zoomFilter.type === "subsection") {
      addSectionCrumb(zoomFilter.sectionId);
      addSubsectionCrumb(zoomFilter.sectionId, zoomFilter.subsectionId);
    } else if (zoomFilter.type === "task") {
      addSectionCrumb(zoomFilter.sectionId);
      addSubsectionCrumb(zoomFilter.sectionId, zoomFilter.subsectionId);
      addTaskCrumb(zoomFilter.taskId, zoomFilter.sectionId, zoomFilter.subsectionId);
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center gap-2 text-xs text-slate-300";
  crumbs.forEach((crumb, idx) => {
    if (idx > 0) {
      const sep = document.createElement("span");
      sep.className = "text-slate-500";
      sep.textContent = ">";
      wrapper.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-lime-300";
    btn.innerHTML = crumb.icon ? `${crumb.icon}<span>${crumb.label}</span>` : crumb.label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      crumb.onClick?.();
    });
    wrapper.appendChild(btn);
  });
  navBreadcrumb.appendChild(wrapper);
}

function handleNavigationShortcuts(event) {
  if (isTypingTarget(event.target)) return;
  const key = event.key;
  const isBack = key === "BrowserBack";
  const isForward = key === "BrowserForward";
  if (!isBack && !isForward) return;
  if (isBack) {
    if (goBackInNavigation()) event.preventDefault();
  } else if (isForward) {
    if (goForwardInNavigation()) event.preventDefault();
  }
}

function handleNavigationMouseButtons(event) {
  if (isTypingTarget(event.target)) return;
  // 3: Back button, 4: Forward button (common for mouse side buttons)
  if (event.button === 3) {
    if (goBackInNavigation()) event.preventDefault();
  } else if (event.button === 4) {
    if (goForwardInNavigation()) event.preventDefault();
  }
}

let sortableInstances = [];

function toggleZoneHighlight(zone, shouldHighlight) {
  if (!zone) return;
  sortableHighlightClasses.forEach((cls) =>
    zone.classList[shouldHighlight ? "add" : "remove"](cls)
  );
}

function destroyTaskSortables() {
  sortableInstances.forEach((instance) => instance?.destroy?.());
  sortableInstances = [];
}

function ensureSortableStyles() {
  if (document.getElementById(TASK_SORTABLE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TASK_SORTABLE_STYLE_ID;
  style.textContent = `
.sortable-ghost { opacity: 0.6; }
.sortable-drag { opacity: 0.8; }
.sortable-chosen {
  box-shadow: 0 10px 25px rgba(74, 222, 128, 0.45);
  outline: 2px solid rgba(74, 222, 128, 0.7);
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

function getRepeatSummary(repeat) {
  if (!repeat || repeat.type === "none") return "Does not repeat";
  const unit = repeat.unit || "week";
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const end = repeat.end || { type: "never" };
  const parts = [];
  parts.push(`Every ${interval} ${unit}${interval > 1 ? "s" : ""}`);
  const weeklyDays = Array.isArray(repeat.weeklyDays)
    ? repeat.weeklyDays
    : Array.isArray(repeat.byWeekdays)
      ? repeat.byWeekdays
      : [];
  if (unit === "week" && weeklyDays.length) {
    const labels = weeklyDays
      .map((d) => getWeekdayShortLabel(d))
      .filter(Boolean);
    if (labels.length) parts.push(`on ${labels.join(", ")}`);
  }
  if (unit === "month" && repeat.monthlyMode === "nth") {
    parts.push(
      `on the ${formatOrdinal(repeat.monthlyNth || 1)} ${dayOptions.find((d) => d.value === repeat.monthlyWeekday)?.label || ""
      }`
    );
  } else if (unit === "month") {
    parts.push(`on day ${repeat.monthlyDay || 1}`);
  }
  if (unit === "year") {
    parts.push(`on ${repeat.yearlyMonth || ""}/${repeat.yearlyDay || ""}`);
  }
  if (end.type === "on" && end.date) {
    parts.push(`until ${formatDate(end.date)}`);
  } else if (end.type === "after" && end.count) {
    parts.push(`for ${end.count} time${end.count > 1 ? "s" : ""}`);
  }
  return parts.join(" · ") || "Custom repeat";
}

function getDropBeforeId(element) {
  const nextTask = element?.nextElementSibling?.closest?.("[data-task-id]");
  return nextTask ? nextTask.dataset.taskId : null;
}

function findPreviousTaskId(card) {
  if (!card) return "";
  let prev = card.previousElementSibling;
  while (prev) {
    const prevId = prev.dataset?.taskId;
    if (prevId) return prevId;
    prev = prev.previousElementSibling;
  }
  return "";
}

async function handleTaskSortEnd(evt) {
  const movedTaskId = evt.item?.dataset?.taskId;
  const targetZone = evt.to?.closest?.("[data-drop-section]");
  if (!movedTaskId || !targetZone) return;
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
  const targetSection = (targetZone.dataset.dropSection || "").trim();
  const targetSubsection = (targetZone.dataset.dropSubsection || "").trim();
  const dropBeforeId = getDropBeforeId(evt.item);
  const prevTaskId = findPreviousTaskId(evt.item);
  const movedTask = tasksCache.find((t) => t.id === movedTaskId);
  const dropBeforeTask = dropBeforeId ? tasksCache.find((t) => t.id === dropBeforeId) : null;
  const prevTask = prevTaskId ? tasksCache.find((t) => t.id === prevTaskId) : null;
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const movedSubtreeIds = new Set(getTaskAndDescendants(movedTaskId, tasksCache).map((t) => t.id));
  const resolveParent = (task) => {
    if (!task) return { found: false, parentId: null };
    let candidateId = task.subtaskParentId || null;
    while (candidateId && movedSubtreeIds.has(candidateId)) {
      const ancestor = tasksCache.find((t) => t.id === candidateId);
      candidateId = ancestor?.subtaskParentId || null;
    }
    if (!candidateId) return { found: true, parentId: null };
    const candidateTask = tasksCache.find((t) => t.id === candidateId);
    if (!candidateTask) return { found: true, parentId: null };
    const candidateKey = getContainerKey(candidateTask.section, candidateTask.subsection);
    if (candidateKey !== targetKey) return { found: true, parentId: null };
    return { found: true, parentId: candidateId };
  };
  const parentFromDropBefore = resolveParent(dropBeforeTask);
  const parentFromPrev = resolveParent(prevTask);
  const desiredParentId = parentFromDropBefore.found
    ? parentFromDropBefore.parentId
    : parentFromPrev.parentId;
  const reorderResult = computeTaskReorderUpdates(
    tasksCache,
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId
  );
  const updates = reorderResult.updates || [];
  const existingIndex = updates.findIndex((u) => u.id === movedTaskId);
  if (movedTask && desiredParentId !== movedTask.subtaskParentId) {
    const base = existingIndex >= 0 ? updates[existingIndex] : movedTask;
    const updated = { ...base, subtaskParentId: desiredParentId };
    if (existingIndex >= 0) {
      updates[existingIndex] = updated;
    } else {
      updates.push(updated);
    }
  }
  const changed = updates.length > 0 || reorderResult.changed;
  await Promise.all(updates.map((t) => saveTask(t)));
  await loadTasks();
}

function setupTaskSortables() {
  destroyTaskSortables();
  ensureSortableStyles();
  const zones = [...taskList.querySelectorAll(`.${TASK_ZONE_CLASS}`)];
  zones.forEach((zone) => {
    const sortable = new Sortable(zone, {
      group: { name: TASK_SORT_GROUP, pull: true, put: true },
      animation: 150,
      draggable: "[data-task-id]",
      handle: undefined,
      filter: `.${TASK_PLACEHOLDER_CLASS}, button, a, input, textarea, select, label`,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      swapThreshold: 0.65,
      fallbackOnBody: true,
      onStart: (event) => {
        toggleZoneHighlight(event.from, true);
      },
      onEnd: (event) => {
        toggleZoneHighlight(event.from, false);
        toggleZoneHighlight(event.to, false);
        handleTaskSortEnd(event).catch((error) => console.error("Task sort failed", error));
      }
    });
    sortableInstances.push(sortable);
  });
}

function computeTaskReorderUpdates(tasks, movedTaskId, targetSection, targetSubsection, dropBeforeId) {
  const movedTask = tasks.find((t) => t.id === movedTaskId);
  if (!movedTask) return { updates: [], changed: false };
  const movedSubtree = getTaskAndDescendants(movedTaskId, tasks);
  const movedIds = new Set(movedSubtree.map((t) => t.id));
  const sourceKey = getContainerKey(movedTask.section, movedTask.subsection);
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const remainingSource = sortTasksByOrder(
    tasks.filter(
      (t) =>
        getContainerKey(t.section, t.subsection) === sourceKey && !movedIds.has(t.id)
    )
  );
  const destinationExisting =
    sourceKey === targetKey
      ? remainingSource
      : sortTasksByOrder(
          tasks.filter(
            (t) =>
              getContainerKey(t.section, t.subsection) === targetKey && !movedIds.has(t.id)
          )
        );
  const destinationList = [...destinationExisting];
  const cleanedDropBeforeId = dropBeforeId && !movedIds.has(dropBeforeId) ? dropBeforeId : null;
  const insertAtCandidate =
    cleanedDropBeforeId && cleanedDropBeforeId !== movedTaskId
      ? destinationList.findIndex((t) => t.id === cleanedDropBeforeId)
      : -1;
  const insertAt = insertAtCandidate >= 0 ? insertAtCandidate : destinationList.length;
  const movedBlock = sortTasksByOrder(movedSubtree).map((task) => ({
    ...task,
    section: targetSection,
    subsection: targetSubsection
  }));
  destinationList.splice(insertAt, 0, ...movedBlock);
  const updates = [];
  const assignOrders = (list, section, subsection) => {
    list.forEach((task, index) => {
      const desiredOrder = index + 1;
      if (
        task.section !== section ||
        (task.subsection || "") !== (subsection || "") ||
        task.order !== desiredOrder
      ) {
        updates.push({ ...task, section, subsection, order: desiredOrder });
      }
    });
  };
  if (sourceKey === targetKey) {
    assignOrders(destinationList, targetSection, targetSubsection);
  } else {
    assignOrders(remainingSource, movedTask.section || "", movedTask.subsection || "");
    assignOrders(destinationList, targetSection, targetSubsection);
  }
  return { updates, changed: updates.length > 0 };
}

async function indentTaskUnderPrevious(card) {
  if (!card) return;
  const childId = card.dataset.taskId;
  const childDepth = getTaskDepth(childId, tasksCache);
  let parentId = "";
  let prev = card.previousElementSibling;
  while (prev) {
    const pid = prev.dataset?.taskId;
    if (pid) {
      const prevDepth = getTaskDepth(pid, tasksCache);
      if (prevDepth <= childDepth) {
        parentId = pid;
        break;
      }
    }
    prev = prev.previousElementSibling;
  }
  if (!childId || !parentId) return;
  const childTask = tasksCache.find((t) => t.id === childId);
  const parentTask = tasksCache.find((t) => t.id === parentId);
  if (!childTask || !parentTask) return;
  const childDescendants = new Set(getTaskAndDescendants(childId, tasksCache).map((t) => t.id));
  if (childDescendants.has(parentTask.id)) return;
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const nextOrder = getNextSubtaskOrder(parentTask, section, subsection, tasksCache);
  const updatedChild = {
    ...childTask,
    section,
    subsection,
    subtaskParentId: parentTask.id,
    order: nextOrder
  };
  await saveTask(updatedChild);
  await loadTasks();
}

async function outdentTask(card) {
  if (!card) return;
  const childId = card.dataset.taskId;
  const childTask = tasksCache.find((t) => t.id === childId);
  if (!childTask || !childTask.subtaskParentId) return;
  const parentTask = tasksCache.find((t) => t.id === childTask.subtaskParentId);
  if (!parentTask) return;
  const subtree = getTaskAndDescendants(childId, tasksCache);
  const descendantIds = new Set(subtree.filter((t) => t.id !== childId).map((t) => t.id));
  const oldSection = childTask.section || "";
  const oldSubsection = childTask.subsection || "";
  const newParentId = parentTask.subtaskParentId || null;
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const sourceKey = getContainerKey(oldSection, oldSubsection);
  const updates = [];
  const originalById = new Map(tasksCache.map((t) => [t.id, t]));

  // Reparent all descendants to the old parent, keeping their relative positions.
  const adjustedContainerTasks = sortTasksByOrder(
    tasksCache
      .filter((t) => getContainerKey(t.section, t.subsection) === sourceKey)
      .filter((t) => t.id !== childId)
      .map((t) => {
        if (descendantIds.has(t.id)) {
          return { ...t, subtaskParentId: parentTask.id, section, subsection };
        }
        return t;
      })
  );

  // Place the moved task at the end of the container as a sibling of the old parent.
  const adoptedIds = new Set(adjustedContainerTasks.filter((t) => t.subtaskParentId === parentTask.id).map((t) => t.id));
  const finalList = [
    ...adjustedContainerTasks,
    { ...childTask, section, subsection, subtaskParentId: newParentId }
  ];

  finalList.forEach((task, idx) => {
    const desiredOrder = idx + 1;
    const desiredSection = task.section || "";
    const desiredSubsection = task.subsection || "";
    const desiredParentId =
      task.id === childId
        ? newParentId
        : descendantIds.has(task.id) || adoptedIds.has(task.id)
          ? parentTask.id
          : task.subtaskParentId;
    const original = originalById.get(task.id);
    const needsUpdate =
      !original ||
      original.order !== desiredOrder ||
      (original.section || "") !== desiredSection ||
      (original.subsection || "") !== desiredSubsection ||
      (original.subtaskParentId || "") !== (desiredParentId || "");
    if (
      needsUpdate
    ) {
      updates.push({
        ...task,
        section: desiredSection,
        subsection: desiredSubsection,
        order: desiredOrder,
        subtaskParentId: desiredParentId
      });
    }
  });
  if (updates.length === 0) return;
  await Promise.all(updates.map((t) => saveTask(t)));
  await loadTasks();
}

async function ensureTaskIds(tasks) {
  const updates = [];
  const orderTracker = new Map();
  const withIds = tasks.map((task) => {
    let changed = false;
    let nextTask = task;
  if (!nextTask.id) {
    nextTask = { ...nextTask, id: uuid() };
    changed = true;
  }
  if (nextTask.minBlockMin === undefined) {
    nextTask = { ...nextTask, minBlockMin: 30 };
    changed = true;
  }
  if (nextTask.subtaskParentId === undefined) {
    nextTask = { ...nextTask, subtaskParentId: null };
    changed = true;
  }
  if (nextTask.startFrom === undefined) {
    nextTask = { ...nextTask, startFrom: null };
    changed = true;
  }
    if (nextTask.completed === undefined) {
      nextTask = { ...nextTask, completed: false };
      changed = true;
    }
    if (nextTask.completedAt === undefined) {
      nextTask = { ...nextTask, completedAt: null };
      changed = true;
    }
    if (!nextTask.repeat) {
      nextTask = { ...nextTask, repeat: { type: "none" } };
      changed = true;
    }
    if (!nextTask.scheduleStatus) {
      nextTask = { ...nextTask, scheduleStatus: "unscheduled" };
      changed = true;
    }
    const key = getContainerKey(nextTask.section, nextTask.subsection);
    const numericOrder = Number(nextTask.order);
    const hasOrder = Number.isFinite(numericOrder);
    const currentMax = orderTracker.get(key) || 0;
    if (!hasOrder) {
      const assignedOrder = currentMax + 1;
      orderTracker.set(key, assignedOrder);
      nextTask = { ...nextTask, order: assignedOrder };
      changed = true;
    } else {
      orderTracker.set(key, Math.max(currentMax, numericOrder));
      if (nextTask.order !== numericOrder) {
        nextTask = { ...nextTask, order: numericOrder };
        changed = true;
      }
    }
    if (changed) {
      updates.push(saveTask(nextTask));
    }
    return nextTask;
  });
  if (updates.length) {
    await Promise.all(updates);
  }
  return withIds;
}

async function migrateSectionsAndTasks(tasks, settings) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const sectionsInput = Array.isArray(mergedSettings.sections) ? mergedSettings.sections : [];
  const sectionIdMap = new Map();
  const sectionNameMap = new Map();
  const sections = [];

  const addSection = (name, id, favorite = false) => {
    const finalId = id || uuid();
    if (sectionIdMap.has(finalId)) return sectionIdMap.get(finalId);
    const section = { id: finalId, name: name || "Untitled section", favorite: Boolean(favorite) };
    sectionIdMap.set(finalId, section);
    if (section.name) sectionNameMap.set(section.name.toLowerCase(), finalId);
    sections.push(section);
    return section;
  };

  sectionsInput.forEach((entry) => {
    if (entry && typeof entry === "object" && entry.id) {
      addSection(entry.name, entry.id, entry.favorite);
    } else if (typeof entry === "string") {
      addSection(entry, undefined, false);
    }
  });
  if (sections.length === 0) {
    DEFAULT_SETTINGS.sections.forEach((s) => addSection(s.name, s.id, s.favorite));
  }

  const subsectionsRaw = mergedSettings.subsections || {};
  const subsections = {};
  const subsectionIdMaps = {};
  const subsectionNameMaps = {};

  const ensureSubsectionMaps = (sectionId) => {
    if (!subsections[sectionId]) {
      subsections[sectionId] = [];
    }
    if (!subsectionIdMaps[sectionId]) {
      const idMap = new Map();
      const nameMap = new Map();
      (subsections[sectionId] || []).forEach((sub) => {
        if (sub?.id) {
          idMap.set(sub.id, sub);
          if (sub.name) nameMap.set(sub.name.toLowerCase(), sub.id);
        }
      });
      subsectionIdMaps[sectionId] = idMap;
      subsectionNameMaps[sectionId] = nameMap;
    }
  };

  Object.entries(subsectionsRaw).forEach(([key, list]) => {
    const targetSectionId = sectionIdMap.has(key)
      ? key
      : sectionNameMap.get((key || "").toLowerCase());
    if (!targetSectionId) return;
    ensureSubsectionMaps(targetSectionId);
    (list || []).forEach((item) => {
      const name = typeof item === "string" ? item : item?.name || "Untitled subsection";
      const id = typeof item === "object" && item?.id ? item.id : uuid();
      const favorite = typeof item === "object" && item?.favorite ? Boolean(item.favorite) : false;
      const parentId = typeof item === "object" && item?.parentId ? item.parentId : "";
      if (subsectionIdMaps[targetSectionId].has(id)) return;
      const sub = { id, name, favorite, parentId };
      subsections[targetSectionId].push(sub);
      subsectionIdMaps[targetSectionId].set(id, sub);
      if (name) subsectionNameMaps[targetSectionId].set(name.toLowerCase(), id);
    });
  });

  sections.forEach((section) => ensureSubsectionMaps(section.id));

  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const updatedTasks = [];
  const taskUpdates = [];

  tasks.forEach((task) => {
    let newSectionId = "";
    if (task.section) {
      if (sectionIdMap.has(task.section)) {
        newSectionId = task.section;
      } else {
        const fromName = sectionNameMap.get(task.section.toLowerCase?.() || task.section);
        if (fromName) {
          newSectionId = fromName;
        } else {
          newSectionId = addSection(task.section).id;
        }
      }
    }
    ensureSubsectionMaps(newSectionId);
    let newSubsectionId = "";
    if (task.subsection && newSectionId) {
      const idMap = subsectionIdMaps[newSectionId];
      const nameMap = subsectionNameMaps[newSectionId];
      if (idMap.has(task.subsection)) {
        newSubsectionId = task.subsection;
      } else {
        const fromName = nameMap.get(task.subsection.toLowerCase?.() || task.subsection);
        if (fromName) {
          newSubsectionId = fromName;
        } else {
          const subId = uuid();
          const sub = { id: subId, name: task.subsection, favorite: false };
          subsections[newSectionId].push(sub);
          idMap.set(subId, sub);
          if (sub.name) nameMap.set(sub.name.toLowerCase(), subId);
          newSubsectionId = subId;
        }
      }
    }
    const updated = { ...task, section: newSectionId, subsection: newSubsectionId };
    updatedTasks.push(updated);
    const original = tasksById.get(task.id);
    if (!original || original.section !== newSectionId || (original.subsection || "") !== newSubsectionId) {
      taskUpdates.push(saveTask(updated));
    }
  });

  const normalizedSettings = {
    ...mergedSettings,
    sections,
    subsections
  };

  const settingsChanged = JSON.stringify(mergedSettings) !== JSON.stringify(normalizedSettings);
  if (settingsChanged) {
    await saveSettings(normalizedSettings);
  }
  if (taskUpdates.length) {
    await Promise.all(taskUpdates);
  }

  return { tasks: updatedTasks, settings: normalizedSettings };
}

function collectSelectedValues(container) {
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map((el) => {
    const val = el.value;
    return /^\d+$/.test(val) ? Number(val) : val;
  });
}

function collectTimeMapRules(container) {
  const rules = [];
  container.querySelectorAll("[data-day-row]").forEach((row) => {
    const day = Number(row.dataset.dayRow);
    const checkbox = row.querySelector("input[type='checkbox']");
    if (!checkbox?.checked) return;
    row.querySelectorAll("[data-block]").forEach((blockRow) => {
      const start = blockRow.querySelector("input[data-start-for]");
      const end = blockRow.querySelector("input[data-end-for]");
      const startTime = start?.value || "09:00";
      const endTime = end?.value || "12:00";
      if (startTime && endTime && startTime < endTime) {
        rules.push({ day, startTime, endTime });
      }
    });
  });
  return rules.sort((a, b) => a.day - b.day);
}

function getTimeMapFormData() {
  const id = document.getElementById("timemap-id").value || uuid();
  const name = document.getElementById("timemap-name").value.trim();
  const color = timeMapColorInput.value || "#22c55e";
  const rules = collectTimeMapRules(timeMapDayRows);
  if (rules.length === 0) {
    alert("Select at least one day and a valid time window.");
    return null;
  }
  if (!name) {
    alert("Name is required.");
    return null;
  }
  document.getElementById("timemap-id").value = id;
  return { id, name, rules, color };
}

async function handleTimeMapSubmit(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) return;
  await saveTimeMap(timeMap);
  resetTimeMapForm();
  closeTimeMapForm();
  await loadTimeMaps();
}

async function handleSetDefaultTimeMap(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) return;
  await saveTimeMap(timeMap);
  settingsCache = { ...settingsCache, defaultTimeMapId: timeMap.id };
  await saveSettings(settingsCache);
  await Promise.all([loadTimeMaps(), loadTasks()]);
}

async function handleTaskSubmit(event) {
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
  const defaultSectionId = (settingsCache.sections || [])[0]?.id || "";
  const section = taskSectionSelect.value || defaultSectionId;
  const subsection = taskSubsectionSelect.value || "";
  const parentId = (taskParentIdInput.value || "").trim();
  const parentTask = parentId ? tasksCache.find((t) => t.id === parentId) : null;
  const existingTask = tasksCache.find((t) => t.id === id);
  const targetKey = getContainerKey(section, subsection);
  const isEditingInPlace =
    existingTask &&
    getContainerKey(existingTask.section, existingTask.subsection) === targetKey;
  const canUseParentOrdering =
    parentTask && getContainerKey(parentTask.section, parentTask.subsection) === targetKey;
  const order = isEditingInPlace
    ? existingTask.order
    : canUseParentOrdering
      ? getNextSubtaskOrder(parentTask, section, subsection, tasksCache)
      : getNextOrder(section, subsection, tasksCache);

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

  const repeat = taskRepeatSelect.value === "custom" ? lastRepeatSelection : { type: "none" };

  await saveTask({
    id,
    title,
    durationMin,
    minBlockMin,
    priority,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    startFrom: startFrom ? new Date(startFrom).toISOString() : null,
    subtaskParentId: parentTask?.id || parentId || null,
    link: link || "",
    timeMapIds,
    section,
    subsection,
    order,
    repeat,
    completed: existingTask?.completed || false,
    completedAt: existingTask?.completedAt || null,
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null
  });
  resetTaskForm(true);
  await loadTasks();
}

function resetTaskForm(shouldClose = false) {
  repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = "";
  document.getElementById("task-title").value = "";
  taskLinkInput.value = "";
  document.getElementById("task-duration").value = "30";
  taskMinBlockInput.value = "30";
  document.getElementById("task-priority").value = "3";
  taskDeadlineInput.value = "";
  taskStartFromInput.value = "";
  setRepeatFromSelection({ type: "none" }, "task");
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(tasksTimeMapsCache || [], []);
  if (shouldClose) {
    closeTaskForm();
  }
}

function startTaskInSection(sectionId = "", subsectionId = "") {
  repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = "";
  const template =
    subsectionId && sectionId ? getSubsectionTemplate(sectionId, subsectionId) : null;
  document.getElementById("task-title").value = template?.title || "";
  taskLinkInput.value = template?.link || "";
  document.getElementById("task-duration").value = template?.durationMin || "30";
  taskMinBlockInput.value = template?.minBlockMin || "30";
  document.getElementById("task-priority").value = String(template?.priority || 3);
  taskDeadlineInput.value = template?.deadline ? template.deadline.slice(0, 10) : "";
  taskStartFromInput.value = template?.startFrom ? template.startFrom.slice(0, 10) : "";
  setRepeatFromSelection(template?.repeat || { type: "none" }, "task");
  renderTaskSectionOptions(sectionId);
  renderTaskSubsectionOptions(subsectionId);
  renderTaskTimeMapOptions(tasksTimeMapsCache || [], template?.timeMapIds || []);
  openTaskForm();
  switchView("tasks");
}

function startSubtaskFromTask(task) {
  repeatTarget = "task";
  document.getElementById("task-id").value = "";
  taskParentIdInput.value = task.id;
  document.getElementById("task-title").value = task.title || "";
  taskLinkInput.value = task.link || "";
  document.getElementById("task-duration").value = task.durationMin || "30";
  taskMinBlockInput.value = task.minBlockMin || task.durationMin || "30";
  document.getElementById("task-priority").value = String(task.priority || 3);
  taskDeadlineInput.value = task.deadline ? task.deadline.slice(0, 10) : "";
  taskStartFromInput.value = task.startFrom ? task.startFrom.slice(0, 10) : "";
  setRepeatFromSelection(task.repeat || { type: "none" }, "task");
  renderTaskSectionOptions(task.section || "");
  renderTaskSubsectionOptions(task.subsection || "");
  taskSectionSelect.value = task.section || "";
  taskSubsectionSelect.value = task.subsection || "";
  renderTaskTimeMapOptions(tasksTimeMapsCache || [], task.timeMapIds || []);
  openTaskForm();
  switchView("tasks");
}

function resetTimeMapForm() {
  document.getElementById("timemap-id").value = "";
  document.getElementById("timemap-name").value = "";
  timeMapColorInput.value = "#22c55e";
  renderDayRows(timeMapDayRows);
}

async function handleTaskListClick(event, tasks) {
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
    const affected = getTaskAndDescendants(completeTaskId, tasks);
    const target = affected[0];
    if (target) {
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
    setZoomFilter({
      type: "task",
      taskId: zoomTaskId,
      sectionId: zoomSectionId || "",
      subsectionId: zoomSubsectionId || ""
    });
  } else if (hasZoomSubAttr && zoomSubsectionId !== "") {
    setZoomFilter({
      type: "subsection",
      sectionId: zoomSectionId || "",
      subsectionId: zoomSubsectionId || ""
    });
  } else if (zoomSectionId !== undefined && hasZoomSubAttr) {
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
    openSubsectionModal(editSectionId, "");
  } else if (removeSectionId !== undefined) {
    await handleRemoveSection(removeSectionId);
  } else if (editSubsectionId !== undefined) {
    openSubsectionModal(parentSectionId || "", "", editSubsectionId);
  } else if (removeSubsectionId !== undefined) {
    await handleRemoveSubsection(parentSectionId, removeSubsectionId);
  } else if (btn.dataset.toggleSectionCollapse !== undefined) {
    const sectionId = btn.dataset.toggleSectionCollapse || "";
    if (collapsedSections.has(sectionId)) {
      collapsedSections.delete(sectionId);
    } else {
      collapsedSections.add(sectionId);
    }
    renderTasks(tasksCache, tasksTimeMapsCache);
  } else if (btn.dataset.toggleSubsectionCollapse !== undefined) {
    const subId = btn.dataset.toggleSubsectionCollapse || "";
    if (collapsedSubsections.has(subId)) {
      collapsedSubsections.delete(subId);
    } else {
      collapsedSubsections.add(subId);
    }
    renderTasks(tasksCache, tasksTimeMapsCache);
  } else if (toggleSubsectionFor !== undefined) {
    openSubsectionModal(toggleSubsectionFor, "");
  } else if (addSubsectionFor !== undefined) {
    openSubsectionModal(addSubsectionFor, "");
  } else if (addSection !== undefined) {
    startTaskInSection(addSection, addSubsectionTaskTarget || "");
  } else if (editId) {
    const task = tasks.find((t) => t.id === editId);
    if (task) {
      document.getElementById("task-id").value = task.id;
      document.getElementById("task-title").value = task.title;
      taskLinkInput.value = task.link || "";
      document.getElementById("task-duration").value = task.durationMin;
    taskMinBlockInput.value = task.minBlockMin || "30";
    document.getElementById("task-priority").value = String(task.priority);
    taskDeadlineInput.value = task.deadline ? task.deadline.slice(0, 10) : "";
    taskStartFromInput.value = task.startFrom ? task.startFrom.slice(0, 10) : "";
    taskParentIdInput.value = task.subtaskParentId || "";
    setRepeatFromSelection(task.repeat, "task");
      renderTaskSectionOptions(task.section);
      renderTaskSubsectionOptions(task.subsection);
      renderTaskTimeMapOptions(tasksTimeMapsCache, task.timeMapIds);
      openTaskForm();
      switchView("tasks");
    }
  } else if (addSubtaskId !== undefined) {
    const parentTask = tasks.find((t) => t.id === addSubtaskId);
    if (parentTask) {
      startSubtaskFromTask(parentTask);
    }
  } else if (toggleTaskDetailsId !== undefined) {
    if (expandedTaskDetails.has(toggleTaskDetailsId)) {
      expandedTaskDetails.delete(toggleTaskDetailsId);
    } else {
      expandedTaskDetails.add(toggleTaskDetailsId);
    }
    renderTasks(tasksCache, tasksTimeMapsCache);
  } else if (toggleTaskCollapseId !== undefined) {
    if (collapsedTasks.has(toggleTaskCollapseId)) {
      collapsedTasks.delete(toggleTaskCollapseId);
    } else {
      collapsedTasks.add(toggleTaskCollapseId);
    }
    renderTasks(tasksCache, tasksTimeMapsCache);
  } else if (deleteId) {
    const affected = getTaskAndDescendants(deleteId, tasks);
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

function handleTimeMapListClick(event, timeMaps) {
  const btn = event.target.closest("button");
  if (!btn) return;
  const editId = btn.dataset.edit;
  const deleteId = btn.dataset.delete;
  if (editId) {
    const tm = timeMaps.map(normalizeTimeMap).find((t) => t.id === editId);
    if (tm) {
      document.getElementById("timemap-id").value = tm.id;
      document.getElementById("timemap-name").value = tm.name;
      timeMapColorInput.value = tm.color || "#22c55e";
      renderDayRows(timeMapDayRows, tm.rules);
      openTimeMapForm();
      switchView("settings");
    }
  } else if (deleteId) {
    deleteTimeMap(deleteId).then(() => {
      loadTimeMaps();
      loadTasks();
    });
  }
}

async function updateScheduleSummary() {
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

async function handleReschedule() {
  rescheduleButtons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("opacity-60", "cursor-not-allowed");
  });
  scheduleStatus.textContent = "Scheduling...";
  try {
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
    scheduleStatus.textContent = `Scheduled ${response.scheduled}, unscheduled ${response.unscheduled}, ignored ${response.ignored}.`;
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

async function initSettings(prefetchedSettings) {
  const settings = prefetchedSettings || (await getSettings());
  settingsCache = { ...DEFAULT_SETTINGS, ...settings };
  horizonInput.value = settingsCache.schedulingHorizonDays;
  horizonInput.addEventListener("change", async () => {
    const days = Number(horizonInput.value) || 14;
    settingsCache = { ...settingsCache, schedulingHorizonDays: days };
    await saveSettings(settingsCache);
  });
}

async function hydrate() {
  renderDayRows(timeMapDayRows);
  const [tasksRaw, timeMapsRaw, settings] = await Promise.all([
    getAllTasks(),
    getAllTimeMaps(),
    getSettings()
  ]);
  const tasksWithIds = await ensureTaskIds(tasksRaw);
  const { tasks, settings: normalizedSettings } = await migrateSectionsAndTasks(tasksWithIds, settings);
  await initSettings(normalizedSettings);
  await ensureDefaultSectionsPresent();
  renderSections();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  tasksCache = tasks;
  renderTimeMaps(timeMaps);
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(timeMaps);
  const initialZoom = parseZoomFromUrl();
  if (initialZoom) {
    setZoomFilter(initialZoom);
  } else {
    renderTasks(tasksCache, timeMaps);
    renderBreadcrumb();
    pushNavigation(null);
  }
  await updateScheduleSummary();
}

document.getElementById("timemap-form").addEventListener("submit", handleTimeMapSubmit);
document.getElementById("timemap-set-default").addEventListener("click", handleSetDefaultTimeMap);
document.getElementById("task-form").addEventListener("submit", handleTaskSubmit);
document.getElementById("timemap-reset").addEventListener("click", resetTimeMapForm);
rescheduleButtons.forEach((btn) => btn.addEventListener("click", handleReschedule));
sectionAddBtn.addEventListener("click", handleAddSection);
sectionFormToggle.addEventListener("click", () => {
  if (sectionFormRow.classList.contains("hidden")) {
    openSectionForm();
  } else {
    closeSectionForm();
  }
});
sectionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddSection();
  }
});
sectionList.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-remove-section]");
  if (!btn) return;
  handleRemoveSection(btn.dataset.removeSection);
});
taskSectionSelect.addEventListener("change", () => renderTaskSubsectionOptions());

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
settingsToggleBtn?.addEventListener("click", () => switchView("settings"));

function openTimeMapForm() {
  timeMapFormWrap.classList.remove("hidden");
  timeMapToggle.textContent = "Hide TimeMap form";
}

function closeTimeMapForm() {
  timeMapFormWrap.classList.add("hidden");
  timeMapToggle.textContent = "Show TimeMap form";
}

function openTaskForm() {
  taskFormWrap.classList.remove("hidden");
  taskToggle.textContent = "Add task";
  document.body.classList.add("modal-open");
  setTimeout(() => {
    document.getElementById("task-title")?.focus();
  }, 50);
}

function closeTaskForm() {
  taskFormWrap.classList.add("hidden");
  taskToggle.textContent = "Add task";
  document.body.classList.remove("modal-open");
}

function enableDeadlinePicker() {
  const openPicker = (event) => {
    if (!event?.isTrusted) return;
    if (typeof taskDeadlineInput.showPicker === "function") {
      try {
        taskDeadlineInput.showPicker();
      } catch (_err) {
        // Some browsers block showPicker without a direct gesture; ignore.
      }
    } else {
      taskDeadlineInput.focus();
    }
  };
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      openPicker(event);
    }
  };
  taskDeadlineInput.addEventListener("click", openPicker);
  taskDeadlineInput.addEventListener("keydown", handleKeyDown);
}

timeMapToggle.addEventListener("click", () => {
  if (timeMapFormWrap.classList.contains("hidden")) {
    openTimeMapForm();
  } else {
    closeTimeMapForm();
  }
});

taskToggle.addEventListener("click", () => {
  startTaskInSection();
});

timeMapList.addEventListener("click", async (event) => {
  const timeMaps = await getAllTimeMaps();
  handleTimeMapListClick(event, timeMaps);
});

taskList.addEventListener("click", async (event) => {
  const [tasks, timeMaps] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  tasksTimeMapsCache = timeMaps.map(normalizeTimeMap);
  await handleTaskListClick(event, tasks);
});
taskRepeatSelect?.addEventListener("change", () => {
  const value = taskRepeatSelect.value;
  const baseSelection = lastRepeatSelection?.type === "custom" ? lastRepeatSelection : { type: "none" };
  if (value === "custom" || value === "custom-new") {
    repeatTarget = "task";
    repeatSelectionBeforeModal = baseSelection;
    openRepeatModal();
    const initial =
      lastRepeatSelection?.type === "custom"
        ? lastRepeatSelection
        : { type: "custom", unit: repeatState.unit === "none" ? "week" : repeatState.unit };
    setRepeatFromSelection(initial);
  } else {
    setRepeatFromSelection({ type: "none" });
  }
});
subsectionTaskRepeatSelect?.addEventListener("change", () => {
  const value = subsectionTaskRepeatSelect.value;
  const baseSelection =
    subsectionRepeatSelection?.type === "custom" ? subsectionRepeatSelection : { type: "none" };
  if (value === "custom" || value === "custom-new") {
    repeatTarget = "subsection";
    subsectionRepeatBeforeModal = baseSelection;
    openRepeatModal();
    const initial =
      subsectionRepeatSelection?.type === "custom"
        ? subsectionRepeatSelection
        : { type: "custom", unit: repeatState.unit === "none" ? "week" : repeatState.unit };
    setRepeatFromSelection(initial, "subsection");
  } else {
    repeatTarget = "subsection";
    setRepeatFromSelection({ type: "none" }, "subsection");
    syncSubsectionRepeatLabel();
  }
});
taskRepeatUnit?.addEventListener("change", () => {
  const unit = taskRepeatUnit.value || "week";
  repeatState.unit = unit;
  if (unit === "week" && (!repeatState.weeklyDays || repeatState.weeklyDays.length === 0)) {
    repeatState.weeklyDays = [getStartDate().getDay()];
  }
  if (unit === "month") {
    const start = getStartDate();
    repeatState.monthlyDay = start.getDate();
    const { nth, weekday } = getNthWeekday(start);
    repeatState.monthlyNth = nth;
    repeatState.monthlyWeekday = weekday;
  }
  if (unit === "year") {
    const start = getStartDate();
    repeatState.yearlyMonth = start.getMonth() + 1;
    repeatState.yearlyDay = start.getDate();
  }
  renderRepeatUI();
});
taskRepeatInterval?.addEventListener("input", () => {
  const parsed = Math.max(1, Number(taskRepeatInterval.value) || 1);
  repeatState.interval = parsed;
  taskRepeatInterval.value = parsed;
});
taskRepeatWeekdays?.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-day-value]");
  if (!btn) return;
  const day = Number(btn.dataset.dayValue);
  const set = new Set(repeatState.weeklyDays || []);
  if (set.has(day)) {
    set.delete(day);
  } else {
    set.add(day);
  }
  if (set.size === 0) set.add(getStartDate().getDay());
  repeatState.weeklyDays = Array.from(set);
  renderRepeatUI();
});
taskRepeatMonthlyMode?.addEventListener("change", () => {
  repeatState.monthlyMode = taskRepeatMonthlyMode.value || "day";
  renderRepeatUI();
});
taskRepeatMonthlyDay?.addEventListener("input", () => {
  const val = Math.min(31, Math.max(1, Number(taskRepeatMonthlyDay.value) || 1));
  repeatState.monthlyDay = val;
  taskRepeatMonthlyDay.value = val;
});
taskRepeatMonthlyNth?.addEventListener("change", () => {
  repeatState.monthlyNth = Number(taskRepeatMonthlyNth.value) || 1;
});
taskRepeatMonthlyWeekday?.addEventListener("change", () => {
  repeatState.monthlyWeekday = Number(taskRepeatMonthlyWeekday.value) || 0;
});
const updateRepeatEnd = () => {
  if (taskRepeatEndAfter.checked) {
    repeatState.end = {
      type: "after",
      count: Math.max(1, Number(taskRepeatEndCount.value) || 1)
    };
  } else if (taskRepeatEndOn.checked) {
    repeatState.end = { type: "on", date: taskRepeatEndDate.value };
  } else {
    repeatState.end = { type: "never", date: "", count: 1 };
  }
};
taskRepeatEndNever?.addEventListener("change", updateRepeatEnd);
taskRepeatEndOn?.addEventListener("change", updateRepeatEnd);
taskRepeatEndAfter?.addEventListener("change", updateRepeatEnd);
taskRepeatEndDate?.addEventListener("input", updateRepeatEnd);
taskRepeatEndCount?.addEventListener("input", () => {
  taskRepeatEndCount.value = Math.max(1, Number(taskRepeatEndCount.value) || 1);
  updateRepeatEnd();
});
repeatModalCloseBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    closeRepeatModal();
    if (repeatTarget === "subsection") {
      setRepeatFromSelection(subsectionRepeatBeforeModal || { type: "none" }, "subsection");
      const prev = subsectionRepeatBeforeModal || { type: "none" };
      subsectionTaskRepeatSelect.value = prev.type === "custom" ? "custom" : "none";
      syncSubsectionRepeatLabel();
    } else {
      setRepeatFromSelection(repeatSelectionBeforeModal || { type: "none" }, "task");
      const prev = repeatSelectionBeforeModal || { type: "none" };
      taskRepeatSelect.value = prev.type === "custom" ? "custom" : "none";
      syncRepeatSelectLabel();
    }
    repeatTarget = "task";
  })
);
repeatModalSaveBtn?.addEventListener("click", () => {
  const repeat = buildRepeatFromState();
  if (repeatTarget === "subsection") {
    subsectionRepeatSelection = repeat;
    setRepeatFromSelection(repeat, "subsection");
    subsectionTaskRepeatSelect.value = "custom";
    syncSubsectionRepeatLabel();
  } else {
    lastRepeatSelection = repeat;
    setRepeatFromSelection(repeat, "task");
    taskRepeatSelect.value = "custom";
    syncRepeatSelectLabel();
  }
  closeRepeatModal();
  repeatTarget = "task";
});
setRepeatFromSelection({ type: "none" });
horizonInput?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  const parsed = Number.isFinite(value) ? Math.max(1, Math.min(90, value)) : 14;
  event.target.value = parsed;
});
function closeSubsectionModal() {
  if (subsectionFormWrap) subsectionFormWrap.classList.add("hidden");
  editingSubsectionId = "";
  editingSectionId = "";
  subsectionRepeatSelection = { type: "none" };
  repeatTarget = "task";
}

subsectionModalCloseBtns.forEach((btn) => btn.addEventListener("click", closeSubsectionModal));

subsectionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const sectionId = subsectionSectionIdInput.value || "";
  const parentId = subsectionParentIdInput.value || "";
  const name = subsectionNameInput.value || "";
  if (!sectionId || !name) return;
  if (editingSubsectionId) {
    const subsections = { ...(settingsCache.subsections || {}) };
    const list = subsections[sectionId] || [];
    const idx = list.findIndex((s) => s.id === editingSubsectionId);
    if (idx >= 0) {
      const updated = {
        ...list[idx],
        name,
        parentId,
        template: {
          title: subsectionTaskTitleInput?.value || "",
          link: subsectionTaskLinkInput?.value || "",
          durationMin: Number(subsectionTaskDurationInput?.value) || 30,
          minBlockMin: Number(subsectionTaskMinBlockInput?.value) || 30,
          priority: Number(subsectionTaskPriorityInput?.value) || 3,
          deadline: subsectionTaskDeadlineInput?.value || "",
          repeat:
            subsectionRepeatSelection?.type && subsectionRepeatSelection.type !== "none"
              ? subsectionRepeatSelection
              : { type: "none" },
          startFrom: subsectionTaskStartFromInput?.value || "",
          timeMapIds: collectSelectedValues(subsectionTimeMapOptions) || []
        }
      };
      list[idx] = updated;
      subsections[sectionId] = list;
      settingsCache = { ...settingsCache, subsections };
      await saveSettings(settingsCache);
      renderTaskSectionOptions(sectionId);
      await loadTasks();
    }
  } else {
    await handleAddSubsection(sectionId, name, parentId);
  }
  closeSubsectionModal();
});
taskList.addEventListener("keydown", async (event) => {
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
taskFormWrap.addEventListener("click", (event) => {
  if (event.target === taskFormWrap) {
    closeTaskForm();
  }
});
taskModalCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskForm));
taskList.addEventListener("keydown", async (event) => {
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

hydrate();
enableDeadlinePicker();
