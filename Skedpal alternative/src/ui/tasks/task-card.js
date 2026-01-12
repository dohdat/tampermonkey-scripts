import {
  TASK_REPEAT_NONE,
  caretDownIconSvg,
  caretRightIconSvg,
  checkboxCheckedIconSvg,
  checkboxIconSvg,
  calendarIconSvg,
  duplicateIconSvg,
  editIconSvg,
  outOfRangeIconSvg,
  plusIconSvg,
  reminderIconSvg,
  removeIconSvg,
  TWO,
  TASK_CHILD_INDENT_PX,
  unscheduledIconSvg,
  zoomInIconSvg
} from "../constants.js";
import { formatDateTime, formatDurationShort } from "../utils.js";
import { getRepeatSummary } from "../repeat.js";
import { themeColors } from "../theme.js";
import { getOverdueReminders } from "./task-reminders.js";
import { applyTaskBackgroundStyle } from "./task-card-styles.js";
import { buildReminderDetailItem } from "./task-card-details.js";

const detailClockIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"></circle><path d="M10 6v4l2.5 2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const detailFlagIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3v14" stroke-linecap="round"></path><path d="M4 4h9l-1.5 3L13 10H4" stroke-linejoin="round"></path></svg>`;
const detailStackIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="12" height="4" rx="1.5"></rect><rect x="4" y="11" width="12" height="4" rx="1.5"></rect></svg>`;
const detailGaugeIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13a6 6 0 1 1 12 0" stroke-linecap="round"></path><path d="M10 8l3 3" stroke-linecap="round"></path><circle cx="10" cy="13" r="1"></circle></svg>`;
const detailMapIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5l4-2 4 2 4-2v12l-4 2-4-2-4 2V5Z" stroke-linejoin="round"></path><path d="M8 3v12M12 5v12" stroke-linecap="round"></path></svg>`;
const detailRepeatIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8a6 6 0 0 1 10-2" stroke-linecap="round"></path><path d="M14 3v3h-3" stroke-linecap="round" stroke-linejoin="round"></path><path d="M16 12a6 6 0 0 1-10 2" stroke-linecap="round"></path><path d="M6 17v-3h3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
function buildTitleMarkup(task) {
  if (!task.link) {
    return task.title;
  }
  return `<a href="${task.link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-lime-300 hover:text-lime-200 underline decoration-lime-400">
          <span>${task.title}</span>
        </a>`;
}

function applyTaskCardBaseStyles(taskCard, task, depth, timeMapById, options = {}) {
  const isSubtask = depth > 0;
  const dataTest = options.dataTest || "task-card";
  taskCard.className = "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow";
  taskCard.setAttribute("data-test-skedpal", dataTest);
  taskCard.dataset.taskId = task.id;
  taskCard.dataset.sectionId = task.section || "";
  taskCard.dataset.subsectionId = task.subsection || "";
  taskCard.tabIndex = 0;
  taskCard.style.minHeight = "fit-content";
  taskCard.style.padding = "5px";
  if (isSubtask) {
    taskCard.style.marginLeft = `${depth * TASK_CHILD_INDENT_PX}px`;
    taskCard.style.borderStyle = "dashed";
  }
  applyTaskBackgroundStyle(taskCard, task, timeMapById);
}

function buildTaskTitleText(task, titleMarkup, isSubtask) {
  const titleTextWrap = document.createElement("div");
  titleTextWrap.className = "task-title-text";
  titleTextWrap.setAttribute("data-test-skedpal", "task-title");
  if (isSubtask) {
    titleTextWrap.classList.add("task-title-text--subtask");
  }
  titleTextWrap.innerHTML = titleMarkup;
  if (task.completed) {
    titleTextWrap.style.opacity = "0.8";
    titleTextWrap.style.textDecoration = "line-through";
    titleTextWrap.style.textDecorationColor = themeColors.green500;
  }
  return titleTextWrap;
}

function buildTaskCollapseButton(task, isCollapsed) {
  const collapseTaskBtn = document.createElement("button");
  collapseTaskBtn.type = "button";
  collapseTaskBtn.dataset.toggleTaskCollapse = task.id;
  collapseTaskBtn.className = "title-icon-btn";
  collapseTaskBtn.title = "Expand/collapse subtasks";
  collapseTaskBtn.setAttribute("data-test-skedpal", "task-collapse-btn");
  collapseTaskBtn.innerHTML = isCollapsed ? caretRightIconSvg : caretDownIconSvg;
  return collapseTaskBtn;
}

