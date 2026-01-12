export function buildReminderDetailItem({ task, buildDetailItemElement, formatDateTime, reminderIconSvg }) {
  const reminders = Array.isArray(task.reminders) ? task.reminders : [];
  const activeReminders = reminders.filter((entry) => !entry.dismissedAt);
  if (!activeReminders.length) {return null;}
  const nextReminder = [...activeReminders].sort((a, b) => {
    const aTime = new Date(a.remindAt).getTime();
    const bTime = new Date(b.remindAt).getTime();
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {return 0;}
    return aTime - bTime;
  })[0];
  const nextLabel = nextReminder?.remindAt
    ? formatDateTime(nextReminder.remindAt)
    : "Unknown time";
  const { item, valueEl } = buildDetailItemElement({
    key: "reminders",
    label: "Reminders",
    iconSvg: reminderIconSvg,
    valueTestId: "task-reminders"
  });
  const countLabel = `${activeReminders.length} reminder${activeReminders.length === 1 ? "" : "s"}`;
  valueEl.textContent = `${countLabel} - next ${nextLabel}`;
  return item;
}
