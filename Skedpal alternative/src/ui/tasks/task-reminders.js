import { saveTask } from "../../data/db.js";
import {
  HALF,
  MS_PER_DAY,
  MS_PER_SECOND,
  MINUTES_PER_HOUR,
  REMINDER_DAY_OPTIONS,
  REMINDER_PANEL_ANCHOR_OFFSET_PX,
  REMINDER_PANEL_FALLBACK_HEIGHT_PX,
  REMINDER_PANEL_FALLBACK_WIDTH_PX,
  REMINDER_PANEL_FOCUS_DELAY_MS,
  REMINDER_PANEL_PADDING_PX,
  SECONDS_PER_MINUTE,
  SORT_AFTER,
  SORT_BEFORE,
  domRefs
} from "../constants.js";
import { state } from "../state/page-state.js";
import { showNotificationBanner, hideNotificationBanner, showUndoBanner } from "../notifications.js";
import {
  buildReminderEntry,
  normalizeReminders,
  removeReminderEntry
} from "./task-reminders-helpers.js";

const DAY_MS = MS_PER_DAY;
const SECONDS_PER_DAY = DAY_MS / MS_PER_SECOND;
const reminderDayButtons = new Map();
const selectedDays = new Set();
let reminderTargetId = "";
let reminderModalCleanup = null;
let reminderAnchor = null;
let reminderZoomCleanup = null;
let reminderZoomTarget = null;

async function reloadTasks() {
  const { loadTasks } = await import("./tasks-actions.js");
  return loadTasks();
}

export function getOverdueReminders(task, now = new Date()) {
  if (task?.completed) {return [];}
  const reminders = normalizeReminders(task?.reminders || []);
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowTime)) {return [];}
  return reminders.filter((entry) => {
    if (entry.dismissedAt) {return false;}
    const remindTime = new Date(entry.remindAt).getTime();
    return Number.isFinite(remindTime) && remindTime <= nowTime;
  });
}

export function renderTaskReminderBadge(tasks = state.tasksCache) {
  const { taskReminderBadge } = domRefs;
  const overdueCount = (tasks || []).reduce(
    (total, task) => total + getOverdueReminders(task).length,
    0
  );
  if (taskReminderBadge) {
    taskReminderBadge.textContent = "";
    taskReminderBadge.classList.add("hidden");
  }
  const zoomTarget = overdueCount > 0 ? findOverdueReminderTarget(tasks) : null;
  renderReminderBanner(overdueCount, zoomTarget);
}

function findOverdueReminderTarget(tasks = []) {
  let bestTime = null;
  let bestTask = null;
  (tasks || []).forEach((task) => {
    const overdue = getOverdueReminders(task);
    overdue.forEach((entry) => {
      const time = Date.parse(entry.remindAt);
      if (!Number.isFinite(time)) {return;}
      if (bestTime === null || time < bestTime) {
        bestTime = time;
        bestTask = task;
      }
    });
  });
  if (!bestTask) {return null;}
  return {
    taskId: bestTask.id || "",
    sectionId: bestTask.section || "",
    subsectionId: bestTask.subsection || ""
  };
}

function getReminderBannerNodes() {
  return {
    banner: domRefs.notificationBanner,
    message: domRefs.notificationMessage,
    zoomButton: domRefs.notificationZoomButton,
    undoButton: domRefs.notificationUndoButton,
    closeButton: domRefs.notificationCloseButton
  };
}

function resetReminderBannerState() {
  state.reminderBannerActive = false;
  state.reminderBannerCount = 0;
  state.reminderBannerDismissedCount = 0;
}

function clearReminderZoomAction() {
  if (typeof reminderZoomCleanup === "function") {
    reminderZoomCleanup();
  }
  reminderZoomCleanup = null;
  reminderZoomTarget = null;
  const { notificationZoomButton } = domRefs;
  if (!notificationZoomButton) {return;}
  notificationZoomButton.classList.add("hidden");
}

function hideReminderBanner() {
  if (!state.reminderBannerActive) {return;}
  resetReminderBannerState();
  clearReminderZoomAction();
  hideNotificationBanner();
}

function shouldShowReminderBanner(overdueCount, bannerVisible) {
  if (overdueCount <= 0) {return false;}
  if (bannerVisible && !state.reminderBannerActive) {return false;}
  if (state.reminderBannerDismissedCount === overdueCount && !state.reminderBannerActive) {
    return false;
  }
  return true;
}

function dismissReminderBanner(overdueCount) {
  state.reminderBannerDismissedCount = overdueCount;
  state.reminderBannerActive = false;
  clearReminderZoomAction();
  hideNotificationBanner();
}

function showReminderBanner(overdueCount, nodes, zoomTarget) {
  const suffix = overdueCount === 1 ? "" : "s";
  showNotificationBanner(`You have ${overdueCount} overdue reminder${suffix}.`);
  state.reminderBannerActive = true;
  state.reminderBannerCount = overdueCount;
  if (nodes.undoButton) {
    nodes.undoButton.classList.add("hidden");
  }
  if (nodes.closeButton) {
    nodes.closeButton.onclick = () => {
      dismissReminderBanner(overdueCount);
    };
  }
  setReminderZoomAction(nodes.zoomButton, zoomTarget);
}

function renderReminderBanner(overdueCount, zoomTarget) {
  const nodes = getReminderBannerNodes();
  if (!nodes.banner || !nodes.message) {return;}
  if (overdueCount <= 0) {
    hideReminderBanner();
    return;
  }
  const bannerVisible = !nodes.banner.classList.contains("hidden");
  if (!shouldShowReminderBanner(overdueCount, bannerVisible)) {
    clearReminderZoomAction();
    return;
  }
  showReminderBanner(overdueCount, nodes, zoomTarget);
}

