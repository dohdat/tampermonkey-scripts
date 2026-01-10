import {
  getAllTasks,
  getAllTimeMaps,
  saveSettings,
  saveTask,
  saveTimeMap,
  deleteTimeMap
} from "../data/db.js";
import { dayOptions, domRefs } from "./constants.js";
import { normalizeTimeMap, resolveTimeMapIdsAfterDelete, uuid } from "./utils.js";
import { state } from "./state/page-state.js";
import { themeColors } from "./theme.js";
import { pickTimeMapColor } from "./time-map-colors.js";

const getTimeMapList = () => domRefs.timeMapList;
const getTimeMapDayRows = () => domRefs.timeMapDayRows;
const getTimeMapFormWrap = () => domRefs.timeMapFormWrap;
const getTimeMapToggle = () => domRefs.timeMapToggle;
const getTaskTimeMapOptions = () => domRefs.taskTimeMapOptions;
const getTimeMapColorInput = () => domRefs.timeMapColorInput;
const getTimeMapColorSwatch = () => domRefs.timeMapColorSwatch;
const getTimeMapDaySelect = () => domRefs.timeMapDaySelect;
const getTimeMapDayAdd = () => domRefs.timeMapDayAdd;

function syncTimeMapColorSwatch(color) {
  const swatch = getTimeMapColorSwatch();
  if (!swatch) {return;}
  swatch.style.backgroundColor = color || themeColors.green500;
  swatch.style.borderColor = color || themeColors.slate500;
}

function handleRemoveDayClick(event) {
  const row = event?.currentTarget?.closest?.("[data-day-row]");
  if (!row) {return;}
  row.remove();
  syncTimeMapDaySelect();
}

function handleRemoveBlockClick(event) {
  const blockRow = event?.currentTarget?.closest?.("[data-block]");
  if (!blockRow) {return;}
  blockRow.remove();
}

function handleAddBlockClick(event) {
  const btn = event?.currentTarget;
  const day = btn?.dataset?.day;
  if (!day) {return;}
  const row = btn.closest?.("[data-day-row]");
  const blocksContainer = row?.querySelector?.(`[data-blocks-for="${day}"]`);
  if (!blocksContainer) {return;}
  blocksContainer.appendChild(createTimeBlock(day));
}

function handleTimeMapDayAddClick() {
  const timeMapDaySelect = getTimeMapDaySelect();
  if (!timeMapDaySelect) {return;}
  addTimeMapDay(timeMapDaySelect.value);
}

function createDayHeader(day) {
  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", "timemap-day-header");
  const label = document.createElement("span");
  label.className = "text-sm font-semibold text-slate-100";
  label.textContent = dayOptions.find((opt) => opt.value === Number(day))?.label || String(day);
  label.setAttribute("data-test-skedpal", "timemap-day-label");
  const removeDayBtn = document.createElement("button");
  removeDayBtn.type = "button";
  removeDayBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-orange-400 hover:text-orange-300";
  removeDayBtn.textContent = "Remove";
  removeDayBtn.setAttribute("data-test-skedpal", "timemap-day-remove");
  removeDayBtn.addEventListener("click", handleRemoveDayClick);
  header.appendChild(label);
  header.appendChild(removeDayBtn);
  return header;
}

function createTimeBlock(day, block = { startTime: "09:00", endTime: "12:00" }) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "flex flex-wrap items-center gap-2 rounded-lg border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200";
  wrapper.dataset.block = day;
  wrapper.setAttribute("data-test-skedpal", "timemap-block");
  const start = document.createElement("input");
  start.type = "time";
  start.value = block.startTime || "09:00";
  start.className =
    "w-24 rounded-lg border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-lime-400 focus:outline-none";
  start.dataset.startFor = day;
  start.setAttribute("data-test-skedpal", "timemap-block-start");
  const end = document.createElement("input");
  end.type = "time";
  end.value = block.endTime || "12:00";
  end.className =
    "w-24 rounded-lg border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-lime-400 focus:outline-none";
  end.dataset.endFor = day;
  end.setAttribute("data-test-skedpal", "timemap-block-end");
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.title = "Remove block";
  removeBtn.className = "modal-close-btn modal-close-btn--sm";
  removeBtn.setAttribute("aria-label", "Remove block");
  removeBtn.innerHTML = `
      <svg
        class="modal-close-icon modal-close-icon--sm"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        data-test-skedpal="modal-close-icon"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18 17.94 6M18 18 6.06 6"
        ></path>
      </svg>
      <span class="sr-only" data-test-skedpal="modal-close-label">Remove block</span>
    `;
  removeBtn.setAttribute("data-test-skedpal", "timemap-block-remove");
  removeBtn.addEventListener("click", handleRemoveBlockClick);
  wrapper.appendChild(start);
  wrapper.appendChild(document.createTextNode("to"));
  wrapper.appendChild(end);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

