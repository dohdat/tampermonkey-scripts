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

const editIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9.2 9.2-3.3.7a.5.5 0 0 1-.6-.6l.7-3.3 9.2-9.2Z"></path><path d="M2.5 17.5h15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`;
const removeIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h12"></path><path d="M8 6v9m4-9v9"></path><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6"></path><path d="M5 6v9.5A1.5 1.5 0 0 0 6.5 17h7A1.5 1.5 0 0 0 15 15.5V6"></path></svg>`;
const favoriteIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="m10 2.5 2.1 4.25 4.65.68-3.37 3.28.79 4.61L10 13.8 5.83 15.3l.79-4.61L3.25 7.43l4.65-.68Z"/></svg>`;
const zoomInIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4h2m0 0v2m0-2V2m0 2h2m1 5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2.5 3.5L17 17"></path></svg>`;
const zoomOutIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10h4m2 1a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2.5 3.5L17 17"></path></svg>`;

const views = [...document.querySelectorAll(".view")];
const navButtons = [...document.querySelectorAll(".nav-btn")];
const taskList = document.getElementById("task-list");
const zoomBanner = document.getElementById("zoom-banner");
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
let tasksCache = [];
let zoomFilter = null;

function updateUrlWithZoom(filter) {
  const url = new URL(window.location.href);
  if (!filter) {
    url.searchParams.delete("zoom");
  } else {
    const parts =
      filter.type === "section"
        ? ["section", filter.sectionId || ""]
        : filter.type === "subsection"
          ? ["subsection", filter.sectionId || "", filter.subsectionId || ""]
          : ["task", filter.taskId || "", filter.sectionId || "", filter.subsectionId || ""];
    url.searchParams.set("zoom", parts.join(":"));
  }
  history.replaceState({}, "", url.toString());
}

