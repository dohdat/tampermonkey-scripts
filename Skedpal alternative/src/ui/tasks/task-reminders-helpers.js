export function removeReminderEntry(reminders = [], reminderId = "") {
  if (!Array.isArray(reminders)) {return { reminders: [], removed: false };}
  if (!reminderId) {return { reminders: [...reminders], removed: false };}
  const filtered = reminders.filter((entry) => entry?.id !== reminderId);
  return { reminders: filtered, removed: filtered.length !== reminders.length };
}
