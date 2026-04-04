import {
  getAllTasks,
  getAllTimeMaps,
  saveSettings,
  saveTask,
  saveTimeMap,
  deleteTimeMap
} from "../data/db.js";
import { dayOptions, domRefs, TIME_MAP_DEFAULT_END, TIME_MAP_DEFAULT_START } from "./constants.js";
import { isExternalCalendarTimeMapId, normalizeTimeMap, resolveTimeMapIdsAfterDelete, uuid } from "./utils.js";
import { state } from "./state/page-state.js";
import { themeColors } from "./theme.js";
import { pickTimeMapColor } from "./time-map-colors.js";
import { appendExternalCalendarOptions } from "./time-map-external-options.js";
import {
  buildDefaultTimeMapRules,
  getDuplicatedRulesForAllDays,
  getTimeMapDayRowsList,
  sortTimeMapDayRows,
  syncTimeMapDaySelectOptions
} from "./time-map-day-utils.js";
import {
  createTimeBlock,
  minutesToTimeString,
  normalizeTimeRange,
  setupTimeMapTimelineInteractions,
  syncTimeMapTimelineHeader
} from "./time-map-timeline.js";
import { createTimeMapDayRow } from "./time-map-day-row.js";
import { initTimeMapModalInteractions, showTimeMapModal, hideTimeMapModal } from "./time-map-modal.js";
const getTimeMapList = () => domRefs.timeMapList;
const getTimeMapDayRows = () => domRefs.timeMapDayRows;
const getTimeMapModal = () => domRefs.timeMapModal;
const getTimeMapFormWrap = () => domRefs.timeMapFormWrap;
const getTimeMapToggle = () => domRefs.timeMapToggle;
const getTaskTimeMapOptions = () => domRefs.taskTimeMapOptions;
const getTimeMapColorInput = () => domRefs.timeMapColorInput;
const getTimeMapColorSwatch = () => domRefs.timeMapColorSwatch;
const getTimeMapDaySelect = () => domRefs.timeMapDaySelect;
const getTimeMapDayAdd = () => domRefs.timeMapDayAdd;
const getTimeMapSectionContent = () => domRefs.timeMapSectionContent;
const getTimeMapSectionToggleBtn = () => domRefs.timeMapSectionToggleBtn;