function createBlocksContainer(day, blocks) {
  const blocksContainer = document.createElement("div");
  blocksContainer.className = "mt-2 flex flex-col gap-2";
  blocksContainer.dataset.blocksFor = day;
  blocksContainer.setAttribute("data-test-skedpal", "timemap-blocks");
  if (blocks.length > 0) {
    blocks.forEach((block) => blocksContainer.appendChild(createTimeBlock(day, block)));
  } else {
    blocksContainer.appendChild(createTimeBlock(day));
  }
  return blocksContainer;
}

function createAddBlockButton(day) {
  const addBlockBtn = document.createElement("button");
  addBlockBtn.type = "button";
  addBlockBtn.textContent = "Add time range";
  addBlockBtn.className =
    "mt-2 w-fit rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  addBlockBtn.setAttribute("data-test-skedpal", "timemap-block-add");
  addBlockBtn.dataset.day = String(day);
  addBlockBtn.addEventListener("click", handleAddBlockClick);
  return addBlockBtn;
}

function createDayRow(day, blocks = []) {
  const row = document.createElement("div");
  row.dataset.dayRow = String(day);
  row.className = "rounded-xl border-slate-700 bg-slate-900/60 p-3";
  row.setAttribute("data-test-skedpal", "timemap-day-row");
  const header = createDayHeader(day);
  const blocksContainer = createBlocksContainer(day, blocks);
  const addBlockBtn = createAddBlockButton(day);
  row.appendChild(header);
  row.appendChild(blocksContainer);
  row.appendChild(addBlockBtn);
  return row;
}

function sortDayRows(container) {
  const rows = [...container.children].filter((row) => row.dataset?.dayRow !== undefined);
  rows.sort((a, b) => Number(a.dataset.dayRow) - Number(b.dataset.dayRow));
  if (typeof container.removeChild === "function") {
    rows.forEach((row) => container.appendChild(row));
    return;
  }
  container.children = [];
  rows.forEach((row) => container.appendChild(row));
}

function syncTimeMapDaySelect() {
  const select = getTimeMapDaySelect();
  const rows = getTimeMapDayRows();
  if (!select || !rows) {return;}
  const used = new Set(
    [...rows.children]
      .map((row) => Number(row.dataset?.dayRow))
      .filter((day) => Number.isFinite(day))
  );
  const currentValue = select.value;
  select.innerHTML = "";
  dayOptions.forEach((day) => {
    if (used.has(day.value)) {return;}
    const option = document.createElement("option");
    option.value = String(day.value);
    option.textContent = day.label;
    select.appendChild(option);
  });
  if (select.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "All days added";
    option.disabled = true;
    select.appendChild(option);
    select.value = "";
    return;
  }
  const stillAvailable = [...select.options].some((option) => option.value === currentValue);
  if (stillAvailable) {
    select.value = currentValue;
    return;
  }
  select.selectedIndex = 0;
}

