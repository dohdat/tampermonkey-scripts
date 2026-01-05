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

const dayOptions = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];

const views = [...document.querySelectorAll(".view")];
const navButtons = [...document.querySelectorAll(".nav-btn")];
const taskList = document.getElementById("task-list");
const timeMapList = document.getElementById("timemap-list");
const timeMapDayRows = document.getElementById("timemap-day-rows");
const timeMapFormWrap = document.getElementById("timemap-form-wrap");
const timeMapToggle = document.getElementById("timemap-toggle");
const taskFormWrap = document.getElementById("task-form-wrap");
const taskToggle = document.getElementById("task-toggle");
const taskModalCloseButtons = [...document.querySelectorAll("[data-task-modal-close]")];
const taskTimeMapOptions = document.getElementById("task-timemap-options");
const taskDeadlineInput = document.getElementById("task-deadline");
const taskLinkInput = document.getElementById("task-link");
const taskSectionSelect = document.getElementById("task-section");
const taskSubsectionSelect = document.getElementById("task-subsection");
const sectionList = document.getElementById("section-list");
const sectionInput = document.getElementById("section-new-name");
const sectionAddBtn = document.getElementById("section-add");
const sectionFormRow = document.getElementById("section-form-row");
const sectionFormToggle = document.getElementById("section-form-toggle");
const timeMapColorInput = document.getElementById("timemap-color");
const scheduleStatus = document.getElementById("schedule-status");
const rescheduleButtons = [...document.querySelectorAll("[data-reschedule-btn]")];
const scheduleSummary = document.getElementById("scheduled-summary");
const horizonInput = document.getElementById("horizon");

let settingsCache = { ...DEFAULT_SETTINGS };
let tasksTimeMapsCache = [];

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
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

function normalizeTimeMap(timeMap) {
  if (Array.isArray(timeMap.rules) && timeMap.rules.length > 0) {
    return { ...timeMap, rules: timeMap.rules.map((r) => ({ ...r, day: Number(r.day) })) };
  }
  const days = timeMap.days || [];
  const startTime = timeMap.startTime || "09:00";
  const endTime = timeMap.endTime || "12:00";
  return {
    ...timeMap,
    rules: days.map((day) => ({ day: Number(day), startTime, endTime }))
  };
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date) ? date.toLocaleString() : "No date";
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
  (settingsCache.sections || []).forEach((name) => {
    const chip = document.createElement("div");
    chip.className =
      "flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200";
    const label = document.createElement("span");
    label.textContent = name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.dataset.removeSection = name;
    removeBtn.className =
      "h-5 w-5 rounded-full border border-slate-700 text-[10px] font-bold text-slate-300 hover:border-orange-400 hover:text-orange-300";
    removeBtn.textContent = "×";
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
  if (selected && !sections.includes(selected)) {
    sections.push(selected);
  }
  taskSectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No section";
  if (!selected) noneOpt.selected = true;
  taskSectionSelect.appendChild(noneOpt);
  sections.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (selected) opt.selected = selected === name;
    taskSectionSelect.appendChild(opt);
  });
  taskSectionSelect.disabled = false;
  renderTaskSubsectionOptions();
}

function renderTaskSubsectionOptions(selected) {
  const section = taskSectionSelect.value;
  const subsectionMap = settingsCache.subsections || {};
  const subsections = section ? [...(subsectionMap[section] || [])] : [];
  if (selected && section && !subsections.includes(selected)) {
    subsections.push(selected);
  }
  taskSubsectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "None";
  taskSubsectionSelect.appendChild(noneOpt);
  subsections.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (selected) opt.selected = selected === name;
    taskSubsectionSelect.appendChild(opt);
  });
  if (!taskSubsectionSelect.value) {
    taskSubsectionSelect.value = "";
  }
}

function attachTaskDragEvents(element) {
  element.addEventListener("dragstart", handleTaskDragStart);
  element.addEventListener("dragend", handleTaskDragEnd);
}

function attachDropZoneEvents(element) {
  element.addEventListener("dragover", handleTaskDragOver);
  element.addEventListener("dragenter", handleTaskDragOver);
  element.addEventListener("dragleave", handleTaskDragLeave);
  element.addEventListener("drop", handleTaskDrop);
}