function setReminderZoomAction(button, target) {
  clearReminderZoomAction();
  if (!button || !target?.taskId) {return;}
  reminderZoomTarget = target;
  button.classList.remove("hidden");
  button.addEventListener("click", handleReminderZoomClick);
  reminderZoomCleanup = () => {
    button.removeEventListener("click", handleReminderZoomClick);
  };
}

async function handleReminderZoomClick() {
  if (!reminderZoomTarget?.taskId) {return;}
  const { setZoomFilter } = await import("../navigation.js");
  setZoomFilter({
    type: "task",
    taskId: reminderZoomTarget.taskId,
    sectionId: reminderZoomTarget.sectionId || "",
    subsectionId: reminderZoomTarget.subsectionId || ""
  });
}

function getSecondsAsDays(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {return null;}
  return value / SECONDS_PER_DAY;
}

function formatReminderOffsetLabel(days) {
  if (!Number.isFinite(days) || days <= 0) {return "Soon";}
  if (days < 1) {
    const totalSeconds = Math.max(1, Math.round(days * SECONDS_PER_DAY));
    if (totalSeconds < SECONDS_PER_MINUTE) {
      return `In ${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
    }
    const totalMinutes = Math.max(1, Math.round(totalSeconds / SECONDS_PER_MINUTE));
    if (totalMinutes < MINUTES_PER_HOUR) {
      return `In ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
    }
    const totalHours = Math.max(1, Math.round(totalMinutes / MINUTES_PER_HOUR));
    return `In ${totalHours} hour${totalHours === 1 ? "" : "s"}`;
  }
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

function buildReminderLabel(entry) {
  const date = new Date(entry.remindAt);
  const isValid = !Number.isNaN(date.getTime());
  const dateLabel = isValid ? date.toLocaleDateString() : "Unknown date";
  const timeLabel = isValid
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "Unknown time";
  return `${formatReminderOffsetLabel(entry.days)} at ${dateLabel} ${timeLabel}`;
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
    if (aDismissed !== bDismissed) {return aDismissed ? SORT_AFTER : SORT_BEFORE;}
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
  reminderAnchor = null;
  resetReminderPanelPosition();
  resetReminderSelection();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getReminderPanel() {
  const { taskReminderModal } = domRefs;
  return taskReminderModal?.querySelector?.('[data-test-skedpal="task-reminder-panel"]') || null;
}

function resetReminderPanelPosition() {
  const panel = getReminderPanel();
  if (!panel) {return;}
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.right = "";
  panel.style.transform = "";
  panel.style.margin = "";
}

function resolveAnchorFromEvent(event) {
  if (!event) {return null;}
  const { clientX, clientY } = event;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { x: clientX, y: clientY };
  }
  const hasHTMLElement = typeof HTMLElement !== "undefined";
  const target = hasHTMLElement && event.target instanceof HTMLElement ? event.target : null;
  const rect = target?.getBoundingClientRect?.();
  if (!rect) {return null;}
  return { x: rect.left + rect.width * HALF, y: rect.top + rect.height * HALF };
}

function applyReminderPanelPosition(anchor) {
  const panel = getReminderPanel();
  if (!panel || !anchor) {return;}
  const rect = panel.getBoundingClientRect();
  const panelWidth = rect.width || REMINDER_PANEL_FALLBACK_WIDTH_PX;
  const panelHeight = rect.height || REMINDER_PANEL_FALLBACK_HEIGHT_PX;
  const maxLeft = window.innerWidth - panelWidth - REMINDER_PANEL_PADDING_PX;
  const maxTop = window.innerHeight - panelHeight - REMINDER_PANEL_PADDING_PX;
  const left = clamp(
    anchor.x - panelWidth * HALF,
    REMINDER_PANEL_PADDING_PX,
    Math.max(REMINDER_PANEL_PADDING_PX, maxLeft)
  );
  const top = clamp(
    anchor.y - REMINDER_PANEL_ANCHOR_OFFSET_PX,
    REMINDER_PANEL_PADDING_PX,
    Math.max(REMINDER_PANEL_PADDING_PX, maxTop)
  );
  panel.style.position = "fixed";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.right = "auto";
  panel.style.transform = "translate(0, 0)";
  panel.style.margin = "0";
}

export function openTaskReminderModal(taskId, options = {}) {
  const { taskReminderModal, taskReminderCustomInput } = domRefs;
  if (!taskReminderModal) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return;}
  reminderTargetId = taskId;
  reminderAnchor = resolveAnchorFromEvent(options.event);
  ensureReminderButtons();
  resetReminderSelection();
  renderExistingReminders(task);
  if (taskReminderCustomInput) {
    taskReminderCustomInput.value = "";
  }
  taskReminderModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  resetReminderPanelPosition();
  requestAnimationFrame(() => {
    applyReminderPanelPosition(reminderAnchor);
  });
  setTimeout(() => {
    taskReminderCustomInput?.focus?.();
  }, REMINDER_PANEL_FOCUS_DELAY_MS);
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
  const btn = event.target.closest("[data-reminder-day], [data-reminder-seconds]");
  if (!btn) {return;}
  const seconds = btn.dataset.reminderSeconds;
  const day = seconds ? getSecondsAsDays(seconds) : Number(btn.dataset.reminderDay);
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

export async function clearTaskReminders(taskId) {
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return false;}
  const reminders = Array.isArray(task.reminders) ? task.reminders : [];
  if (!reminders.length) {return false;}
  const snapshot = JSON.parse(JSON.stringify(task));
  await saveTask({ ...task, reminders: [] });
  await reloadTasks();
  const name = task.title || "Untitled task";
  showUndoBanner(`Cleared reminders for "${name}".`, async () => {
    await saveTask(snapshot);
    await reloadTasks();
  });
  return true;
}