function buildTaskCompleteButton(task) {
  const completeBtn = document.createElement("button");
  completeBtn.type = "button";
  completeBtn.dataset.completeTask = task.id;
  completeBtn.className = "title-icon-btn task-complete-btn";
  completeBtn.setAttribute("data-test-skedpal", "task-complete-btn");
  completeBtn.title = task.completed ? "Mark incomplete" : "Mark completed";
  completeBtn.innerHTML = task.completed ? checkboxCheckedIconSvg : checkboxIconSvg;
  if (task.completed) {
    completeBtn.classList.add("task-complete-btn--checked");
  }
  return completeBtn;
}

function buildTitleWrap(task, options) {
  const {
    hasChildren,
    isCollapsed,
    isSubtask,
    titleMarkup,
    detailsOpen,
    displayDurationMin
  } = options;
  const titleWrap = document.createElement("h3");
  const titleWeightClass = hasChildren ? "font-semibold" : "font-normal";
  const titleSizeClass = isSubtask ? "text-sm" : "text-base";
  titleWrap.className = `task-title-main ${titleSizeClass} ${titleWeightClass}`;
  titleWrap.setAttribute("data-test-skedpal", "task-title-wrap");
  if (hasChildren) {
    titleWrap.appendChild(buildTaskCollapseButton(task, isCollapsed));
  }
  titleWrap.appendChild(buildTaskCompleteButton(task));
  titleWrap.appendChild(buildTaskTitleText(task, titleMarkup, isSubtask));
  return { titleWrap, displayDurationMin, detailsOpen };
}