function syncTimeMapColorSwatch(color) {
  const swatch = getTimeMapColorSwatch();
  if (!swatch) {return;}
  swatch.style.backgroundColor = color || themeColors.green500;
  swatch.style.borderColor = color || themeColors.slate500;
}
function handleRemoveDayClick(trigger) {
  const row = trigger?.closest?.("[data-day-row]");
  if (!row) {return;}
  row.remove();
  syncTimeMapDaySelectOptions(getTimeMapDaySelect(), getTimeMapDayRows());
}
function handleRemoveBlockClick(trigger) {
  const blockRow = trigger?.closest?.("[data-block]");
  if (!blockRow) {return;}
  blockRow.remove();
}
function handleAddBlockClick(trigger) {
  const btn = trigger;
  const day = btn?.dataset?.day;
  if (!day) {return;}
  const row = btn.closest?.("[data-day-row]");
  const timeline = row?.querySelector?.(`[data-timeline="${day}"]`);
  if (!timeline) {return;}
  timeline.appendChild(createTimeBlock(day));
}
function handleTimeMapDayAddClick() {
  const timeMapDaySelect = getTimeMapDaySelect();
  if (!timeMapDaySelect) {return;}
  addTimeMapDay(timeMapDaySelect.value);
}
function duplicateTimeMapDayRangesAcrossAllDays(dayRow) {
  if (!dayRow) {return;}
  const timeMapDayRows = getTimeMapDayRows();
  if (!timeMapDayRows) {return;}
  const sourceRules = collectTimeMapRules({ querySelectorAll: () => [dayRow] });
  if (!sourceRules.length) {return;}
  const duplicatedRules = dayOptions.flatMap((day) =>
    sourceRules.map((rule) => ({
      day: day.value,
      startTime: rule.startTime,
      endTime: rule.endTime
    }))
  );
  renderDayRows(timeMapDayRows, duplicatedRules);
}
function handleTimeMapDayRowsClick(event) {
  const target =
    event?.target && typeof Element !== "undefined" && event.target instanceof Element
      ? event.target
      : null;
  if (!target) {return;}
  const duplicateDayBtn = target.closest?.("[data-day-duplicate]");
  if (duplicateDayBtn) {
    const dayRow = duplicateDayBtn.closest?.("[data-day-row]");
    duplicateTimeMapDayRangesAcrossAllDays(dayRow);
    return;
  }
  const removeDayBtn = target.closest?.("[data-day-remove]");
  if (removeDayBtn) {
    handleRemoveDayClick(removeDayBtn);
    return;
  }
  const addBlockBtn = target.closest?.("[data-block-add]");
  if (addBlockBtn) {
    handleAddBlockClick(addBlockBtn);
    return;
  }
  const removeBlockBtn = target.closest?.("[data-block-remove]");
  if (removeBlockBtn) {
    handleRemoveBlockClick(removeBlockBtn);
  }
}
export function renderDayRows(container, rules = []) {
  container.innerHTML = "";
  syncTimeMapTimelineHeader();
  const rulesMap = new Map();
  rules.forEach((r) => {
    const day = Number(r.day);
    if (!rulesMap.has(day)) {rulesMap.set(day, []);}
    rulesMap.get(day).push({ ...r, day });
  });
  const sortedDays = [...rulesMap.keys()].sort((a, b) => a - b);
  sortedDays.forEach((day) => {
    container.appendChild(createTimeMapDayRow(day, rulesMap.get(day)));
  });
  syncTimeMapDaySelectOptions(getTimeMapDaySelect(), getTimeMapDayRows());
}
export function renderTimeMaps(timeMaps) {
  const timeMapList = getTimeMapList();
  if (!timeMapList) {return;}
  timeMapList.innerHTML = "";
  if (timeMaps.length === 0) {
    timeMapList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No TimeMaps yet. Add at least one availability map.</div>';
    return;
  }
  const usageCounts = timeMaps.reduce((map, tm) => {
    map.set(tm.id, Number(tm.taskCount) || 0);
    return map;
  }, new Map());
  timeMaps.forEach((tmRaw) => {
    const tm = normalizeTimeMap(tmRaw);
    const taskCount = usageCounts.get(tm.id) || 0;
    const isDefault = state.settingsCache.defaultTimeMapId === tm.id;
    const editBtnBackground = tm.color || "transparent";
    const editBtnBorder = tm.color || themeColors.slate500;
    const editBtnColor = tm.color ? themeColors.slate800 : themeColors.slate100;
    const card = document.createElement("div");
    card.className = "rounded-xl border-slate-800 bg-slate-900/60 px-3 py-2 shadow";
    card.setAttribute("data-test-skedpal", "timemap-card");
    if (tm.color) {
      card.style.borderColor = tm.color;
      card.style.backgroundColor = `${tm.color}1a`;
    }
    const rulesText =
      tm.rules
        ?.map(
          (r) =>
            `${dayOptions.find((d) => d.value === Number(r.day))?.label || r.day}: ${r.startTime} - ${r.endTime}`
        )
        .join("; ") || "";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3" data-test-skedpal="timemap-card-header">
        <div class="min-w-0" data-test-skedpal="timemap-title-block">
          <div class="flex flex-wrap items-center gap-1.5" data-test-skedpal="timemap-title-row">
            <span class="truncate text-sm font-semibold text-slate-100" data-test-skedpal="timemap-name">${tm.name}</span>
            ${
              isDefault
                ? '<span class="rounded-full border-lime-400/60 bg-lime-400/10 px-2 py-0.5 text-[10px] font-semibold text-lime-300" data-test-skedpal="timemap-default">Default</span>'
                : ""
            }
            <span class="rounded-full border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200" data-test-skedpal="timemap-task-count">${taskCount}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1" data-test-skedpal="timemap-actions">
          <button style="background:${editBtnBackground};border-color:${editBtnBorder};color:${editBtnColor}" class="rounded-md px-2 py-0.5 text-[11px] font-semibold" data-edit="${tm.id}" data-test-skedpal="timemap-edit">Edit</button>
          <button class="rounded-md border border-orange-400/60 px-2 py-0.5 text-[11px] font-semibold text-orange-300 hover:border-orange-400" data-delete="${tm.id}" data-test-skedpal="timemap-delete">Delete</button>
        </div>
      </div>
      <div class="mt-1 truncate text-[11px] text-slate-400" data-test-skedpal="timemap-rules">
        ${rulesText || "No time ranges yet."}
      </div>
    `;
    timeMapList.appendChild(card);
  });
}

export function getTimeMapUsageCounts(tasks) {
  const usageCounts = new Map();
  (tasks || []).forEach((task) => {
    if (task?.subtaskParentId) {return;}
    const ids = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
    ids.forEach((id) => {
      if (isExternalCalendarTimeMapId(id)) {return;}
      usageCounts.set(id, (usageCounts.get(id) || 0) + 1);
    });
  });
  return usageCounts;
}
export async function loadTimeMaps() {
  const [timeMapsRaw, tasks] = await Promise.all([getAllTimeMaps(), getAllTasks()]);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  const usageCounts = getTimeMapUsageCounts(tasks);
  const timeMapsWithCounts = timeMaps.map((tm) => ({
    ...tm,
    taskCount: usageCounts.get(tm.id) || 0
  }));
  timeMapsWithCounts.sort((a, b) => {
    if (b.taskCount !== a.taskCount) {return b.taskCount - a.taskCount;}
    return (a.name || "").localeCompare(b.name || "");
  });
  state.tasksTimeMapsCache = timeMaps;
  renderTimeMaps(timeMapsWithCounts);
  renderTaskTimeMapOptions(timeMaps);
}

export function renderTaskTimeMapOptions(
  timeMaps,
  selected = [],
  defaultTimeMapId = state.settingsCache.defaultTimeMapId
) {
  const taskTimeMapOptions = getTaskTimeMapOptions();
  if (!taskTimeMapOptions) {return;}
  taskTimeMapOptions.innerHTML = "";
  if (timeMaps.length === 0) {
    taskTimeMapOptions.innerHTML = `<span class="text-xs text-slate-400">Create TimeMaps first.</span>`;
    return;
  }
  const selectedIds = new Set(Array.isArray(selected) ? selected : []);
  const hasExplicitSelection = Array.isArray(selected) && selected.length > 0;
  timeMaps.forEach((tmRaw) => {
    const tm = normalizeTimeMap(tmRaw);
    const id = `task-tm-${tm.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.className =
      "flex items-center gap-2 rounded-lg border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tm.id;
    input.id = id;
    input.checked = hasExplicitSelection ? selectedIds.has(tm.id) : tm.id === defaultTimeMapId;
    input.className = "h-4 w-4 rounded border-slate-600 bg-slate-900 text-lime-400";
    const text = document.createElement("span");
    text.textContent = tm.name;
    if (tm.color) {
      text.style.color = tm.color;
    }
    const swatch = document.createElement("span");
    swatch.className = "h-3 w-3 rounded-full border-slate-700";
    swatch.style.backgroundColor = tm.color || themeColors.slate100;
    swatch.style.borderColor = tm.color || themeColors.slate500;
    label.appendChild(input);
    label.appendChild(swatch);
    label.appendChild(text);
    taskTimeMapOptions.appendChild(label);
  });
  appendExternalCalendarOptions(taskTimeMapOptions, selected);
}

export function renderTimeMapOptions(
  container,
  selectedIds = [],
  timeMaps = state.tasksTimeMapsCache || []
) {
  if (!container) {return;}
  container.innerHTML = "";
  const normalized = timeMaps.map(normalizeTimeMap);
  const selection = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  normalized.forEach((tm) => {
    const label = document.createElement("label");
    label.className =
      "flex items-center gap-2 rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-200";
    label.setAttribute("data-test-skedpal", "timemap-option");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tm.id;
    checkbox.checked = selection.has(tm.id);
    checkbox.className = "h-4 w-4 rounded border-slate-700 bg-slate-900 text-lime-400";
    checkbox.setAttribute("data-test-skedpal", "timemap-option-checkbox");
    const colorDot = document.createElement("span");
    colorDot.className = "h-3 w-3 rounded-full";
    colorDot.setAttribute("data-test-skedpal", "timemap-option-color");
    colorDot.style.backgroundColor = tm.color || themeColors.green500;
    const name = document.createElement("span");
    name.textContent = tm.name || "Unnamed TimeMap";
    name.setAttribute("data-test-skedpal", "timemap-option-label");
    label.appendChild(checkbox);
    label.appendChild(colorDot);
    label.appendChild(name);
    container.appendChild(label);
  });
  appendExternalCalendarOptions(container, selectedIds);
}

export function collectSelectedValues(container) {
  if (!container?.querySelectorAll) {return [];}
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map((el) => {
    const val = el.value;
    return /^\d+$/.test(val) ? Number(val) : val;
  });
}

export function collectTimeMapRules(container) {
  const rules = [];
  container.querySelectorAll("[data-day-row]").forEach((row) => {
    const day = Number(row.dataset.dayRow);
    row.querySelectorAll("[data-block]").forEach((blockRow) => {
      const startMinutes = Number(blockRow.dataset.startMinute);
      const endMinutes = Number(blockRow.dataset.endMinute);
      let startTime = "";
      let endTime = "";
      if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes)) {
        if (startMinutes >= endMinutes) {return;}
        const normalized = normalizeTimeRange(startMinutes, endMinutes);
        startTime = minutesToTimeString(normalized.start);
        endTime = minutesToTimeString(normalized.end);
      } else {
        const start = blockRow.querySelector("input[data-start-for]");
        const end = blockRow.querySelector("input[data-end-for]");
        startTime = start?.value || TIME_MAP_DEFAULT_START;
        endTime = end?.value || TIME_MAP_DEFAULT_END;
      }
      if (startTime && endTime && startTime < endTime) {
        rules.push({ day, startTime, endTime });
      }
    });
  });
  return rules.sort((a, b) => a.day - b.day);
}

