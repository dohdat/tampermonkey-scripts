import { MS_PER_DAY } from "../constants.js";
import { uuid } from "../utils.js";

export function normalizeReminders(reminders = []) {
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

export function buildReminderEntry(days, now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const baseTime = nowDate.getTime();
  const safeNow = Number.isFinite(baseTime) ? nowDate : new Date();
  const remindAt = new Date(safeNow.getTime() + days * MS_PER_DAY).toISOString();
  return {
    id: uuid(),
    days,
    remindAt,
    createdAt: safeNow.toISOString(),
    dismissedAt: ""
  };
}

export function mergeReminderEntries(existingReminders = [], reminderDays = [], now = new Date()) {
  const existing = normalizeReminders(existingReminders);
  const normalizedDays = Array.isArray(reminderDays) ? reminderDays : [];
  const uniqueDays = [
    ...new Set(
      normalizedDays
        .map((day) => Number(day))
        .filter((day) => Number.isFinite(day) && day > 0)
    )
  ];
  if (!uniqueDays.length) {
    return { reminders: existing, added: false };
  }
  const existingDays = new Set(
    existing.filter((entry) => !entry.dismissedAt).map((entry) => entry.days)
  );
  const additions = uniqueDays
    .filter((day) => !existingDays.has(day))
    .map((day) => buildReminderEntry(day, now));
  if (!additions.length) {
    return { reminders: existing, added: false };
  }
  return { reminders: [...existing, ...additions], added: true };
}

export function removeReminderEntry(reminders = [], reminderId = "") {
  if (!Array.isArray(reminders)) {return { reminders: [], removed: false };}
  if (!reminderId) {return { reminders: [...reminders], removed: false };}
  const filtered = reminders.filter((entry) => entry?.id !== reminderId);
  return { reminders: filtered, removed: filtered.length !== reminders.length };
}
