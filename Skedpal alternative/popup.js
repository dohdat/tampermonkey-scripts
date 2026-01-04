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
const timeMapDays = document.getElementById("timemap-days");
const taskTimeMapOptions = document.getElementById("task-timemap-options");
const scheduleStatus = document.getElementById("schedule-status");
const rescheduleBtn = document.getElementById("reschedule-btn");
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

function renderDayChips(container, selectedValues = []) {
  container.innerHTML = "";
  dayOptions.forEach((day) => {
    const id = `${container.id}-${day.label}`;
    const wrapper = document.createElement("label");
    wrapper.htmlFor = id;
    wrapper.className =
      "flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = day.value;
    input.id = id;
    input.checked = selectedValues.includes(day.value);
    input.className = "h-4 w-4 rounded border-slate-600 bg-slate-900 text-lime-400";
    const text = document.createElement("span");
    text.textContent = day.label;
    wrapper.appendChild(input);
    wrapper.appendChild(text);
    container.appendChild(wrapper);
  });
}

function formatTimeMapDays(days) {
  return dayOptions
    .filter((day) => days.includes(day.value))
    .map((d) => d.label)
    .join(" • ");
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
  timeMaps.forEach((tm) => {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
    card.innerHTML = `
      <h3 class="text-base font-semibold">${tm.name}</h3>
      <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
        <span>${formatTimeMapDays(tm.days)}</span>
        <span>${tm.startTime} – ${tm.endTime}</span>
      </div>
      <div class="mt-3 flex gap-2">
        <button class="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400" data-edit="${tm.id}">Edit</button>
        <button class="rounded-lg bg-orange-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-orange-400" data-delete="${tm.id}">Delete</button>
      </div>
    `;
    timeMapList.appendChild(card);
  });
}

async function loadTimeMaps() {
  const timeMaps = await getAllTimeMaps();
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
  timeMaps.forEach((tm) => {
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
    label.appendChild(input);
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
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, tm]));
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
  const [tasks, timeMaps] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  renderTasks(tasks, timeMaps);
}

function collectSelectedValues(container) {
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map((el) => {
    const val = el.value;
    return /^\d+$/.test(val) ? Number(val) : val;
  });
}

async function handleTimeMapSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("timemap-id").value || uuid();
  const name = document.getElementById("timemap-name").value.trim();
  const days = collectSelectedValues(timeMapDays);
  const startTime = document.getElementById("timemap-start").value;
  const endTime = document.getElementById("timemap-end").value;
  if (days.length === 0) {
    alert("Select at least one day.");
    return;
  }
  if (!name) {
    alert("Name is required.");
    return;
  }
  await saveTimeMap({ id, name, days, startTime, endTime });
  resetTimeMapForm();
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
}

function resetTimeMapForm() {
  document.getElementById("timemap-id").value = "";
  document.getElementById("timemap-name").value = "";
  document.getElementById("timemap-start").value = "09:00";
  document.getElementById("timemap-end").value = "12:00";
  renderDayChips(timeMapDays);
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
    const tm = timeMaps.find((t) => t.id === editId);
    if (tm) {
      document.getElementById("timemap-id").value = tm.id;
      document.getElementById("timemap-name").value = tm.name;
      document.getElementById("timemap-start").value = tm.startTime;
      document.getElementById("timemap-end").value = tm.endTime;
      renderDayChips(timeMapDays, tm.days);
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
  rescheduleBtn.disabled = true;
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
    rescheduleBtn.disabled = false;
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
  renderDayChips(timeMapDays);
  const [tasks, timeMaps] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
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
rescheduleBtn.addEventListener("click", handleReschedule);

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

timeMapList.addEventListener("click", async (event) => {
  const timeMaps = await getAllTimeMaps();
  handleTimeMapListClick(event, timeMaps);
});

taskList.addEventListener("click", async (event) => {
  const [tasks, timeMaps] = await Promise.all([getAllTasks(), getAllTimeMaps()]);
  tasksTimeMapsCache = timeMaps;
  handleTaskListClick(event, tasks);
});

hydrate();
