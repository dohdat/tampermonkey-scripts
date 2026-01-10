import { saveTask } from "../../data/db.js";
import { domRefs } from "../constants.js";
import { state } from "../state/page-state.js";
import { uuid } from "../utils.js";
import { removeReminderEntry } from "./task-reminders-helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14];
const reminderDayButtons = new Map();
const selectedDays = new Set();
let reminderTargetId = "";
let reminderModalCleanup = null;

async function reloadTasks() {
  const { loadTasks } = await import("./tasks-actions.js");
  return loadTasks();
}

function normalizeReminders(reminders = []) {
  if (!Array.isArray(reminders)) {return [];}
  return reminders
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: entry.id || uuid(),
      days: Number(entry.days) || 0,
      remindAt: entry.remindAt || "",
      createdAt: entry.createdAt || entry.remindAt || "",
      dismissedAt: entry.dismissedAt || ""
    }))
    .filter((entry) => entry.days > 0 && Boolean(entry.remindAt));
}

export function getOverdueReminders(task, now = new Date()) {
  const reminders = normalizeReminders(task?.reminders || []);
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowTime)) {return [];}
  return reminders.filter((entry) => {
    if (entry.dismissedAt) {return false;}
    const remindTime = new Date(entry.remindAt).getTime();
    return Number.isFinite(remindTime) && remindTime <= nowTime;
  });
}

function buildReminderEntry(days, now = new Date()) {
  const baseTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const remindAt = new Date(baseTime + days * DAY_MS).toISOString();
  return {
    id: uuid(),
    days,
    remindAt,
    createdAt: now.toISOString(),
    dismissedAt: ""
  };
}

function buildReminderLabel(entry) {
  const date = new Date(entry.remindAt);
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
  return `In ${entry.days} day${entry.days === 1 ? "" : "s"} · ${dateLabel}`;
}

function ensureReminderButtons() {
  const { taskReminderDays } = domRefs;
  if (!taskReminderDays || reminderDayButtons.size) {return;}
  taskReminderDays.innerHTML = "";
  REMINDER_DAY_OPTIONS.forEach((days) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.reminderDay = String(days);
    btn.className =
      "reminder-day-btn rounded-full border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
    btn.textContent = `${days} day${days === 1 ? "" : "s"}`;
    btn.setAttribute("data-test-skedpal", "task-reminder-day-option");
    taskReminderDays.appendChild(btn);
    reminderDayButtons.set(days, btn);
  });
}

function syncSelectedDayButtons() {
  reminderDayButtons.forEach((btn, day) => {
    const active = selectedDays.has(day);
    btn.classList.toggle("border-lime-400", active);
    btn.classList.toggle("bg-lime-400/10", active);
    btn.classList.toggle("text-lime-300", active);
  });
}