export function getTimeMapFormData() {
  const id = document.getElementById("timemap-id").value || uuid();
  const name = document.getElementById("timemap-name").value.trim();
  const timeMapColorInput = getTimeMapColorInput();
  const timeMapDayRows = getTimeMapDayRows();
  if (!timeMapColorInput || !timeMapDayRows) {return null;}
  let color = (timeMapColorInput.value || "").trim();
  const isPlaceholder = color.toLowerCase() === "#000000";
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
  if (!color || isPlaceholder) {
    color = pickTimeMapColor(state.tasksTimeMapsCache || [], `${id}:${name}`);
    timeMapColorInput.value = color;
  }
  syncTimeMapColorSwatch(color);
  return { id, name, rules, color };
}

export function addTimeMapDay(day) {
  const timeMapDayRows = getTimeMapDayRows();
  if (!timeMapDayRows) {return;}
  const parsedDay = Number(day);
  if (!Number.isFinite(parsedDay)) {return;}
  const exists = [...timeMapDayRows.children].some(
    (row) => String(row.dataset?.dayRow) === String(parsedDay)
  );
  if (exists) {return;}
  timeMapDayRows.appendChild(createTimeMapDayRow(parsedDay, []));
  sortTimeMapDayRows(timeMapDayRows);
  syncTimeMapDaySelectOptions(getTimeMapDaySelect(), getTimeMapDayRows());
}

