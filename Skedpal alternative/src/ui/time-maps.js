import { getAllTimeMaps, saveSettings, saveTimeMap, deleteTimeMap } from "../data/db.js";
import { dayOptions, domRefs } from "./constants.js";
import { normalizeTimeMap, uuid } from "./utils.js";
import { state } from "./state/page-state.js";

const {
  timeMapList,
  timeMapDayRows,
  timeMapFormWrap,
  timeMapToggle,
  taskTimeMapOptions,
  timeMapColorInput
} = domRefs;

export function renderDayRows(container, rules = []) {
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
    removeBtn.textContent = "x";
    removeBtn.title = "Remove block";
    removeBtn.className =
      "h-6 w-6 rounded-full border border-slate-700 text-xs font-semibold text-slate-200 hover:border-orange-400 hover:text-orange-300";
    removeBtn.addEventListener("click", () => {
      wrapper.remove();
    });

    wrapper.appendChild(start);
    wrapper.appendChild(document.createTextNode("to"));
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

export function renderTimeMaps(timeMaps) {
  timeMapList.innerHTML = "";
  if (timeMaps.length === 0) {
    timeMapList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No TimeMaps yet. Add at least one availability map.</div>';
    return;
  }
  timeMaps.forEach((tmRaw) => {
    const tm = normalizeTimeMap(tmRaw);
    const isDefault = state.settingsCache.defaultTimeMapId === tm.id;
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
            `${dayOptions.find((d) => d.value === Number(r.day))?.label || r.day}: ${r.startTime} - ${r.endTime}`
        )
        .join("; ") || "";
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

export async function loadTimeMaps() {
  const timeMapsRaw = await getAllTimeMaps();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  state.tasksTimeMapsCache = timeMaps;
  renderTimeMaps(timeMaps);
  renderTaskTimeMapOptions(timeMaps);
}

export function renderTaskTimeMapOptions(
  timeMaps,
  selected = [],
  defaultTimeMapId = state.settingsCache.defaultTimeMapId
) {
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

export function renderTimeMapOptions(
  container,
  selectedIds = [],
  timeMaps = state.tasksTimeMapsCache || []
) {
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

export function getTimeMapFormData() {
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

export async function handleTimeMapSubmit(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) return;
  await saveTimeMap(timeMap);
  resetTimeMapForm();
  closeTimeMapForm();
  await loadTimeMaps();
}

export async function handleSetDefaultTimeMap(event) {
  event.preventDefault();
  const timeMap = getTimeMapFormData();
  if (!timeMap) return;
  await saveTimeMap(timeMap);
  state.settingsCache = { ...state.settingsCache, defaultTimeMapId: timeMap.id };
  await saveSettings(state.settingsCache);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await Promise.all([loadTimeMaps(), loadTasks()]);
}

export function resetTimeMapForm() {
  document.getElementById("timemap-id").value = "";
  document.getElementById("timemap-name").value = "";
  timeMapColorInput.value = "#22c55e";
  renderDayRows(timeMapDayRows);
}

export function openTimeMapForm() {
  timeMapFormWrap.classList.remove("hidden");
  timeMapToggle.textContent = "Hide TimeMap form";
}

export function closeTimeMapForm() {
  timeMapFormWrap.classList.add("hidden");
  timeMapToggle.textContent = "Show TimeMap form";
}

export async function handleTimeMapListClick(event, timeMaps) {
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
      const { switchView } = await import("./navigation.js");
      switchView("settings");
    }
  } else if (deleteId) {
    deleteTimeMap(deleteId).then(async () => {
      const { loadTasks } = await import("./tasks/tasks-actions.js");
      await Promise.all([loadTimeMaps(), loadTasks()]);
    });
  }
}
