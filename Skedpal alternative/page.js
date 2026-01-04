import {
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveTask,
  deleteTask,
  saveTimeMap,
  deleteTimeMap,
  saveSettings
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
const taskTimeMapOptions = document.getElementById("task-timemap-options");
const timeMapColorInput = document.getElementById("timemap-color");
const scheduleStatus = document.getElementById("schedule-status");
const rescheduleButtons = [...document.querySelectorAll("[data-reschedule-btn]")];
const scheduleSummary = document.getElementById("scheduled-summary");
const horizonInput = document.getElementById("horizon");

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
  return date ? date.toLocaleString() : "—";
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
      <h3 class="text-base font-semibold">${tm.name}</h3>
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

function renderTaskTimeMapOptions(timeMaps, selected = []) {
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
    input.checked = selected.includes(tm.id);
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

function renderTasks(tasks, timeMaps) {
  taskList.innerHTML = "";
  if (tasks.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No tasks yet. Add a task to schedule.</div>';
    return;
  }
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  tasks.forEach((task) => {
    const statusClass =
      task.scheduleStatus === "scheduled"
        ? "text-lime-300 font-semibold"
        : task.scheduleStatus === "ignored"
          ? "text-slate-400 font-semibold"
          : "text-amber-300 font-semibold";
    const timeMapNames = task.timeMapIds.map((id) => timeMapById.get(id)?.name || "Unknown");
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    const color = timeMapById.get(task.timeMapIds[0])?.color;
    if (color) {
      card.style.borderColor = color;
      card.style.backgroundColor = `${color}1a`;
    }
    card.innerHTML = `
      <h3 class="text-base font-semibold">${task.title}</h3>
      <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
        <span>Deadline: ${formatDateTime(task.deadline)}</span>
        <span>Duration: ${task.durationMin}m</span>
        <span>Priority: ${task.priority}</span>
        <span>TimeMaps: ${timeMapNames.join(", ")}</span>
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
    taskList.appendChild(card);
  });
}

async function loadTasks() {
  const [tasks, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  renderTasks(tasks, timeMaps);
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

async function handleTimeMapSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("timemap-id").value || uuid();
  const name = document.getElementById("timemap-name").value.trim();
  const color = timeMapColorInput.value || "#22c55e";
  const rules = collectTimeMapRules(timeMapDayRows);
  if (rules.length === 0) {
    alert("Select at least one day and a valid time window.");
    return;
  }
  if (!name) {
    alert("Name is required.");
    return;
  }
  await saveTimeMap({ id, name, rules, color });
  resetTimeMapForm();
  closeTimeMapForm();
  await loadTimeMaps();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("task-id").value || uuid();
  const title = document.getElementById("task-title").value.trim();
  const durationMin = Number(document.getElementById("task-duration").value);
  const priority = Number(document.getElementById("task-priority").value);
  const deadline = document.getElementById("task-deadline").value;
  const timeMapIds = collectSelectedValues(taskTimeMapOptions);

  if (!title || !deadline || !durationMin) {
    alert("Title, duration, and deadline are required.");
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
    deadline: new Date(deadline).toISOString(),
    timeMapIds,
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null
  });
  resetTaskForm();
  await loadTasks();
}

function resetTaskForm() {
  document.getElementById("task-id").value = "";
  document.getElementById("task-title").value = "";
  document.getElementById("task-duration").value = "";
  document.getElementById("task-priority").value = "3";
  document.getElementById("task-deadline").value = "";
  renderTaskTimeMapOptions([], []);
  loadTimeMaps();
  closeTaskForm();
}

function resetTimeMapForm() {
  document.getElementById("timemap-id").value = "";
  document.getElementById("timemap-name").value = "";
  timeMapColorInput.value = "#22c55e";
  renderDayRows(timeMapDayRows);
}

function handleTaskListClick(event, tasks) {
  const btn = event.target.closest("button");
  if (!btn) return;
  const editId = btn.dataset.edit;
  const deleteId = btn.dataset.delete;
  if (editId) {
    const task = tasks.find((t) => t.id === editId);
    if (task) {
      document.getElementById("task-id").value = task.id;
      document.getElementById("task-title").value = task.title;
      document.getElementById("task-duration").value = task.durationMin;
      document.getElementById("task-priority").value = String(task.priority);
      document.getElementById("task-deadline").value = task.deadline.slice(0, 16);
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

async function initSettings() {
  const settings = await getSettings();
  horizonInput.value = settings.schedulingHorizonDays;
  horizonInput.addEventListener("change", async () => {
    const days = Number(horizonInput.value) || 14;
    await saveSettings({ schedulingHorizonDays: days });
  });
}

let tasksTimeMapsCache = [];

async function hydrate() {
  renderDayRows(timeMapDayRows);
  const [tasks, timeMapsRaw] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  const timeMaps = timeMapsRaw.map(normalizeTimeMap);
  tasksTimeMapsCache = timeMaps;
  renderTimeMaps(timeMaps);
  renderTaskTimeMapOptions(timeMaps);
  renderTasks(tasks, timeMaps);
  await initSettings();
  await updateScheduleSummary();
}

document.getElementById("timemap-form").addEventListener("submit", handleTimeMapSubmit);
document.getElementById("task-form").addEventListener("submit", handleTaskSubmit);
document.getElementById("task-reset").addEventListener("click", resetTaskForm);
document.getElementById("timemap-reset").addEventListener("click", resetTimeMapForm);
rescheduleButtons.forEach((btn) => btn.addEventListener("click", handleReschedule));

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
  taskToggle.textContent = "Hide Task form";
}

function closeTaskForm() {
  taskFormWrap.classList.add("hidden");
  taskToggle.textContent = "Show Task form";
}

timeMapToggle.addEventListener("click", () => {
  if (timeMapFormWrap.classList.contains("hidden")) {
    openTimeMapForm();
  } else {
    closeTimeMapForm();
  }
});

taskToggle.addEventListener("click", () => {
  if (taskFormWrap.classList.contains("hidden")) {
    openTaskForm();
  } else {
    closeTaskForm();
  }
});

timeMapList.addEventListener("click", async (event) => {
  const timeMaps = await getAllTimeMaps();
  handleTimeMapListClick(event, timeMaps);
});

taskList.addEventListener("click", async (event) => {
  const [tasks, timeMaps] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  tasksTimeMapsCache = timeMaps.map(normalizeTimeMap);
  handleTaskListClick(event, tasks);
});

hydrate();