function buildMenuToggleButton(taskId) {
  const menuToggleBtn = document.createElement("button");
  menuToggleBtn.type = "button";
  menuToggleBtn.dataset.taskMenuToggle = taskId;
  menuToggleBtn.className = "title-icon-btn";
  menuToggleBtn.title = "More actions";
  menuToggleBtn.setAttribute("aria-label", "More actions");
  menuToggleBtn.setAttribute("data-test-skedpal", "task-actions-menu-toggle");
  menuToggleBtn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><circle cx="4" cy="10" r="1.6"></circle><circle cx="10" cy="10" r="1.6"></circle><circle cx="16" cy="10" r="1.6"></circle></svg>`;
  return menuToggleBtn;
}

function buildTaskActionButton({ label, dataset, iconSvg, testAttr, color }) {
  const btn = document.createElement("button");
  btn.type = "button";
  Object.entries(dataset || {}).forEach(([key, value]) => {
    btn.dataset[key] = value;
  });
  btn.className =
    "flex w-full items-center gap-2 rounded-lg border-slate-800 px-2 py-1 text-left text-xs text-slate-200 hover:border-lime-400";
  btn.title = label;
  btn.setAttribute("data-test-skedpal", testAttr);
  btn.innerHTML = `${iconSvg}<span>${label}</span>`;
  if (color) {
    btn.style.borderColor = color;
    btn.style.color = color;
  }
  return btn;
}

function buildTaskActionsMenu(task) {
  const menu = document.createElement("div");
  menu.className =
    "task-actions-menu absolute left-0 top-full z-20 mt-2 hidden w-44 rounded-xl border-slate-800 bg-slate-950/90 p-2 text-xs text-slate-200 shadow-lg";
  menu.dataset.taskMenu = task.id;
  menu.setAttribute("data-test-skedpal", "task-actions-menu");
  const menuItems = [
    buildTaskActionButton({
      taskId: task.id,
      label: "Zoom (Z)",
      dataset: {
        zoomTask: task.id,
        zoomSection: task.section || "",
        zoomSubsection: task.subsection || ""
      },
      iconSvg: zoomInIconSvg,
      testAttr: "task-menu-zoom"
    }),
    buildTaskActionButton({
      taskId: task.id,
      label: "Add subtask (A)",
      dataset: { addSubtask: task.id },
      iconSvg: plusIconSvg,
      testAttr: "task-menu-add-subtask"
    }),
    buildTaskActionButton({
      taskId: task.id,
      label: "Duplicate (D)",
      dataset: { duplicateTask: task.id },
      iconSvg: duplicateIconSvg,
      testAttr: "task-menu-duplicate",
      color: themeColors.blue500
    }),
    buildTaskActionButton({
      taskId: task.id,
      label: "Remind me (R)",
      dataset: { remindTask: task.id },
      iconSvg: reminderIconSvg,
      testAttr: "task-menu-remind",
      color: themeColors.amber400
    }),
    buildTaskActionButton({
      taskId: task.id,
      label: "Edit (E)",
      dataset: { edit: task.id },
      iconSvg: editIconSvg,
      testAttr: "task-menu-edit",
      color: themeColors.green500
    }),
    buildTaskActionButton({
      taskId: task.id,
      label: "Delete (X)",
      dataset: { delete: task.id },
      iconSvg: removeIconSvg,
      testAttr: "task-menu-delete",
      color: themeColors.orange500
    })
  ];
  menuItems.forEach((btn) => menu.appendChild(btn));
  return menu;
}

function buildDetailsToggleButton(taskId, detailsOpen) {
  const detailsToggleBtn = document.createElement("button");
  detailsToggleBtn.type = "button";
  detailsToggleBtn.dataset.toggleTaskDetails = taskId;
  detailsToggleBtn.className = "title-icon-btn";
  detailsToggleBtn.title = detailsOpen ? "Hide details" : "Show details";
  detailsToggleBtn.setAttribute("aria-label", detailsOpen ? "Hide details" : "Show details");
  detailsToggleBtn.setAttribute("data-test-skedpal", "task-details-toggle");
  detailsToggleBtn.innerHTML = detailsOpen ? caretDownIconSvg : caretRightIconSvg;
  return detailsToggleBtn;
}

function buildTaskTitleActions(task, detailsOpen) {
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "task-actions-wrap relative";
  actionsWrap.setAttribute("data-test-skedpal", "task-actions-wrap");
  const titleActions = document.createElement("div");
  titleActions.className = "title-actions task-title-actions";
  titleActions.setAttribute("data-test-skedpal", "task-title-actions");
  const menuWrap = document.createElement("div");
  menuWrap.className = "relative inline-flex";
  menuWrap.setAttribute("data-test-skedpal", "task-actions-menu-wrap");
  const menuToggleBtn = buildMenuToggleButton(task.id);
  const detailsToggleBtn = buildDetailsToggleButton(task.id, detailsOpen);
  const menu = buildTaskActionsMenu(task);
  menuWrap.appendChild(menuToggleBtn);
  menuWrap.appendChild(menu);
  titleActions.appendChild(menuWrap);
  titleActions.appendChild(detailsToggleBtn);
  actionsWrap.appendChild(titleActions);
  return actionsWrap;
}

function buildTaskDurationPill(displayDurationMin) {
  const durationPill = document.createElement("span");
  durationPill.className = "pill pill-muted";
  durationPill.setAttribute("data-test-skedpal", "task-duration");
  durationPill.textContent = formatDurationShort(displayDurationMin);
  return durationPill;
}

function buildDetailItemElement({ key, label, iconSvg, extraClass = "", valueTestId }) {
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

function shouldShowFutureStartIcon(task, now) {
  if (!task || task.completed) {return false;}
  if (task.scheduledStart) {return false;}
  if (!task.startFrom) {return false;}
  const startFrom = new Date(task.startFrom);
  if (Number.isNaN(startFrom.getTime())) {return false;}
  return startFrom > now;
}

function buildSummaryIconFlags(task, options) {
  const { hasChildren, now, context } = options;
  const isRepeating = task.repeat && task.repeat.type !== TASK_REPEAT_NONE;
  const suppressSummaryIcons = isRepeating && hasChildren;
  return {
    showFutureStartIcon: suppressSummaryIcons ? false : shouldShowFutureStartIcon(task, now),
    showOutOfRangeIcon: suppressSummaryIcons
      ? false
      : Boolean(context.firstOccurrenceOutOfRangeByTaskId?.get(task.id)),
    showUnscheduledIcon: suppressSummaryIcons
      ? false
      : Boolean(context.firstOccurrenceUnscheduledByTaskId?.get(task.id))
  };
}

function buildTaskSummaryRow(task, options = {}) {
  const {
    showOutOfRangeIcon = false,
    showUnscheduledIcon = false,
    showFutureStartIcon = false
  } = options;
  const summaryRow = document.createElement("div");
  summaryRow.className = "task-summary-row";
  summaryRow.setAttribute("data-test-skedpal", "task-summary-row");
  summaryRow.style.display = "flex";
  summaryRow.style.alignItems = "center";
  summaryRow.style.marginTop = "0";
  summaryRow.style.marginLeft = "auto";
  summaryRow.style.gap = "0.35rem";
  let hasContent = false;
  let viewCalendarBtn = null;
  if (task.scheduledStart) {
    const scheduledDate = new Date(task.scheduledStart);
    if (!Number.isNaN(scheduledDate)) {
      summaryRow.textContent = scheduledDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });
      hasContent = true;
      viewCalendarBtn = document.createElement("button");
      viewCalendarBtn.type = "button";
      viewCalendarBtn.className = "title-icon-btn task-summary-calendar";
      viewCalendarBtn.title = "View on calendar";
      viewCalendarBtn.dataset.viewCalendarTask = task.id;
      viewCalendarBtn.setAttribute("data-test-skedpal", "task-summary-view-calendar");
      viewCalendarBtn.innerHTML = calendarIconSvg;
    }
  }
  if (showOutOfRangeIcon) {
    const outOfRangeIcon = document.createElement("span");
    outOfRangeIcon.className = "title-icon-btn";
    outOfRangeIcon.title = "First occurrence is outside the scheduling horizon";
    outOfRangeIcon.setAttribute("data-test-skedpal", "task-summary-out-of-range");
    outOfRangeIcon.innerHTML = outOfRangeIconSvg;
    outOfRangeIcon.style.borderColor = themeColors.amber400;
    outOfRangeIcon.style.color = themeColors.amber400;
    outOfRangeIcon.style.cursor = "default";
    summaryRow.appendChild(outOfRangeIcon);
    hasContent = true;
  } else if (showFutureStartIcon) {
    const futureStartIcon = document.createElement("span");
    futureStartIcon.className = "title-icon-btn";
    futureStartIcon.title = "Starts in the future";
    futureStartIcon.setAttribute("data-test-skedpal", "task-summary-future-start");
    futureStartIcon.innerHTML = outOfRangeIconSvg;
    futureStartIcon.style.borderColor = themeColors.lime400;
    futureStartIcon.style.color = themeColors.lime400;
    futureStartIcon.style.cursor = "default";
    summaryRow.appendChild(futureStartIcon);
    hasContent = true;
  } else if (showUnscheduledIcon) {
    const unscheduledIcon = document.createElement("span");
    unscheduledIcon.className = "title-icon-btn";
    unscheduledIcon.title = "First occurrence is unscheduled";
    unscheduledIcon.setAttribute("data-test-skedpal", "task-summary-unscheduled");
    unscheduledIcon.innerHTML = unscheduledIconSvg;
    unscheduledIcon.style.borderColor = themeColors.red400;
    unscheduledIcon.style.color = themeColors.red400;
    unscheduledIcon.style.cursor = "default";
    summaryRow.appendChild(unscheduledIcon);
    hasContent = true;
  }
  if (viewCalendarBtn) {
    summaryRow.appendChild(viewCalendarBtn);
  }
  return hasContent ? summaryRow : null;
}

function buildTaskHeader(task, options) {
  const header = document.createElement("div");
  header.className = "task-title-row title-hover-group";
  const { titleWrap, displayDurationMin, detailsOpen } = buildTitleWrap(task, options);
  const actionsWrap = buildTaskTitleActions(task, detailsOpen);
  actionsWrap.style.flex = "1";
  actionsWrap.style.flexWrap = "wrap";
  actionsWrap.style.justifyContent = "flex-start";
  const durationPill = buildTaskDurationPill(displayDurationMin);
  if (actionsWrap.firstChild) {
    actionsWrap.insertBefore(durationPill, actionsWrap.firstChild);
  } else {
    actionsWrap.appendChild(durationPill);
  }
  if (!options.hideSummaryRow) {
    const summaryRow = buildTaskSummaryRow(task, {
      showOutOfRangeIcon: options.showOutOfRangeIcon,
      showUnscheduledIcon: options.showUnscheduledIcon,
      showFutureStartIcon: options.showFutureStartIcon
    });
    if (summaryRow) {
      actionsWrap.appendChild(summaryRow);
    }
  }
  header.appendChild(titleWrap);
  header.appendChild(actionsWrap);
  return header;
}

function applyTaskHeaderLayout(header) {
  if (!header || typeof window === "undefined") {return;}
  if (typeof window.requestAnimationFrame !== "function") {return;}
  window.requestAnimationFrame(() => {
    if (!header.isConnected) {return;}
    const titleWrap = header.querySelector('[data-test-skedpal="task-title-wrap"]');
    const actionsWrap = header.querySelector('[data-test-skedpal="task-actions-wrap"]');
    if (!titleWrap || !actionsWrap) {return;}
    const titleTop = Number(titleWrap.offsetTop) || 0;
    const actionsTop = Number(actionsWrap.offsetTop) || 0;
    const isStacked = actionsTop > titleTop + TWO;
    header.classList.toggle("task-title-row--stacked", isStacked);
    actionsWrap.style.flexWrap = isStacked ? "nowrap" : "wrap";
  });
}

function buildTaskMeta(task, timeMapNames, repeatSummary) {
  const meta = document.createElement("div");
  meta.className = "task-details__grid";
  meta.setAttribute("data-test-skedpal", "task-meta");
  const reminderItem = buildReminderDetailItem({
    task,
    buildDetailItemElement,
    formatDateTime,
    reminderIconSvg
  });
  if (reminderItem) {
    meta.appendChild(reminderItem);
  }
  if (task.deadline) {
    const { item, valueEl } = buildDetailItemElement({
      key: "deadline",
      label: "Deadline",
      iconSvg: detailFlagIconSvg,
      valueTestId: "task-deadline"
    });
    valueEl.textContent = formatDateTime(task.deadline);
    meta.appendChild(item);
  }
  if (task.startFrom) {
    const { item, valueEl } = buildDetailItemElement({
      key: "start-from",
      label: "Start from",
      iconSvg: detailClockIconSvg,
      valueTestId: "task-start-from"
    });
    valueEl.textContent = formatDateTime(task.startFrom);
    meta.appendChild(item);
  }
  if (task.minBlockMin) {
    const { item, valueEl } = buildDetailItemElement({
      key: "min-block",
      label: "Min block",
      iconSvg: detailStackIconSvg,
      valueTestId: "task-min-block"
    });
    valueEl.textContent = `${task.minBlockMin}m`;
    meta.appendChild(item);
  }
  const priorityValue = Number(task.priority) || 0;
  const { item: priorityItem, valueEl: priorityValueEl } = buildDetailItemElement({
    key: "priority",
    label: "Priority",
    iconSvg: detailGaugeIconSvg,
    valueTestId: "task-priority"
  });
  const priorityValueSpan = document.createElement("span");
  priorityValueSpan.setAttribute("data-test-skedpal", "task-priority-value");
  priorityValueSpan.textContent = String(priorityValue);
  if (priorityValue) {
    priorityValueSpan.className = "priority-text";
    priorityValueSpan.dataset.priority = String(priorityValue);
  }
  priorityValueEl.appendChild(priorityValueSpan);
  meta.appendChild(priorityItem);
  const timeMapsLabel = timeMapNames.length ? timeMapNames.join(", ") : "None";
  const { item: timeMapsItem, valueEl: timeMapsValueEl } = buildDetailItemElement({
    key: "timemaps",
    label: "TimeMaps",
    iconSvg: detailMapIconSvg,
    valueTestId: "task-timemaps"
  });
  timeMapsValueEl.textContent = timeMapsLabel;
  meta.appendChild(timeMapsItem);

  const { item: repeatItem, valueEl: repeatValueEl } = buildDetailItemElement({
    key: "repeat",
    label: "Repeat",
    iconSvg: detailRepeatIconSvg,
    valueTestId: "task-repeat"
  });
  repeatValueEl.textContent = repeatSummary;
  meta.appendChild(repeatItem);
  return meta;
}

function buildTaskScheduleDetails(task) {
  const scheduledStart = task.scheduledStart ? formatDateTime(task.scheduledStart) : "";
  const scheduledEnd = task.scheduledEnd ? formatDateTime(task.scheduledEnd) : "";
  if (!scheduledStart && !scheduledEnd) {
    return null;
  }
  const rangeMarkup =
    scheduledStart && scheduledEnd
      ? `${scheduledStart} → ${scheduledEnd}`
      : scheduledStart || scheduledEnd;
  const statusRow = document.createElement("div");
  statusRow.className = "task-details__schedule";
  statusRow.setAttribute("data-test-skedpal", "task-status-details");
  const { item, valueEl } = buildDetailItemElement({
    key: "schedule",
    label: "Schedule",
    iconSvg: calendarIconSvg,
    extraClass: "task-details__item--schedule"
  });
  valueEl.textContent = rangeMarkup;
  if (scheduledStart) {
    const legacyStart = document.createElement("span");
    legacyStart.className = "sr-only";
    legacyStart.setAttribute("data-test-skedpal", "task-scheduled-start");
    legacyStart.textContent = scheduledStart;
    valueEl.appendChild(legacyStart);
  }
  if (scheduledEnd) {
    const legacyEnd = document.createElement("span");
    legacyEnd.className = "sr-only";
    legacyEnd.setAttribute("data-test-skedpal", "task-scheduled-end");
    legacyEnd.textContent = scheduledEnd;
    valueEl.appendChild(legacyEnd);
  }
  statusRow.appendChild(item);
  return statusRow;
}

export function buildTaskCardShell(task, options = {}) {
  const {
    depth = 0,
    timeMapById = new Map(),
    dataTest = "task-card"
  } = options;
  const taskCard = document.createElement("div");
  applyTaskCardBaseStyles(taskCard, task, depth, timeMapById, { dataTest });
  return taskCard;
}

export function renderTaskCard(task, context) {
  const {
    tasks,
    timeMapById,
    collapsedTasks,
    expandedTaskDetails,
    computeTotalDuration,
    getTaskDepthById,
    hideSummaryRow
  } = context;
  const now = new Date();
  const childTasks = tasks.filter((t) => t.subtaskParentId === task.id);
  const hasChildren = childTasks.length > 0;
  const isCollapsed = collapsedTasks.has(task.id);
  const depth = getTaskDepthById(task.id);
  const baseDurationMin = Number(task.durationMin) || 0;
  const displayDurationMin = hasChildren ? computeTotalDuration(task) : baseDurationMin;
  const timeMapNames = task.timeMapIds.map((id) => timeMapById.get(id)?.name || "Unknown");
  const repeatSummary = getRepeatSummary(task.repeat);
  const taskCard = buildTaskCardShell(task, { depth, timeMapById });
  const titleMarkup = buildTitleMarkup(task);
  const detailsOpen = expandedTaskDetails.has(task.id);
  const overdueReminders = getOverdueReminders(task);
  if (overdueReminders.length) {
    taskCard.classList.add("task-card--reminder-alert");
    taskCard.dataset.reminderAlert = "true";
  }
  const { showFutureStartIcon, showOutOfRangeIcon, showUnscheduledIcon } = buildSummaryIconFlags(
    task,
    {
      hasChildren,
      now,
      context
    }
  );
  const header = buildTaskHeader(task, {
    hasChildren,
    isCollapsed,
    isSubtask: depth > 0,
    titleMarkup,
    detailsOpen,
    displayDurationMin,
    hideSummaryRow,
    showFutureStartIcon,
    showOutOfRangeIcon,
    showUnscheduledIcon
  });
  taskCard.appendChild(header);
  applyTaskHeaderLayout(header);
  if (detailsOpen) {
    const detailsWrap = document.createElement("div");
    detailsWrap.className = "task-details";
    detailsWrap.setAttribute("data-test-skedpal", "task-details");
    const meta = buildTaskMeta(task, timeMapNames, repeatSummary);
    detailsWrap.appendChild(meta);
    const isRepeating = task.repeat && task.repeat.type !== TASK_REPEAT_NONE;
    if (!isRepeating) {
      const statusRow = buildTaskScheduleDetails(task);
      if (statusRow) {
        detailsWrap.appendChild(statusRow);
      }
    }
    taskCard.appendChild(detailsWrap);
  }
  return taskCard;
}