export function renderDayRows(container, rules = []) {
  container.innerHTML = "";
  const rulesMap = new Map();
  rules.forEach((r) => {
    const day = Number(r.day);
    if (!rulesMap.has(day)) {rulesMap.set(day, []);}
    rulesMap.get(day).push({ ...r, day });
  });
  const sortedDays = [...rulesMap.keys()].sort((a, b) => a - b);
  sortedDays.forEach((day) => {
    container.appendChild(createDayRow(day, rulesMap.get(day)));
  });
  syncTimeMapDaySelect();
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
    card.className = "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow";
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
      <h3 class="text-base font-semibold flex flex-wrap items-center gap-2">
        <span>${tm.name}</span>
        ${isDefault ? '<span class="rounded-full border-lime-400/60 bg-lime-400/10 px-2 py-1 text-xs font-semibold text-lime-300">Default</span>' : ""}
        <span class="rounded-full border-slate-700 bg-slate-800/70 px-2 py-1 text-xs font-semibold text-slate-200" data-test-skedpal="timemap-task-count">${taskCount}</span>
      </h3>
      <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">${rulesText}</div>
      <div class="mt-3 flex gap-2">
        <button style="background:${editBtnBackground};border-color:${editBtnBorder};color:${editBtnColor}" class="rounded-lg px-3 py-1 text-xs font-semibold" data-edit="${tm.id}">Edit</button>
        <button class="rounded-lg bg-orange-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-orange-400" data-delete="${tm.id}" data-test-skedpal="timemap-delete">Delete</button>
      </div>
    `;
    timeMapList.appendChild(card);
  });
}

export async function loadTimeMaps() {
  const [timeMapsRaw, tasks] = await Promise.all([getAllTimeMaps(), getAllTasks()]);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  const usageCounts = new Map();
  (tasks || []).forEach((task) => {
    const ids = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
    ids.forEach((id) => {
      usageCounts.set(id, (usageCounts.get(id) || 0) + 1);
    });
  });
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
    const hasExplicitSelection = Array.isArray(selected) && selected.length > 0;
    input.checked = hasExplicitSelection ? selected.includes(tm.id) : tm.id === defaultTimeMapId;
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
}

export function renderTimeMapOptions(
  container,
  selectedIds = [],
  timeMaps = state.tasksTimeMapsCache || []
) {
  if (!container) {return;}
  container.innerHTML = "";
  const normalized = timeMaps.map(normalizeTimeMap);
  normalized.forEach((tm) => {
    const label = document.createElement("label");
    label.className =
      "flex items-center gap-2 rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-200";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tm.id;
    checkbox.checked = selectedIds.includes(tm.id);
    checkbox.className = "h-4 w-4 rounded border-slate-700 bg-slate-900 text-lime-400";
    const colorDot = document.createElement("span");
    colorDot.className = "h-3 w-3 rounded-full";
    colorDot.style.backgroundColor = tm.color || themeColors.green500;
    const name = document.createElement("span");
    name.textContent = tm.name || "Unnamed TimeMap";
    label.appendChild(checkbox);
    label.appendChild(colorDot);
    label.appendChild(name);
    container.appendChild(label);
  });
}

export function collectSelectedValues(container) {
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
  timeMapDayRows.appendChild(createDayRow(parsedDay, []));
  sortDayRows(timeMapDayRows);
  syncTimeMapDaySelect();
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
    renderDayRows(timeMapDayRows, []);
  }
}

export function openTimeMapForm() {
  const timeMapFormWrap = getTimeMapFormWrap();
  const timeMapToggle = getTimeMapToggle();
  if (timeMapFormWrap) {
    timeMapFormWrap.classList.remove("hidden");
  }
  if (timeMapToggle) {
    timeMapToggle.textContent = "Hide TimeMap form";
  }
}

export function closeTimeMapForm() {
  const timeMapFormWrap = getTimeMapFormWrap();
  const timeMapToggle = getTimeMapToggle();
  if (timeMapFormWrap) {
    timeMapFormWrap.classList.add("hidden");
  }
  if (timeMapToggle) {
    timeMapToggle.textContent = "Show TimeMap form";
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

const timeMapDayAdd = getTimeMapDayAdd();
const timeMapDaySelect = getTimeMapDaySelect();
if (timeMapDayAdd && typeof timeMapDayAdd.addEventListener === "function" && timeMapDaySelect) {
  timeMapDayAdd.addEventListener("click", handleTimeMapDayAddClick);
}
const timeMapColorInput = getTimeMapColorInput();
if (timeMapColorInput) {
  const current = timeMapColorInput.value || "";
  if (!current || current.toLowerCase() === "#000000") {
    const nextColor = pickTimeMapColor(state.tasksTimeMapsCache || [], uuid());
    timeMapColorInput.value = nextColor;
  }
  syncTimeMapColorSwatch(timeMapColorInput.value);
}
