import {
  DEFAULT_SCHEDULING_HORIZON_DAYS,
  GOOGLE_CALENDAR_SYNC_MIN_DAYS
} from "./constants.js";
import { normalizeHorizonDays } from "./utils.js";
import { state } from "./state/page-state.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";

function getMaxSyncDays() {
  const horizon = Number(state.settingsCache?.schedulingHorizonDays);
  return Number.isFinite(horizon) && horizon > 0 ? horizon : DEFAULT_SCHEDULING_HORIZON_DAYS;
}

function normalizeSyncDays(value) {
  const maxSyncDays = getMaxSyncDays();
  return normalizeHorizonDays(
    value,
    GOOGLE_CALENDAR_SYNC_MIN_DAYS,
    maxSyncDays,
    maxSyncDays
  );
}

function buildCalendarSyncToggle(entry, calendarTaskSettings) {
  const syncToggleLabel = document.createElement("label");
  syncToggleLabel.className = "flex items-center gap-2";
  syncToggleLabel.setAttribute("data-test-skedpal", "google-calendar-sync-toggle-label");

  const syncToggle = document.createElement("input");
  syncToggle.type = "checkbox";
  syncToggle.className = "h-4 w-4 accent-lime-400";
  syncToggle.dataset.calendarSyncToggle = "true";
  syncToggle.dataset.calendarId = entry.id || "";
  syncToggle.checked = Boolean(calendarTaskSettings.syncScheduledEvents);
  syncToggle.setAttribute("data-test-skedpal", "google-calendar-sync-toggle");

  const syncToggleText = document.createElement("span");
  syncToggleText.textContent = "Sync scheduled events to this calendar";
  syncToggleText.setAttribute("data-test-skedpal", "google-calendar-sync-toggle-text");

  syncToggleLabel.appendChild(syncToggle);
  syncToggleLabel.appendChild(syncToggleText);
  return syncToggleLabel;
}

function buildCalendarSyncDaysField(entry, calendarTaskSettings) {
  const daysField = document.createElement("label");
  daysField.className = "flex flex-col gap-1";
  daysField.setAttribute("data-test-skedpal", "google-calendar-sync-days-field");
  daysField.dataset.calendarSyncDaysField = "true";
  const daysLabel = document.createElement("span");
  daysLabel.className = "text-[11px] uppercase tracking-wide text-slate-500";
  daysLabel.textContent = "Sync window (days)";
  daysLabel.setAttribute("data-test-skedpal", "google-calendar-sync-days-label");
  const daysInput = document.createElement("input");
  daysInput.type = "number";
  daysInput.min = String(GOOGLE_CALENDAR_SYNC_MIN_DAYS);
  daysInput.max = String(getMaxSyncDays());
  daysInput.className =
    "w-full rounded-lg border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-100 focus:border-lime-400 focus:outline-none";
  daysInput.value = String(normalizeSyncDays(calendarTaskSettings.syncDays));
  daysInput.dataset.calendarSyncDays = "true";
  daysInput.dataset.calendarId = entry.id || "";
  daysInput.setAttribute("data-test-skedpal", "google-calendar-sync-days-input");

  daysField.appendChild(daysLabel);
  daysField.appendChild(daysInput);
  return daysField;
}

function setCalendarSyncControlsEnabled(row, enabled) {
  if (!row) {return;}
  const daysField = row.querySelector?.("[data-calendar-sync-days-field]");
  if (daysField) {
    daysField.classList.toggle("hidden", !enabled);
    daysField.setAttribute("aria-hidden", enabled ? "false" : "true");
  }
  const inputs = row.querySelectorAll("input[data-calendar-sync-days]");
  inputs.forEach((input) => {
    if (!input) {return;}
    input.disabled = !enabled;
    input.classList.toggle("opacity-60", !enabled);
  });
}

function handleCalendarSyncToggleChange(target, updateCalendarTaskSettings) {
  const calendarId = target?.dataset?.calendarId || "";
  const row = target?.closest?.("[data-calendar-id]");
  setCalendarSyncControlsEnabled(row, Boolean(target?.checked));
  updateCalendarTaskSettings(calendarId, { syncScheduledEvents: Boolean(target?.checked) });
  invalidateExternalEventsCache();
}

function handleCalendarSyncDaysChange(target, updateCalendarTaskSettings) {
  const calendarId = target?.dataset?.calendarId || "";
  const days = normalizeSyncDays(target?.value);
  target.value = String(days);
  updateCalendarTaskSettings(calendarId, { syncDays: days });
}

function resolveCalendarSyncToggleTarget(target) {
  if (!target) {return null;}
  if (target.matches?.("input[data-calendar-sync-toggle]")) {return target;}
  const label = target.closest?.("[data-test-skedpal='google-calendar-sync-toggle-label']");
  if (!label) {return null;}
  return label.querySelector?.("input[data-calendar-sync-toggle]") || null;
}

export {
  buildCalendarSyncDaysField,
  buildCalendarSyncToggle,
  getMaxSyncDays,
  handleCalendarSyncDaysChange,
  handleCalendarSyncToggleChange,
  resolveCalendarSyncToggleTarget,
  setCalendarSyncControlsEnabled
};