function renderTasks(tasks, timeMaps) {
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const sections = [...(settingsCache.sections || [])];
  const taskSections = Array.from(new Set(tasks.map((t) => t.section).filter(Boolean)));
  taskSections.forEach((s) => {
    if (!sections.includes(s)) sections.push(s);
  });
  const hasUnsectioned = tasks.some((t) => !t.section);
  const allSections = [...sections, ...(hasUnsectioned || sections.length === 0 ? ["No section"] : [])];

  const renderTaskCard = (task) => {
    const statusClass =
      task.scheduleStatus === "scheduled"
        ? "text-lime-300 font-semibold"
        : task.scheduleStatus === "ignored"
          ? "text-slate-400 font-semibold"
          : "text-amber-300 font-semibold";
    const timeMapNames = task.timeMapIds.map((id) => timeMapById.get(id)?.name || "Unknown");
    const taskCard = document.createElement("div");
    taskCard.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    taskCard.draggable = true;
    taskCard.dataset.taskId = task.id;
    attachTaskDragEvents(taskCard);
    const color = timeMapById.get(task.timeMapIds[0])?.color;
    if (color) {
      taskCard.style.borderColor = color;
      taskCard.style.backgroundColor = `${color}1a`;
    }
    const titleMarkup = task.link
      ? `<a href="${task.link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-lime-300 hover:text-lime-200 underline decoration-lime-400">
          <span>${task.title}</span>
          <span class="">🔗</span>
        </a>`
      : task.title;
    taskCard.innerHTML = `
      <h3 class="text-base font-semibold">${titleMarkup}</h3>
      <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
        <span>Deadline: ${formatDateTime(task.deadline)}</span>
        <span>Duration: ${task.durationMin}m</span>
        <span>Priority: ${task.priority}</span>
        <span>TimeMaps: ${timeMapNames.join(", ")}</span>
        ${task.section ? `<span>Section: ${task.section}</span>` : ""}
        ${task.subsection ? `<span>Subsection: ${task.subsection}</span>` : ""}
      </div>
      <div class="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
        <span class="${statusClass}">${task.scheduleStatus || "unscheduled"}</span>
        <span>Scheduled: ${formatDateTime(task.scheduledStart)}</span>
      </div>
      <div class="mt-3 flex gap-2">
        <button class="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400" data-edit="${task.id}">Edit</button>
        <button class="rounded-lg bg-orange-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-orange-400" data-delete="${task.id}">Delete</button>
      </div>
    `;
    return taskCard;
  };

  const renderSectionCard = (sectionName) => {
    const isNoSection = sectionName === "No section";
    const sectionTasks = tasks.filter((t) => (isNoSection ? !t.section : t.section === sectionName));
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
    card.dataset.sectionCard = sectionName;
    card.dataset.dropSection = isNoSection ? "" : sectionName;
    card.dataset.dropSubsection = "";
    attachDropZoneEvents(card);
    const header = document.createElement("div");
    header.className = "flex flex-wrap items-center justify-between gap-2";
    const title = document.createElement("div");
    title.className = "flex items-center gap-2 text-base font-semibold";
    title.textContent = sectionName;
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.dataset.addSection = isNoSection ? "" : sectionName;
    addBtn.className =
      "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
    addBtn.textContent = "Add task";
    header.appendChild(title);
    if (!isNoSection) {
      const addSubsectionToggle = document.createElement("button");
      addSubsectionToggle.type = "button";
      addSubsectionToggle.dataset.toggleSubsection = sectionName;
      addSubsectionToggle.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
      addSubsectionToggle.textContent = "Add subsection";
      actions.appendChild(addSubsectionToggle);
    }
    actions.appendChild(addBtn);
    header.appendChild(actions);
    card.appendChild(header);

    if (!isNoSection) {
      const subsectionInputWrap = document.createElement("div");
      subsectionInputWrap.className = "hidden flex flex-col gap-2 md:flex-row md:items-center";
      subsectionInputWrap.dataset.subsectionForm = sectionName;
      subsectionInputWrap.innerHTML = `
        <input data-subsection-input="${sectionName}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${sectionName}" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
      `;
      card.appendChild(subsectionInputWrap);
    }

    const subsectionMap = settingsCache.subsections || {};
    const subsections = !isNoSection ? [...(subsectionMap[sectionName] || [])] : [];
    const taskSubsections = Array.from(
      new Set(sectionTasks.map((t) => t.subsection).filter(Boolean))
    );
    taskSubsections.forEach((sub) => {
      if (!subsections.includes(sub)) subsections.push(sub);
    });

    const ungroupedTasks = sectionTasks.filter((t) => !t.subsection);
    const ungroupedZone = document.createElement("div");
    ungroupedZone.dataset.dropSection = isNoSection ? "" : sectionName;
    ungroupedZone.dataset.dropSubsection = "";
    ungroupedZone.className =
      "space-y-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-3 py-3";
    attachDropZoneEvents(ungroupedZone);
    if (ungroupedTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-xs text-slate-500";
      empty.textContent = "Drag tasks here or add new.";
      ungroupedZone.appendChild(empty);
    } else {
      ungroupedTasks.forEach((task) => ungroupedZone.appendChild(renderTaskCard(task)));
    }
    card.appendChild(ungroupedZone);

    subsections.forEach((sub) => {
      const subWrap = document.createElement("div");
      subWrap.className = "space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3";
      const subHeader = document.createElement("div");
      subHeader.className = "flex items-center justify-between text-sm font-semibold text-slate-200";
      subHeader.textContent = sub;
      const addSubTaskBtn = document.createElement("button");
      addSubTaskBtn.type = "button";
      addSubTaskBtn.dataset.addSection = isNoSection ? "" : sectionName;
      addSubTaskBtn.dataset.addSubsectionTarget = sub;
      addSubTaskBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
      addSubTaskBtn.textContent = "Add task";
      subHeader.appendChild(addSubTaskBtn);
      subWrap.appendChild(subHeader);

      const subZone = document.createElement("div");
      subZone.dataset.dropSection = isNoSection ? "" : sectionName;
      subZone.dataset.dropSubsection = sub;
      subZone.className =
        "space-y-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-2 py-2";
      attachDropZoneEvents(subZone);
      const subTasks = sectionTasks.filter((t) => t.subsection === sub);
      if (subTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-xs text-slate-500";
        empty.textContent = "Drag tasks here or add new.";
        subZone.appendChild(empty);
      } else {
        subTasks.forEach((task) => subZone.appendChild(renderTaskCard(task)));
      }
      subWrap.appendChild(subZone);
      card.appendChild(subWrap);
    });

    return card;
  };

  if (allSections.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No sections yet. Add a section to begin.</div>';
    return;
  }

  allSections.forEach((sectionName) => {
    taskList.appendChild(renderSectionCard(sectionName));
  });
}