function parseZoomFromUrl() {
  const url = new URL(window.location.href);
  const zoom = url.searchParams.get("zoom");
  if (!zoom) return null;
  const [type, a, b, c] = zoom.split(":");
  if (type === "section") {
    return { type, sectionId: a || "" };
  }
  if (type === "subsection") {
    return { type, sectionId: a || "", subsectionId: b || "" };
  }
  if (type === "task") {
    return { type, taskId: a || "", sectionId: b || "", subsectionId: c || "" };
  }
  return null;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function getSectionById(id) {
  return (settingsCache.sections || []).find((s) => s.id === id);
}

function getSectionName(id) {
  return getSectionById(id)?.name || "";
}

function getSubsectionsFor(sectionId) {
  return ((settingsCache.subsections || {})[sectionId] || []).map((s) => ({
    favorite: false,
    parentId: "",
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
  (settingsCache.sections || []).forEach((section) => {
    const chip = document.createElement("div");
    chip.className =
      "flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200";
    const label = document.createElement("span");
    label.textContent = section.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.dataset.removeSection = section.id;
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

function getContainerKey(section, subsection) {
  return `${section || ""}__${subsection || ""}`;
}

function sortTasksByOrder(list = []) {
  return [...list].sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (aOrder === bOrder) {
      return (a.title || "").localeCompare(b.title || "");
    }
    return aOrder - bOrder;
  });
}

function getNextOrder(section, subsection, tasks = tasksCache) {
  const key = getContainerKey(section, subsection);
  const maxOrder = (tasks || []).reduce((max, task) => {
    if (getContainerKey(task.section, task.subsection) !== key) return max;
    const orderValue = Number(task.order);
    if (!Number.isFinite(orderValue)) return max;
    return Math.max(max, orderValue);
  }, 0);
  return maxOrder + 1;
}

function renderTasks(tasks, timeMaps) {
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const filteredTasks =
    zoomFilter?.type === "section"
      ? tasks.filter((t) => (t.section || "") === (zoomFilter.sectionId || ""))
      : zoomFilter?.type === "subsection"
        ? tasks.filter(
            (t) =>
              (t.section || "") === (zoomFilter.sectionId || "") &&
              (t.subsection || "") === (zoomFilter.subsectionId || "")
          )
        : zoomFilter?.type === "task"
          ? tasks.filter((t) => t.id === zoomFilter.taskId)
          : tasks;
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
    const statusClass =
      task.scheduleStatus === "scheduled"
        ? "text-lime-300 font-semibold"
        : task.scheduleStatus === "ignored"
          ? "text-slate-400 font-semibold"
          : "text-amber-300 font-semibold";
    const timeMapNames = task.timeMapIds.map((id) => timeMapById.get(id)?.name || "Unknown");
    const sectionName = task.section ? getSectionName(task.section) : "";
    const subsectionName = task.subsection ? getSubsectionName(task.section, task.subsection) : "";
    const taskCard = document.createElement("div");
    taskCard.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    taskCard.draggable = true;
    taskCard.dataset.taskId = task.id;
    taskCard.dataset.sectionId = task.section || "";
    taskCard.dataset.subsectionId = task.subsection || "";
    taskCard.style.minHeight = "96px";
    attachTaskDragEvents(taskCard);
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
    const header = document.createElement("div");
    header.className = "flex items-start justify-between gap-2";
    const titleWrap = document.createElement("h3");
    titleWrap.className = "text-base font-semibold title-hover-group flex items-center gap-2";
    titleWrap.innerHTML = titleMarkup;
    const titleActions = document.createElement("div");
    titleActions.className = "title-actions";
    const zoomTaskBtn = document.createElement("button");
    zoomTaskBtn.type = "button";
    zoomTaskBtn.dataset.zoomTask = task.id;
    zoomTaskBtn.dataset.zoomSection = task.section || "";
    zoomTaskBtn.dataset.zoomSubsection = task.subsection || "";
    zoomTaskBtn.className = "title-icon-btn";
    zoomTaskBtn.title = "Zoom into task";
    zoomTaskBtn.innerHTML = zoomInIconSvg;
    const editTaskBtn = document.createElement("button");
    editTaskBtn.type = "button";
    editTaskBtn.dataset.edit = task.id;
    editTaskBtn.className = "title-icon-btn";
    editTaskBtn.title = "Edit task";
    editTaskBtn.innerHTML = editIconSvg;
    const deleteTaskBtn = document.createElement("button");
    deleteTaskBtn.type = "button";
    deleteTaskBtn.dataset.delete = task.id;
    deleteTaskBtn.className = "title-icon-btn";
    deleteTaskBtn.title = "Delete task";
    deleteTaskBtn.innerHTML = removeIconSvg;
    titleActions.appendChild(zoomTaskBtn);
    titleActions.appendChild(editTaskBtn);
    titleActions.appendChild(deleteTaskBtn);
    titleWrap.appendChild(titleActions);
    header.appendChild(titleWrap);
    taskCard.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "mt-1 flex flex-wrap gap-2 text-xs text-slate-400";
    meta.innerHTML = `
        <span>Deadline: ${formatDateTime(task.deadline)}</span>
        <span>Duration: ${task.durationMin}m</span>
        <span>Priority: ${task.priority}</span>
        <span>TimeMaps: ${timeMapNames.join(", ")}</span>
        ${sectionName ? `<span>Section: ${sectionName}</span>` : ""}
        ${subsectionName ? `<span>Subsection: ${subsectionName}</span>` : ""}
      `;
    taskCard.appendChild(meta);

    const statusRow = document.createElement("div");
    statusRow.className = "mt-1 flex flex-wrap gap-3 text-xs text-slate-400";
    statusRow.innerHTML = `
        <span class="${statusClass}">${task.scheduleStatus || "unscheduled"}</span>
        <span>Scheduled: ${formatDateTime(task.scheduledStart)}</span>
      `;
    taskCard.appendChild(statusRow);


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
    card.dataset.dropSection = isNoSection ? "" : section.id;
    card.dataset.dropSubsection = "";
    attachDropZoneEvents(card);
    const header = document.createElement("div");
    header.className = "flex flex-wrap items-center justify-between gap-2";
    const title = document.createElement("div");
    title.className =
      "title-hover-group flex items-center gap-2 text-base font-semibold text-slate-100";
    const titleText = document.createElement("span");
    titleText.textContent = section.name || "Untitled section";
    title.appendChild(titleText);
    if (!isNoSection) {
      const titleActions = document.createElement("div");
      titleActions.className = "title-actions";
      const editSectionBtn = document.createElement("button");
      editSectionBtn.type = "button";
      editSectionBtn.dataset.editSection = section.id;
      editSectionBtn.className = "title-icon-btn";
      editSectionBtn.title = "Edit section";
      editSectionBtn.innerHTML = editIconSvg;
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
      titleActions.appendChild(editSectionBtn);
      titleActions.appendChild(zoomSectionBtn);
      titleActions.appendChild(favoriteSectionBtn);
      titleActions.appendChild(removeSectionBtn);
      title.appendChild(titleActions);
    }
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.dataset.addSection = isNoSection ? "" : section.id;
    addBtn.className =
      "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
    addBtn.textContent = "Add task";
    header.appendChild(title);
    if (!isNoSection) {
      const addSubsectionToggle = document.createElement("button");
      addSubsectionToggle.type = "button";
      addSubsectionToggle.dataset.toggleSubsection = section.id;
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
      subsectionInputWrap.dataset.subsectionForm = section.id;
      subsectionInputWrap.innerHTML = `
        <input data-subsection-input="${section.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${section.id}" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
      `;
      card.appendChild(subsectionInputWrap);
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

    const ungroupedTasks = sortTasksByOrder(sectionTasks.filter((t) => !t.subsection));
    const ungroupedZone = document.createElement("div");
    ungroupedZone.dataset.dropSection = isNoSection ? "" : section.id;
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

    const buildChildren = (parentId = "") =>
      subsections.filter((s) => (s.parentId || "") === (parentId || ""));

    const renderSubsection = (sub) => {
      const subWrap = document.createElement("div");
      subWrap.className = "space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3";
      subWrap.dataset.subsectionCard = sub.id;
      const subHeader = document.createElement("div");
      subHeader.className = "flex items-center justify-between text-sm font-semibold text-slate-200";
      const subTitle = document.createElement("div");
      subTitle.className = "title-hover-group flex items-center gap-2";
      const subTitleText = document.createElement("span");
      subTitleText.textContent = sub.name;
      const subTitleActions = document.createElement("div");
      subTitleActions.className = "title-actions";
      const editSubBtn = document.createElement("button");
      editSubBtn.type = "button";
      editSubBtn.dataset.editSubsection = sub.id;
      editSubBtn.dataset.parentSection = section.id;
      editSubBtn.className = "title-icon-btn";
      editSubBtn.title = "Edit subsection";
      editSubBtn.innerHTML = editIconSvg;
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
      subTitleActions.appendChild(editSubBtn);
      subTitleActions.appendChild(zoomSubBtn);
      subTitleActions.appendChild(favoriteSubBtn);
      subTitleActions.appendChild(removeSubBtn);
      subTitle.appendChild(subTitleText);
      subTitle.appendChild(subTitleActions);
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
      const subHeaderActions = document.createElement("div");
      subHeaderActions.className = "flex items-center gap-2";
      subHeaderActions.appendChild(addChildSubBtn);
      subHeaderActions.appendChild(addSubTaskBtn);
      subHeader.appendChild(subTitle);
      subHeader.appendChild(subHeaderActions);
      subWrap.appendChild(subHeader);

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
      subWrap.appendChild(childSubsectionInputWrap);

      const subZone = document.createElement("div");
      subZone.dataset.dropSection = isNoSection ? "" : section.id;
      subZone.dataset.dropSubsection = sub.id;
      subZone.className =
        "space-y-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-2 py-2";
      attachDropZoneEvents(subZone);
      const subTasks = sortTasksByOrder(sectionTasks.filter((t) => t.subsection === sub.id));
      if (subTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-xs text-slate-500";
        empty.textContent = "Drag tasks here or add new.";
        subZone.appendChild(empty);
      } else {
        subTasks.forEach((task) => subZone.appendChild(renderTaskCard(task)));
      }
      subWrap.appendChild(subZone);

      const children = buildChildren(sub.id);
      if (children.length) {
        const childWrap = document.createElement("div");
        childWrap.className = "space-y-2 border-l border-slate-800/60 pl-3";
        children.forEach((child) => childWrap.appendChild(renderSubsection(child)));
        subWrap.appendChild(childWrap);
      }
      return subWrap;
    };

    buildChildren().forEach((sub) => {
      card.appendChild(renderSubsection(sub));
    });

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
}

async function loadTasks() {
  const [tasksRaw, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const tasks = await ensureTaskIds(tasksRaw);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  tasksCache = tasks;
  renderTasks(tasksCache, timeMaps);
  renderZoomBanner();
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
  const entry = { id: uuid(), name, favorite: false, parentId };
  subsections[sectionId] = [...list, entry];
  settingsCache = { ...settingsCache, subsections };
  await saveSettings(settingsCache);
  renderTaskSectionOptions(sectionId);
  await loadTasks();
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

function renderZoomBanner() {
  if (!zoomBanner) return;
  if (!zoomFilter) {
    zoomBanner.classList.add("hidden");
    zoomBanner.innerHTML = "";
    return;
  }
  const label = getZoomLabel();
  zoomBanner.classList.remove("hidden");
  zoomBanner.innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm text-slate-200">
        <span>Zoomed into ${label}</span>
      </div>
      <div class="flex items-center gap-2">
        <button id="zoom-home-btn" class="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400">Home</button>
        <button id="zoom-out-btn" class="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400">Zoom out</button>
      </div>
    </div>
  `;
  zoomBanner.querySelector("#zoom-out-btn")?.addEventListener("click", () => {
    clearZoomFilter();
  });
  zoomBanner.querySelector("#zoom-home-btn")?.addEventListener("click", () => {
    goHome();
  });
}

function setZoomFilter(filter) {
  zoomFilter = filter;
  updateUrlWithZoom(filter);
  renderZoomBanner();
  renderTasks(tasksCache, tasksTimeMapsCache);
}

function clearZoomFilter() {
  zoomFilter = null;
  updateUrlWithZoom(null);
  renderZoomBanner();
  renderTasks(tasksCache, tasksTimeMapsCache);
}

function goHome() {
  clearZoomFilter();
  switchView("tasks");
}

let draggedTaskId = null;
let activeDropZone = null;
let dropIndicatorEl = null;
let activeDropCard = null;

function clearDropHighlight() {
  if (activeDropZone) {
    activeDropZone.classList.remove("ring-1", "ring-lime-400/50");
    activeDropZone = null;
  }
  clearDropIndicator();
  clearDropCardHighlight();
}

function getDropZone(target, fallback) {
  if (fallback?.dataset?.dropSection !== undefined) return fallback;
  return target.closest("[data-drop-section]");
}

function getDropIndicator() {
  if (!dropIndicatorEl) {
    dropIndicatorEl = document.createElement("div");
    dropIndicatorEl.className = "h-0.5 bg-lime-400/80 shadow-lime-400/30 rounded-full";
    dropIndicatorEl.style.height = "2px";
    dropIndicatorEl.style.margin = "2px 4px";
  }
  return dropIndicatorEl;
}

function placeDropIndicator(zone, beforeElement) {
  const indicator = getDropIndicator();
  indicator.dataset.section = zone.dataset.dropSection || "";
  indicator.dataset.subsection = zone.dataset.dropSubsection || "";
  if (indicator.parentElement !== zone) {
    indicator.remove();
  }
  if (beforeElement) {
    beforeElement.parentElement?.insertBefore(indicator, beforeElement);
  } else {
    zone.appendChild(indicator);
  }
}

function clearDropIndicator() {
  if (dropIndicatorEl?.parentElement) {
    dropIndicatorEl.parentElement.removeChild(dropIndicatorEl);
  }
}

function setActiveDropCard(card) {
  if (activeDropCard === card) return;
  clearDropCardHighlight();
  if (card) {
    activeDropCard = card;
    activeDropCard.dataset.dropPrevBg = activeDropCard.style.backgroundColor || "";
    activeDropCard.dataset.dropPrevBorder = activeDropCard.style.borderColor || "";
    activeDropCard.classList.add("ring-1", "ring-lime-400/60", "shadow-lime-400/30");
    activeDropCard.style.backgroundColor = "rgba(74,222,128,0.12)"; // lime-400/15
    activeDropCard.style.borderColor = "#4ade80";
  }
}

function clearDropCardHighlight() {
  if (activeDropCard) {
    activeDropCard.classList.remove("ring-1", "ring-lime-400/60", "shadow-lime-400/30");
    activeDropCard.style.backgroundColor = activeDropCard.dataset.dropPrevBg || "";
    activeDropCard.style.borderColor = activeDropCard.dataset.dropPrevBorder || "";
    delete activeDropCard.dataset.dropPrevBg;
    delete activeDropCard.dataset.dropPrevBorder;
    activeDropCard = null;
  }
}

function computeTaskReorderUpdates(tasks, movedTaskId, targetSection, targetSubsection, dropBeforeId) {
  const movedTask = tasks.find((t) => t.id === movedTaskId);
  if (!movedTask) return { updates: [], changed: false };
  const sourceKey = getContainerKey(movedTask.section, movedTask.subsection);
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const remainingSource = sortTasksByOrder(
    tasks.filter(
      (t) => getContainerKey(t.section, t.subsection) === sourceKey && t.id !== movedTaskId
    )
  );
  const destinationExisting =
    sourceKey === targetKey
      ? remainingSource
      : sortTasksByOrder(
          tasks.filter(
            (t) =>
              getContainerKey(t.section, t.subsection) === targetKey && t.id !== movedTaskId
          )
        );
  const destinationList = [...destinationExisting];
  const insertAtCandidate =
    dropBeforeId && dropBeforeId !== movedTaskId
      ? destinationList.findIndex((t) => t.id === dropBeforeId)
      : -1;
  const insertAt = insertAtCandidate >= 0 ? insertAtCandidate : destinationList.length;
  destinationList.splice(insertAt, 0, {
    ...movedTask,
    section: targetSection,
    subsection: targetSubsection
  });
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
  const zoneSection = (zone.dataset.dropSection || "").trim();
  const zoneSubsection = (zone.dataset.dropSubsection || "").trim();
  const candidateCard = event.target.closest("[data-task-id]");
  const validCard =
    candidateCard &&
    (candidateCard.dataset.sectionId || "") === zoneSection &&
    (candidateCard.dataset.subsectionId || "") === zoneSubsection
      ? candidateCard
      : null;
  placeDropIndicator(zone, validCard);
  setActiveDropCard(validCard);
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
  const dropBeforeId =
    dropIndicatorEl && dropIndicatorEl.parentElement === zone
      ? dropIndicatorEl.nextElementSibling?.dataset?.taskId || null
      : (() => {
          const dropTargetCard = event.target.closest("[data-task-id]");
          if (
            dropTargetCard &&
            (dropTargetCard.dataset.sectionId || "") === section &&
            (dropTargetCard.dataset.subsectionId || "") === subsection &&
            dropTargetCard.dataset.taskId !== taskId
          ) {
            return dropTargetCard.dataset.taskId;
          }
          return null;
        })();
  const { updates, changed } = computeTaskReorderUpdates(
    tasks,
    taskId,
    section,
    subsection,
    dropBeforeId
  );
  if (!changed) {
    clearDropHighlight();
    return;
  }
  await Promise.all(updates.map((t) => saveTask(t)));
  clearDropHighlight();
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
  const priority = Number(document.getElementById("task-priority").value);
  const deadline = taskDeadlineInput.value;
  const link = (taskLinkInput.value || "").trim();
  const timeMapIds = collectSelectedValues(taskTimeMapOptions);
  const defaultSectionId = (settingsCache.sections || [])[0]?.id || "";
  const section = taskSectionSelect.value || defaultSectionId;
  const subsection = taskSubsectionSelect.value || "";
  const existingTask = tasksCache.find((t) => t.id === id);
  const order =
    existingTask && existingTask.section === section && (existingTask.subsection || "") === subsection
      ? existingTask.order
      : getNextOrder(section, subsection);

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
    order,
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
  if (zoomTaskId !== undefined) {
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
    const card = btn.closest(`[data-subsection-card="${addChildSubsectionId}"]`);
    const form = card?.querySelector(`[data-child-subsection-form="${addChildSubsectionId}"]`);
    const input = card?.querySelector(`[data-child-subsection-input="${addChildSubsectionId}"]`);
    if (form) {
      const isHidden = form.classList.contains("hidden");
      if (isHidden) {
        form.classList.remove("hidden");
        input?.focus();
      } else if (input && input.value.trim()) {
        await handleAddSubsection(addChildSectionId || "", input.value, addChildSubsectionId);
        input.value = "";
        form.classList.add("hidden");
      } else {
        form.classList.add("hidden");
      }
    }
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
    await handleRenameSubsection(parentSectionId, editSubsectionId);
  } else if (removeSubsectionId !== undefined) {
    await handleRemoveSubsection(parentSectionId, removeSubsectionId);
  } else if (toggleSubsectionFor !== undefined) {
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
  const tasksWithIds = await ensureTaskIds(tasksRaw);
  const { tasks, settings: normalizedSettings } = await migrateSectionsAndTasks(tasksWithIds, settings);
  await initSettings(normalizedSettings);
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
    renderZoomBanner();
  }
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
