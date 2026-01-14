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
  valueEl.textContent = "";
  valueEl.classList.add("task-reminder-value");
  const label = document.createElement("span");
  label.textContent = `${countLabel} - next ${nextLabel}`;
  label.setAttribute("data-test-skedpal", "task-reminders-label");
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "task-reminder-clear-btn";
  clearBtn.dataset.clearReminders = task.id;
  clearBtn.textContent = "x";
  clearBtn.setAttribute("aria-label", "Clear reminders");
  clearBtn.setAttribute("data-test-skedpal", "task-reminder-clear");
  valueEl.appendChild(label);
  valueEl.appendChild(clearBtn);
  return item;
}