export function duplicateCurrentTimeMapRangesAcrossAllDays() {
  const timeMapDayRows = getTimeMapDayRows();
  if (!timeMapDayRows) {return;}
  const activeElement = typeof document !== "undefined" ? document.activeElement : null;
  const duplicatedRules = getDuplicatedRulesForAllDays(
    timeMapDayRows,
    activeElement,
    collectTimeMapRules
  );
  if (!duplicatedRules.length) {return;}
  renderDayRows(timeMapDayRows, duplicatedRules);
}

export async function handleTimeMapSubmit(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) {return;}
  await saveTimeMap(timeMap);
  resetTimeMapForm();
  closeTimeMapForm();
  await loadTimeMaps();
}

export async function handleSetDefaultTimeMap(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) {return;}
  await saveTimeMap(timeMap);
  state.settingsCache = { ...state.settingsCache, defaultTimeMapId: timeMap.id };
  await saveSettings(state.settingsCache);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await Promise.all([loadTimeMaps(), loadTasks()]);
}

export function resetTimeMapForm() {
  document.getElementById("timemap-id").value = "";
  document.getElementById("timemap-name").value = "";
  const timeMapColorInput = getTimeMapColorInput();
  const timeMapDayRows = getTimeMapDayRows();
  if (timeMapColorInput) {
    const nextColor = pickTimeMapColor(state.tasksTimeMapsCache || [], uuid());
    timeMapColorInput.value = nextColor;
    syncTimeMapColorSwatch(nextColor);
  }
  if (timeMapDayRows) {
    renderDayRows(timeMapDayRows, buildDefaultTimeMapRules());
  }
}

