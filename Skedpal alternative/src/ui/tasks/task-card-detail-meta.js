import { DEFAULT_TASK_REPEAT, TASK_REPEAT_NONE, reminderIconSvg } from "../constants.js";
import { applyPrioritySelectColor, formatDateTime } from "../utils.js";
import { buildReminderDetailItem } from "./task-card-details.js";
import {
  buildDeadlineDetailItem,
  buildDurationDetailItem,
  buildPriorityDetailItem,
  buildRepeatDetailItem,
  buildStartFromDetailItem,
  buildTimeMapDetailItem
} from "./task-card-detail-edit.js";
import { updateTaskDetailField } from "./task-detail-updates.js";

export const detailClockIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"></circle><path d="M10 6v4l2.5 2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const detailFlagIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3v14" stroke-linecap="round"></path><path d="M4 4h9l-1.5 3L13 10H4" stroke-linejoin="round"></path></svg>`;
export const detailStackIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="12" height="4" rx="1.5"></rect><rect x="4" y="11" width="12" height="4" rx="1.5"></rect></svg>`;
export const detailGaugeIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13a6 6 0 1 1 12 0" stroke-linecap="round"></path><path d="M10 8l3 3" stroke-linecap="round"></path><circle cx="10" cy="13" r="1"></circle></svg>`;
export const detailMapIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5l4-2 4 2 4-2v12l-4 2-4-2-4 2V5Z" stroke-linejoin="round"></path><path d="M8 3v12M12 5v12" stroke-linecap="round"></path></svg>`;
export const detailRepeatIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8a6 6 0 0 1 10-2" stroke-linecap="round"></path><path d="M14 3v3h-3" stroke-linecap="round" stroke-linejoin="round"></path><path d="M16 12a6 6 0 0 1-10 2" stroke-linecap="round"></path><path d="M6 17v-3h3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

export function buildDetailItemElement({ key, label, iconSvg, extraClass = "", valueTestId }) {
  const item = document.createElement("div");
  item.className = extraClass ? `task-details__item ${extraClass}` : "task-details__item";
  item.setAttribute("data-test-skedpal", `task-detail-${key}`);

  const icon = document.createElement("span");
  icon.className = "task-details__icon";
  icon.setAttribute("data-test-skedpal", `task-detail-${key}-icon`);
  icon.innerHTML = iconSvg;

  const content = document.createElement("div");
  content.className = "task-details__content";
  content.setAttribute("data-test-skedpal", `task-detail-${key}-content`);

  const labelEl = document.createElement("span");
  labelEl.className = "task-details__label";
  labelEl.setAttribute("data-test-skedpal", `task-detail-${key}-label`);
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "task-details__value";
  valueEl.setAttribute(
    "data-test-skedpal",
    valueTestId || `task-detail-${key}-value`
  );

  content.appendChild(labelEl);
  content.appendChild(valueEl);
  item.appendChild(icon);
  item.appendChild(content);

  return { item, valueEl };
}

function appendReminderDetailItem(meta, task) {
  const reminderItem = buildReminderDetailItem({
    task,
    buildDetailItemElement,
    formatDateTime,
    reminderIconSvg
  });
  if (reminderItem) {
    meta.appendChild(reminderItem);
  }
}

function appendDeadlineDetailItem(meta, task, cleanupFns, disableInteractions) {
  if (!task.deadline) {return;}
  const deadlineDetail = buildDeadlineDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailFlagIconSvg,
    formatDateTime,
    onClear: () => updateTaskDetailField(task, { deadline: null }),
    disableInteractions
  });
  if (deadlineDetail.item) {
    meta.appendChild(deadlineDetail.item);
    if (!disableInteractions) {
      cleanupFns.push(deadlineDetail.cleanup);
    }
  }
}

function appendStartFromDetailItem(meta, task, cleanupFns, disableInteractions) {
  if (!task.startFrom) {return;}
  const startFromDetail = buildStartFromDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailClockIconSvg,
    formatDateTime,
    onClear: () => updateTaskDetailField(task, { startFrom: null }),
    disableInteractions
  });
  if (startFromDetail.item) {
    meta.appendChild(startFromDetail.item);
    if (!disableInteractions) {
      cleanupFns.push(startFromDetail.cleanup);
    }
  }
}

function appendMinBlockDetailItem(meta, task) {
  if (!task.minBlockMin) {return;}
  const { item, valueEl } = buildDetailItemElement({
    key: "min-block",
    label: "Min",
    iconSvg: detailStackIconSvg,
    valueTestId: "task-min-block"
  });
  valueEl.textContent = `${task.minBlockMin}m`;
  meta.appendChild(item);
}

function appendDurationDetailItem(meta, task, cleanupFns, disableInteractions) {
  const durationDetail = buildDurationDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailClockIconSvg,
    onUpdate: (updates) => updateTaskDetailField(task, updates),
    disableInteractions
  });
  meta.appendChild(durationDetail.item);
  if (!disableInteractions) {
    cleanupFns.push(durationDetail.cleanup);
  }
}

function appendPriorityDetailItem(meta, task, cleanupFns, disableInteractions) {
  const priorityDetail = buildPriorityDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailGaugeIconSvg,
    applyPrioritySelectColor,
    onUpdate: (updates) => updateTaskDetailField(task, updates),
    disableInteractions
  });
  meta.appendChild(priorityDetail.item);
  if (!disableInteractions) {
    cleanupFns.push(priorityDetail.cleanup);
  }
}

function appendTimeMapsDetailItem(meta, task, timeMapOptions, cleanupFns, disableInteractions) {
  const timeMapsDetail = buildTimeMapDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailMapIconSvg,
    timeMapOptions,
    onUpdate: (updates) => updateTaskDetailField(task, updates),
    disableInteractions
  });
  meta.appendChild(timeMapsDetail.item);
  if (!disableInteractions) {
    cleanupFns.push(timeMapsDetail.cleanup);
  }
}

function appendRepeatDetailItem(meta, task, repeatSummary, cleanupFns, disableInteractions) {
  const isRepeating = task.repeat && task.repeat.type !== TASK_REPEAT_NONE;
  const repeatDetail = buildRepeatDetailItem({
    buildDetailItemElement,
    iconSvg: detailRepeatIconSvg,
    repeatSummary,
    isRepeating,
    onClear: () => updateTaskDetailField(task, { repeat: { ...DEFAULT_TASK_REPEAT } }),
    disableInteractions
  });
  meta.appendChild(repeatDetail.item);
  if (!disableInteractions) {
    cleanupFns.push(repeatDetail.cleanup);
  }
}

export function buildTaskMeta(task, timeMapOptions, repeatSummary, { disableInteractions = false } = {}) {
  const meta = document.createElement("div");
  meta.className = "task-details__grid";
  meta.setAttribute("data-test-skedpal", "task-meta");
  const cleanupFns = [];
  appendReminderDetailItem(meta, task);
  appendDeadlineDetailItem(meta, task, cleanupFns, disableInteractions);
  appendStartFromDetailItem(meta, task, cleanupFns, disableInteractions);
  appendMinBlockDetailItem(meta, task);
  appendDurationDetailItem(meta, task, cleanupFns, disableInteractions);
  appendPriorityDetailItem(meta, task, cleanupFns, disableInteractions);
  appendTimeMapsDetailItem(meta, task, timeMapOptions, cleanupFns, disableInteractions);
  appendRepeatDetailItem(meta, task, repeatSummary, cleanupFns, disableInteractions);
  return {
    meta,
    cleanup: () => {
      cleanupFns.forEach((fn) => fn());
    }
  };
}