async function loadTasks() {
  const [tasksRaw, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const tasks = await ensureTaskIds(tasksRaw);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  renderTasks(tasks, timeMaps);
}

async function handleAddSection() {
  const name = sectionInput.value.trim();
  if (!name) return;
  const sections = settingsCache.sections || [];
  if (sections.includes(name)) {
    sectionInput.value = "";
    return;
  }
  const updated = [...sections, name];
  const subsections = { ...(settingsCache.subsections || {}), [name]: [] };
  settingsCache = { ...settingsCache, sections: updated, subsections };
  await saveSettings(settingsCache);
  renderSections();
  renderTaskSectionOptions(name);
  sectionInput.value = "";
  closeSectionForm();
  await loadTasks();
}

async function handleRemoveSection(name) {
  const sections = settingsCache.sections || [];
  const nextSections = sections.filter((s) => s !== name);
  if (nextSections.length === sections.length) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  delete subsections[name];
  settingsCache = { ...settingsCache, sections: nextSections, subsections };
  await saveSettings(settingsCache);
  const tasks = await getAllTasks();
  const updates = tasks
    .filter((t) => t.section === name)
    .map((t) => saveTask({ ...t, section: "", subsection: "" }));
  if (updates.length) {
    await Promise.all(updates);
  }
  renderSections();
  renderTaskSectionOptions();
  await loadTasks();
}

async function handleAddSubsection(sectionName, value) {
  const name = value.trim();
  if (!sectionName || !name) return;
  const subsections = { ...(settingsCache.subsections || {}) };
  const list = subsections[sectionName] || [];
  if (list.includes(name)) return;
  subsections[sectionName] = [...list, name];
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  renderTaskSectionOptions(sectionName);
  await loadTasks();
}

let draggedTaskId = null;
let activeDropZone = null;

function clearDropHighlight() {
  if (activeDropZone) {
    activeDropZone.classList.remove("ring-1", "ring-lime-400/50");
    activeDropZone = null;
  }
}

function getDropZone(target, fallback) {
  if (fallback?.dataset?.dropSection !== undefined) return fallback;
  return target.closest("[data-drop-section]");
}

function handleTaskDragStart(event) {
  const card = event.target.closest("[data-task-id]");
  if (!card) return;
  draggedTaskId = card.dataset.taskId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedTaskId);
  }
}