function registerClickListener(target, handler, cleanupFns) {
  if (!target) {return;}
  target.addEventListener("click", handler);
  cleanupFns.push(() => target.removeEventListener("click", handler));
}

function setupTimeMapDayRowsInteractions(timeMapDayRows, cleanupFns) {
  if (!timeMapDayRows) {return;}
  timeMapDayRows.addEventListener("click", handleTimeMapDayRowsClick);
  cleanupFns.push(() => timeMapDayRows.removeEventListener("click", handleTimeMapDayRowsClick));
  cleanupFns.push(setupTimeMapTimelineInteractions(timeMapDayRows));
}

function dismissTimeMapForm() {
  resetTimeMapForm();
  closeTimeMapForm();
}

function ensureTimeMapColorInitialized(timeMapColorInput) {
  if (!timeMapColorInput) {return;}
  const current = timeMapColorInput.value || "";
  if (!current || current.toLowerCase() === "#000000") {
    const nextColor = pickTimeMapColor(state.tasksTimeMapsCache || [], uuid());
    timeMapColorInput.value = nextColor;
  }
  syncTimeMapColorSwatch(timeMapColorInput.value);
}

function ensureDefaultTimeMapDayRows(timeMapDayRows) {
  if (!timeMapDayRows) {return;}
  if (getTimeMapDayRowsList(timeMapDayRows).length !== 0) {return;}
  renderDayRows(timeMapDayRows, buildDefaultTimeMapRules());
}

function ensureTimeMapSectionExpanded() {
  const timeMapSectionContent = getTimeMapSectionContent();
  const timeMapSectionToggleBtn = getTimeMapSectionToggleBtn();
  if (!timeMapSectionContent) {return;}
  timeMapSectionContent.classList.remove("hidden");
  if (!timeMapSectionToggleBtn) {return;}
  timeMapSectionToggleBtn.textContent = "Collapse";
  timeMapSectionToggleBtn.setAttribute("aria-expanded", "true");
  timeMapSectionToggleBtn.dataset.collapsed = "false";
}

export function initTimeMapFormInteractions() {
  const cleanupFns = [];
  const timeMapDayAdd = getTimeMapDayAdd();
  const timeMapDayRows = getTimeMapDayRows();
  registerClickListener(timeMapDayAdd, handleTimeMapDayAddClick, cleanupFns);
  setupTimeMapDayRowsInteractions(timeMapDayRows, cleanupFns);
  cleanupFns.push(initTimeMapModalInteractions({ getModal: getTimeMapModal, onDismiss: dismissTimeMapForm }));
  ensureTimeMapColorInitialized(getTimeMapColorInput());
  ensureDefaultTimeMapDayRows(timeMapDayRows);
  syncTimeMapTimelineHeader();
  return () => {
    cleanupFns.forEach((cleanup) => cleanup?.());
  };
}

export function openTimeMapForm() {
  const timeMapModal = getTimeMapModal();
  const timeMapFormWrap = getTimeMapFormWrap();
  const timeMapToggle = getTimeMapToggle();
  ensureDefaultTimeMapDayRows(getTimeMapDayRows());
  ensureTimeMapSectionExpanded();
  showTimeMapModal(timeMapModal, timeMapFormWrap);
  if (timeMapToggle) {
    timeMapToggle.textContent = "New TimeMap";
  }
}