function renderExistingReminders(task) {
  const { taskReminderExistingWrap, taskReminderExistingList } = domRefs;
  if (!taskReminderExistingWrap || !taskReminderExistingList) {return;}
  const reminders = normalizeReminders(task?.reminders || []).sort((a, b) => {
    const aDismissed = Boolean(a.dismissedAt);
    const bDismissed = Boolean(b.dismissedAt);
    if (aDismissed !== bDismissed) {return aDismissed ? 1 : -1;}
    const aTime = new Date(a.remindAt).getTime();
    const bTime = new Date(b.remindAt).getTime();
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.days - b.days;
  });
  const pendingDays = Array.from(selectedDays || []);
  const existingDays = new Set(reminders.map((entry) => entry.days));
  const pendingEntries = pendingDays
    .filter((day) => Number.isFinite(day) && day > 0 && !existingDays.has(day))
    .sort((a, b) => a - b)
    .map((day) => buildReminderEntry(day));
  taskReminderExistingList.innerHTML = "";
  if (!reminders.length && !pendingEntries.length) {
    taskReminderExistingWrap.classList.add("hidden");
    return;
  }
  reminders.forEach((entry) => {
    const row = document.createElement("div");
    row.className =
      "task-reminder-row flex items-center justify-between gap-2 rounded-lg border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300";
    row.setAttribute("data-test-skedpal", "task-reminder-existing-item");
    const label = document.createElement("span");
    label.textContent = buildReminderLabel(entry);
    label.setAttribute("data-test-skedpal", "task-reminder-existing-label");
    row.appendChild(label);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "task-reminder-remove-btn";
    removeBtn.dataset.reminderRemoveId = entry.id;
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("data-test-skedpal", "task-reminder-remove");
    row.appendChild(removeBtn);
    if (entry.dismissedAt) {
      const dismissed = document.createElement("span");
      dismissed.className = "text-slate-500";
      dismissed.textContent = "Dismissed";
      dismissed.setAttribute("data-test-skedpal", "task-reminder-existing-dismissed");
      row.appendChild(dismissed);
    }
    taskReminderExistingList.appendChild(row);
  });
  pendingEntries.forEach((entry) => {
    const row = document.createElement("div");
    row.className =
      "task-reminder-row task-reminder-row--pending flex items-center justify-between gap-2 rounded-lg border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300";
    row.setAttribute("data-test-skedpal", "task-reminder-pending-item");
    const label = document.createElement("span");
    label.textContent = buildReminderLabel(entry);
    label.setAttribute("data-test-skedpal", "task-reminder-pending-label");
    row.appendChild(label);
    const badge = document.createElement("span");
    badge.className = "task-reminder-pending-badge";
    badge.textContent = "Pending";
    badge.setAttribute("data-test-skedpal", "task-reminder-pending-badge");
    row.appendChild(badge);
    taskReminderExistingList.appendChild(row);
  });
  taskReminderExistingWrap.classList.remove("hidden");
}

function resetReminderSelection() {
  selectedDays.clear();
  syncSelectedDayButtons();
}

function getReminderTargetTask() {
  if (!reminderTargetId) {return null;}
  return state.tasksCache.find((entry) => entry.id === reminderTargetId) || null;
}

function refreshReminderPreview() {
  const task = getReminderTargetTask();
  if (!task) {return;}
  renderExistingReminders(task);
}

function closeTaskReminderModal() {
  const { taskReminderModal } = domRefs;
  if (taskReminderModal) {taskReminderModal.classList.add("hidden");}
  document.body.classList.remove("modal-open");
  reminderTargetId = "";
  resetReminderSelection();
}

export function openTaskReminderModal(taskId) {
  const { taskReminderModal, taskReminderCustomInput } = domRefs;
  if (!taskReminderModal) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return;}
  reminderTargetId = taskId;
  ensureReminderButtons();
  resetReminderSelection();
  renderExistingReminders(task);
  if (taskReminderCustomInput) {
    taskReminderCustomInput.value = "";
  }
  taskReminderModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => {
    taskReminderCustomInput?.focus?.();
  }, 50);
}

function handleReminderOverlayClick(event) {
  if (event.target === domRefs.taskReminderModal) {
    closeTaskReminderModal();
  }
}

function handleReminderKeydown(event) {
  if (event.key === "Escape") {
    closeTaskReminderModal();
  }
}

function handleReminderDayClick(event) {
  const btn = event.target.closest("[data-reminder-day]");
  if (!btn) {return;}
  const day = Number(btn.dataset.reminderDay);
  if (!Number.isFinite(day) || day <= 0) {return;}
  if (selectedDays.has(day)) {
    selectedDays.delete(day);
  } else {
    selectedDays.add(day);
  }
  syncSelectedDayButtons();
  refreshReminderPreview();
}

function handleReminderCustomAdd() {
  const { taskReminderCustomInput } = domRefs;
  if (!taskReminderCustomInput) {return;}
  const day = Number(taskReminderCustomInput.value);
  if (!Number.isFinite(day) || day <= 0) {return;}
  selectedDays.add(day);
  taskReminderCustomInput.value = "";
  syncSelectedDayButtons();
  refreshReminderPreview();
}