function handleTaskDragEnd() {
  draggedTaskId = null;
  clearDropHighlight();
}

function handleTaskDragOver(event) {
  const zone = getDropZone(event.target, event.currentTarget);
  if (!zone) return;
  event.preventDefault();
  if (activeDropZone !== zone) {
    clearDropHighlight();
    activeDropZone = zone;
    activeDropZone.classList.add("ring-1", "ring-lime-400/50");
  }
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleTaskDragLeave(event) {
  const zone = getDropZone(event.target, event.currentTarget);
  if (!zone) return;
  if (zone === activeDropZone && !zone.contains(event.relatedTarget)) {
    clearDropHighlight();
  }
}

async function handleTaskDrop(event) {
  const zone = getDropZone(event.target, event.currentTarget);
  if (!zone) return;
  event.preventDefault();
  event.stopPropagation();
  const dataId = event.dataTransfer?.getData("text/plain");
  const taskId = draggedTaskId || dataId;
  if (!taskId) {
    clearDropHighlight();
    return;
  }
  const section = (zone.dataset.dropSection || "").trim();
  const subsection = (zone.dataset.dropSubsection || "").trim();
  const tasks = await ensureTaskIds(await getAllTasks());
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    clearDropHighlight();
    return;
  }
  if (task.section === section && (task.subsection || "") === subsection) {
    clearDropHighlight();
    return;
  }
  await saveTask({ ...task, section, subsection });
  clearDropHighlight();
  await loadTasks();
}

async function ensureTaskIds(tasks) {
  const updates = [];
  const withIds = tasks.map((task) => {
    if (task.id) return task;
    const id = uuid();
    const updated = { ...task, id };
    updates.push(saveTask(updated));
    return updated;
  });
  if (updates.length) {
    await Promise.all(updates);
  }
  return withIds;
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
  const priority = Number(document.getElementById("task-priority").value);
  const deadline = taskDeadlineInput.value;
  const link = (taskLinkInput.value || "").trim();
  const timeMapIds = collectSelectedValues(taskTimeMapOptions);
  const section = taskSectionSelect.value || (settingsCache.sections || [])[0] || "";
  const subsection = taskSubsectionSelect.value || "";

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

  await saveTask({
    id,
    title,
    durationMin,
    priority,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    link: link || "",
    timeMapIds,
    section,
    subsection,
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null
  });
  resetTaskForm(true);
  await loadTasks();
}

function resetTaskForm(shouldClose = false) {
  document.getElementById("task-id").value = "";
  document.getElementById("task-title").value = "";
  taskLinkInput.value = "";
  document.getElementById("task-duration").value = "30";
  document.getElementById("task-priority").value = "3";
  taskDeadlineInput.value = "";
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(tasksTimeMapsCache || [], []);
  if (shouldClose) {
    closeTaskForm();
  }
}