export function closeTimeMapForm() {
  const timeMapModal = getTimeMapModal();
  const timeMapFormWrap = getTimeMapFormWrap();
  const timeMapToggle = getTimeMapToggle();
  hideTimeMapModal(timeMapModal, timeMapFormWrap);
  if (timeMapToggle) {
    timeMapToggle.textContent = "New TimeMap";
  }
}

async function handleTimeMapEdit(editId, timeMaps) {
  const tm = timeMaps.map(normalizeTimeMap).find((t) => t.id === editId);
  if (!tm) {return;}
  document.getElementById("timemap-id").value = tm.id;
  document.getElementById("timemap-name").value = tm.name;
  const timeMapColorInput = getTimeMapColorInput();
  const timeMapDayRows = getTimeMapDayRows();
  if (timeMapColorInput) {
    const color = tm.color || pickTimeMapColor(timeMaps, `${tm.id}:${tm.name}`);
    timeMapColorInput.value = color;
    syncTimeMapColorSwatch(color);
  }
  if (timeMapDayRows) {
    renderDayRows(timeMapDayRows, tm.rules);
  }
  openTimeMapForm();
  const { switchView } = await import("./navigation.js");
  switchView("settings");
}

async function handleTimeMapDelete(deleteId) {
  const confirmRemove = confirm("Delete this TimeMap? Tasks using it will be updated.");
  if (!confirmRemove) {return;}
  await deleteTimeMap(deleteId);
  const timeMapsRaw = await getAllTimeMaps();
  const remainingTimeMaps = timeMapsRaw.map(normalizeTimeMap);
  const remainingIds = new Set(remainingTimeMaps.map((tm) => tm.id));
  let nextSettings = { ...state.settingsCache };
  let settingsChanged = false;
  if (nextSettings.defaultTimeMapId === deleteId) {
    nextSettings = {
      ...nextSettings,
      defaultTimeMapId: remainingTimeMaps[0]?.id || null
    };
    settingsChanged = true;
  }
  const subsections = { ...(nextSettings.subsections || {}) };
  Object.entries(subsections).forEach(([sectionId, list]) => {
    const updatedList = (list || []).map((sub) => {
      if (!Array.isArray(sub?.template?.timeMapIds)) {return sub;}
      const filtered = sub.template.timeMapIds.filter((id) => remainingIds.has(id));
      if (filtered.length === sub.template.timeMapIds.length) {return sub;}
      settingsChanged = true;
      return {
        ...sub,
        template: {
          ...sub.template,
          timeMapIds: filtered
        }
      };
    });
    subsections[sectionId] = updatedList;
  });
  if (settingsChanged) {
    nextSettings = { ...nextSettings, subsections };
    state.settingsCache = nextSettings;
    await saveSettings(nextSettings);
  }
  const tasks = await getAllTasks();
  const updates = tasks
    .filter((task) => Array.isArray(task.timeMapIds) && task.timeMapIds.includes(deleteId))
    .map((task) => {
      const timeMapIds = resolveTimeMapIdsAfterDelete(
        task,
        nextSettings,
        remainingTimeMaps,
        deleteId
      );
      if (timeMapIds.length === task.timeMapIds.length && timeMapIds.every((id) => task.timeMapIds.includes(id))) {
        return null;
      }
      return saveTask({ ...task, timeMapIds });
    })
    .filter(Boolean);
  if (updates.length) {
    await Promise.all(updates);
  }
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await Promise.all([loadTimeMaps(), loadTasks()]);
}

export async function handleTimeMapListClick(event, timeMaps) {
  const btn = event.target.closest("button");
  if (!btn) {return;}
  const editId = btn.dataset.edit;
  const deleteId = btn.dataset.delete;
  if (editId) {
    await handleTimeMapEdit(editId, timeMaps);
  } else if (deleteId) {
    await handleTimeMapDelete(deleteId);
  }
}