async function handleReminderRemoveClick(event) {
  const btn = event.target.closest("[data-reminder-remove-id]");
  if (!btn || !reminderTargetId) {return;}
  const reminderId = btn.dataset.reminderRemoveId || "";
  if (!reminderId) {return;}
  const task = state.tasksCache.find((entry) => entry.id === reminderTargetId);
  if (!task) {return;}
  const { reminders, removed } = removeReminderEntry(task.reminders || [], reminderId);
  if (!removed) {return;}
  await saveTask({ ...task, reminders });
  await reloadTasks();
  const updatedTask = state.tasksCache.find((entry) => entry.id === reminderTargetId);
  renderExistingReminders(updatedTask);
}

function buildUpdatedTask(task, daysToAdd) {
  const now = new Date();
  const existing = normalizeReminders(task.reminders || []);
  const existingDays = new Set(
    existing.filter((entry) => !entry.dismissedAt).map((entry) => entry.days)
  );
  const additions = daysToAdd
    .filter((day) => !existingDays.has(day))
    .map((day) => buildReminderEntry(day, now));
  if (!additions.length) {return { task, changed: false };}
  return {
    task: {
      ...task,
      reminders: [...existing, ...additions]
    },
    changed: true
  };
}

async function handleReminderSave() {
  if (!reminderTargetId) {
    closeTaskReminderModal();
    return;
  }
  const task = state.tasksCache.find((entry) => entry.id === reminderTargetId);
  if (!task) {
    closeTaskReminderModal();
    return;
  }
  const daysToAdd = Array.from(selectedDays).sort((a, b) => a - b);
  if (!daysToAdd.length) {
    closeTaskReminderModal();
    return;
  }
  const { task: updated, changed } = buildUpdatedTask(task, daysToAdd);
  if (changed) {
    await saveTask(updated);
    await reloadTasks();
  }
  closeTaskReminderModal();
}

export async function dismissOverdueTaskReminders(taskId) {
  if (!taskId) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return;}
  const overdue = getOverdueReminders(task);
  if (!overdue.length) {return;}
  const nowIso = new Date().toISOString();
  const reminders = normalizeReminders(task.reminders || []).map((entry) =>
    overdue.find((overdueEntry) => overdueEntry.id === entry.id)
      ? { ...entry, dismissedAt: nowIso }
      : entry
  );
  await saveTask({ ...task, reminders });
  await reloadTasks();
}

export function initTaskReminderModal() {
  const {
    taskReminderModal,
    taskReminderDays,
    taskReminderCustomAdd,
    taskReminderExistingList,
    taskReminderSaveBtn,
    taskReminderCloseButtons
  } = domRefs;
  if (!taskReminderModal) {return;}
  if (taskReminderModal.dataset.modalReady === "true") {return;}
  taskReminderModal.dataset.modalReady = "true";
  taskReminderModal.addEventListener("click", handleReminderOverlayClick);
  taskReminderDays?.addEventListener("click", handleReminderDayClick);
  taskReminderCustomAdd?.addEventListener("click", handleReminderCustomAdd);
  taskReminderExistingList?.addEventListener("click", handleReminderRemoveClick);
  taskReminderSaveBtn?.addEventListener("click", handleReminderSave);
  taskReminderCloseButtons.forEach((btn) => btn.addEventListener("click", closeTaskReminderModal));
  document.addEventListener("keydown", handleReminderKeydown);
  reminderModalCleanup = () => {
    taskReminderModal.removeEventListener("click", handleReminderOverlayClick);
    taskReminderDays?.removeEventListener("click", handleReminderDayClick);
    taskReminderCustomAdd?.removeEventListener("click", handleReminderCustomAdd);
    taskReminderExistingList?.removeEventListener("click", handleReminderRemoveClick);
    taskReminderSaveBtn?.removeEventListener("click", handleReminderSave);
    taskReminderCloseButtons.forEach((btn) =>
      btn.removeEventListener("click", closeTaskReminderModal)
    );
    document.removeEventListener("keydown", handleReminderKeydown);
    taskReminderModal.dataset.modalReady = "false";
  };
}

export function cleanupTaskReminderModal() {
  if (!reminderModalCleanup) {return;}
  reminderModalCleanup();
  reminderModalCleanup = null;
}