function startTaskInSection(sectionName, subsectionName = "") {
  document.getElementById("task-id").value = "";
  document.getElementById("task-title").value = "";
  taskLinkInput.value = "";
  document.getElementById("task-duration").value = "30";
  document.getElementById("task-priority").value = "3";
  taskDeadlineInput.value = "";
  renderTaskSectionOptions(sectionName);
  renderTaskSubsectionOptions(subsectionName);
  renderTaskTimeMapOptions(tasksTimeMapsCache || [], []);
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
  const addSection = btn.dataset.addSection;
  const addSubsectionFor = btn.dataset.addSubsection;
  const toggleSubsectionFor = btn.dataset.toggleSubsection;
  const addSubsectionTaskTarget = btn.dataset.addSubsectionTarget;
  const editId = btn.dataset.edit;
  const deleteId = btn.dataset.delete;
  if (toggleSubsectionFor !== undefined) {
    const card = btn.closest("[data-section-card]");
    const form = card?.querySelector(`[data-subsection-form="${toggleSubsectionFor}"]`);
    const input = card?.querySelector(`[data-subsection-input="${toggleSubsectionFor}"]`);
    if (form) {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden")) {
        input?.focus();
      } else if (input) {
        input.value = "";
      }
    }
  } else if (addSubsectionFor !== undefined) {
    const card = btn.closest("[data-section-card]");
    const input = card?.querySelector(`[data-subsection-input="${addSubsectionFor}"]`);
    const value = input?.value || "";
    if (value.trim()) {
      await handleAddSubsection(addSubsectionFor, value);
      if (input) {
        input.value = "";
        const wrap = input.closest(`[data-subsection-form="${addSubsectionFor}"]`);
        wrap?.classList.add("hidden");
      }
    }
  } else if (addSection !== undefined) {
    startTaskInSection(addSection, addSubsectionTaskTarget || "");
  } else if (editId) {
    const task = tasks.find((t) => t.id === editId);
    if (task) {
      document.getElementById("task-id").value = task.id;
      document.getElementById("task-title").value = task.title;
      taskLinkInput.value = task.link || "";
      document.getElementById("task-duration").value = task.durationMin;
      document.getElementById("task-priority").value = String(task.priority);
      taskDeadlineInput.value = task.deadline ? task.deadline.slice(0, 10) : "";
      renderTaskSectionOptions(task.section);
      renderTaskSubsectionOptions(task.subsection);
      renderTaskTimeMapOptions(tasksTimeMapsCache, task.timeMapIds);
      openTaskForm();
      switchView("tasks");
    }
  } else if (deleteId) {
    deleteTask(deleteId).then(loadTasks);
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
      switchView("timemaps");
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
  const tasks = await ensureTaskIds(tasksRaw);
  await initSettings(settings);
  renderSections();
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  renderTimeMaps(timeMaps);
  renderTaskSectionOptions();
  renderTaskTimeMapOptions(timeMaps);
  renderTasks(tasks, timeMaps);
  await updateScheduleSummary();
}

document.getElementById("timemap-form").addEventListener("submit", handleTimeMapSubmit);
document.getElementById("timemap-set-default").addEventListener("click", handleSetDefaultTimeMap);
document.getElementById("task-form").addEventListener("submit", handleTaskSubmit);
document.getElementById("task-reset").addEventListener("click", resetTaskForm);
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
sectionList.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-remove-section]");
  if (!btn) return;
  handleRemoveSection(btn.dataset.removeSection);
});
taskSectionSelect.addEventListener("change", () => renderTaskSubsectionOptions());

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

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
taskList.addEventListener("dragstart", handleTaskDragStart);
taskList.addEventListener("dragend", handleTaskDragEnd);
taskList.addEventListener("dragover", handleTaskDragOver);
taskList.addEventListener("dragenter", handleTaskDragOver);
taskList.addEventListener("dragleave", handleTaskDragLeave);
taskList.addEventListener("drop", handleTaskDrop);
taskFormWrap.addEventListener("click", (event) => {
  if (event.target === taskFormWrap) {
    closeTaskForm();
  }
});
taskModalCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskForm));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !taskFormWrap.classList.contains("hidden")) {
    closeTaskForm();
  }
});

hydrate();
enableDeadlinePicker();
