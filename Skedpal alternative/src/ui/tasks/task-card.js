import {
  EXTERNAL_CALENDAR_TIMEMAP_PREFIX,
  DEFAULT_TASK_REPEAT,
  TASK_REPEAT_NONE,
  caretDownIconSvg,
  caretRightIconSvg,
  checkboxCheckedIconSvg,
  checkboxIconSvg,
  calendarIconSvg,
  duplicateIconSvg,
  editIconSvg,
  eyeIconSvg,
  eyeOffIconSvg,
  plusIconSvg,
  reminderIconSvg,
  removeIconSvg,
  TASK_CHILD_INDENT_PX
} from "../constants.js";
import {
  applyPrioritySelectColor,
  formatDateTime,
  formatDurationShort,
  isExternalCalendarTimeMapId,
  isStartFromNotToday
} from "../utils.js";
import { getRepeatSummary } from "../repeat.js";
import { themeColors } from "../theme.js";
import { updateTaskDetailField } from "./task-detail-updates.js";
import { getOverdueReminders } from "./task-reminders.js";
import { applyTaskBackgroundStyle } from "./task-card-styles.js";
import { buildReminderDetailItem } from "./task-card-details.js";
import { buildSummaryIconFlags, buildTaskSummaryRow } from "./task-card-summary.js";
import {
  buildDeadlineDetailItem,
  buildDurationDetailItem,
  buildPriorityDetailItem,
  buildRepeatDetailItem,
  buildStartFromDetailItem,
  buildTimeMapDetailItem
} from "./task-card-detail-edit.js";
import { state } from "../state/page-state.js";

const detailClockIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"></circle><path d="M10 6v4l2.5 2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const detailFlagIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3v14" stroke-linecap="round"></path><path d="M4 4h9l-1.5 3L13 10H4" stroke-linejoin="round"></path></svg>`;
const detailStackIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="12" height="4" rx="1.5"></rect><rect x="4" y="11" width="12" height="4" rx="1.5"></rect></svg>`;
const detailGaugeIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13a6 6 0 1 1 12 0" stroke-linecap="round"></path><path d="M10 8l3 3" stroke-linecap="round"></path><circle cx="10" cy="13" r="1"></circle></svg>`;
const detailMapIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5l4-2 4 2 4-2v12l-4 2-4-2-4 2V5Z" stroke-linejoin="round"></path><path d="M8 3v12M12 5v12" stroke-linecap="round"></path></svg>`;
const detailRepeatIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8a6 6 0 0 1 10-2" stroke-linecap="round"></path><path d="M14 3v3h-3" stroke-linecap="round" stroke-linejoin="round"></path><path d="M16 12a6 6 0 0 1-10 2" stroke-linecap="round"></path><path d="M6 17v-3h3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

function resolveExternalCalendarLabel(timeMapId) {
  const calendarId = String(timeMapId || "").slice(EXTERNAL_CALENDAR_TIMEMAP_PREFIX.length);
  if (!calendarId) {return "External calendar";}
  const cached = Array.isArray(state.googleCalendarListCache)
    ? state.googleCalendarListCache
    : [];
  const entry = cached.find((calendar) => calendar.id === calendarId);
  return entry?.summary || calendarId || "External calendar";
}
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
  taskCard.style.padding = "2px";
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
  collapseTaskBtn.className = "title-icon-btn task-collapse-btn";
  collapseTaskBtn.title = isCollapsed ? "Expand subtasks" : "Collapse subtasks";
  collapseTaskBtn.setAttribute("aria-label", isCollapsed ? "Expand subtasks" : "Collapse subtasks");
  collapseTaskBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
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
  completeBtn.setAttribute("aria-label", task.completed ? "Mark incomplete" : "Mark completed");
  completeBtn.setAttribute("aria-pressed", task.completed ? "true" : "false");
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

function buildMenuToggleButton(taskId, menuId) {
  const menuToggleBtn = document.createElement("button");
  menuToggleBtn.type = "button";
  menuToggleBtn.dataset.taskMenuToggle = taskId;
  menuToggleBtn.className = "title-icon-btn";
  menuToggleBtn.title = "More actions";
  menuToggleBtn.setAttribute("aria-label", "More actions");
  menuToggleBtn.setAttribute("aria-haspopup", "menu");
  menuToggleBtn.setAttribute("aria-expanded", "false");
  if (menuId) {
    menuToggleBtn.setAttribute("aria-controls", menuId);
  }
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
  btn.setAttribute("role", "menuitem");
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
  menu.id = `task-actions-menu-${task.id}`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("data-test-skedpal", "task-actions-menu");
  const menuItems = [
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
      label: "Bulk Edit (B)",
      dataset: { bulkEdit: task.id },
      iconSvg: editIconSvg,
      testAttr: "task-menu-bulk-edit",
      color: themeColors.lime400
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
  detailsToggleBtn.setAttribute("aria-pressed", detailsOpen ? "true" : "false");
  detailsToggleBtn.setAttribute("data-test-skedpal", "task-details-toggle");
  detailsToggleBtn.innerHTML = detailsOpen ? eyeOffIconSvg : eyeIconSvg;
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
  const menu = buildTaskActionsMenu(task);
  const menuToggleBtn = buildMenuToggleButton(task.id, menu.id);
  const detailsToggleBtn = buildDetailsToggleButton(task.id, detailsOpen);
  menuWrap.appendChild(menuToggleBtn);
  menuWrap.appendChild(menu);
  titleActions.appendChild(menuWrap);
  titleActions.appendChild(detailsToggleBtn);
  actionsWrap.appendChild(titleActions);
  return actionsWrap;
}

function buildTaskDurationPill(displayDurationMin, isSubtask) {
  const durationPill = document.createElement("span");
  durationPill.className = isSubtask ? "pill pill-muted pill--subtask" : "pill pill-muted";
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

function appendDeadlineDetailItem(meta, task, cleanupFns) {
  if (!task.deadline) {return;}
  const deadlineDetail = buildDeadlineDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailFlagIconSvg,
    formatDateTime,
    onClear: () => updateTaskDetailField(task, { deadline: null })
  });
  if (deadlineDetail.item) {
    meta.appendChild(deadlineDetail.item);
    cleanupFns.push(deadlineDetail.cleanup);
  }
}

function appendStartFromDetailItem(meta, task, cleanupFns) {
  if (!task.startFrom) {return;}
  const startFromDetail = buildStartFromDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailClockIconSvg,
    formatDateTime,
    onClear: () => updateTaskDetailField(task, { startFrom: null })
  });
  if (startFromDetail.item) {
    meta.appendChild(startFromDetail.item);
    cleanupFns.push(startFromDetail.cleanup);
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

function appendDurationDetailItem(meta, task, cleanupFns) {
  const durationDetail = buildDurationDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailClockIconSvg,
    onUpdate: (updates) => updateTaskDetailField(task, updates)
  });
  meta.appendChild(durationDetail.item);
  cleanupFns.push(durationDetail.cleanup);
}

function appendPriorityDetailItem(meta, task, cleanupFns) {
  const priorityDetail = buildPriorityDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailGaugeIconSvg,
    applyPrioritySelectColor,
    onUpdate: (updates) => updateTaskDetailField(task, updates)
  });
  meta.appendChild(priorityDetail.item);
  cleanupFns.push(priorityDetail.cleanup);
}

function appendTimeMapsDetailItem(meta, task, timeMapOptions, cleanupFns) {
  const timeMapsDetail = buildTimeMapDetailItem({
    task,
    buildDetailItemElement,
    iconSvg: detailMapIconSvg,
    timeMapOptions,
    onUpdate: (updates) => updateTaskDetailField(task, updates)
  });
  meta.appendChild(timeMapsDetail.item);
  cleanupFns.push(timeMapsDetail.cleanup);
}

function appendRepeatDetailItem(meta, task, repeatSummary, cleanupFns) {
  const isRepeating = task.repeat && task.repeat.type !== TASK_REPEAT_NONE;
  const repeatDetail = buildRepeatDetailItem({
    buildDetailItemElement,
    iconSvg: detailRepeatIconSvg,
    repeatSummary,
    isRepeating,
    onClear: () => updateTaskDetailField(task, { repeat: { ...DEFAULT_TASK_REPEAT } })
  });
  meta.appendChild(repeatDetail.item);
  cleanupFns.push(repeatDetail.cleanup);
}

function buildTaskHeader(task, options) {
  const header = document.createElement("div");
  header.className = "task-title-row title-hover-group";
  const { titleWrap, displayDurationMin, detailsOpen } = buildTitleWrap(task, options);
  const actionsWrap = buildTaskTitleActions(task, detailsOpen);
  actionsWrap.style.flex = "1";
  actionsWrap.style.flexWrap = "wrap";
  actionsWrap.style.justifyContent = "flex-start";
  const durationPill = buildTaskDurationPill(displayDurationMin, options.isSubtask);
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

function buildTaskMeta(task, timeMapOptions, repeatSummary) {
  const meta = document.createElement("div");
  meta.className = "task-details__grid";
  meta.setAttribute("data-test-skedpal", "task-meta");
  const cleanupFns = [];
  appendReminderDetailItem(meta, task);
  appendDeadlineDetailItem(meta, task, cleanupFns);
  appendStartFromDetailItem(meta, task, cleanupFns);
  appendMinBlockDetailItem(meta, task);
  appendDurationDetailItem(meta, task, cleanupFns);
  appendPriorityDetailItem(meta, task, cleanupFns);
  appendTimeMapsDetailItem(meta, task, timeMapOptions, cleanupFns);
  appendRepeatDetailItem(meta, task, repeatSummary, cleanupFns);
  return {
    meta,
    cleanup: () => {
      cleanupFns.forEach((fn) => fn());
    }
  };
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

function buildTimeMapOptions(task, timeMapById) {
  const options = [];
  const seen = new Set();
  const entries = Array.from(timeMapById.entries()).map(([id, timeMap]) => ({
    id,
    label: timeMap?.name || "Untitled"
  }));
  entries.sort((a, b) => a.label.localeCompare(b.label));
  entries.forEach((entry) => {
    if (seen.has(entry.id)) {return;}
    seen.add(entry.id);
    options.push(entry);
  });
  const taskIds = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
  taskIds.forEach((id) => {
    if (seen.has(id)) {return;}
    const label = isExternalCalendarTimeMapId(id)
      ? resolveExternalCalendarLabel(id)
      : timeMapById.get(id)?.name || "Unknown";
    seen.add(id);
    options.push({ id, label });
  });
  return options;
}

function applyTaskCardIndicators(taskCard, task, now) {
  const overdueReminders = getOverdueReminders(task);
  if (overdueReminders.length) {
    taskCard.classList.add("task-card--reminder-alert");
    taskCard.dataset.reminderAlert = "true";
  }
  if (isStartFromNotToday(task.startFrom, now)) {
    taskCard.classList.add("task-card--start-from-not-today");
  }
}

function maybeAppendTaskDetails(taskCard, task, timeMapOptions, repeatSummary, detailsOpen) {
  if (!detailsOpen) {return;}
  const detailsWrap = document.createElement("div");
  detailsWrap.className = "task-details";
  detailsWrap.setAttribute("data-test-skedpal", "task-details");
  const { meta, cleanup } = buildTaskMeta(task, timeMapOptions, repeatSummary);
  detailsWrap.appendChild(meta);
  const isRepeating = task.repeat && task.repeat.type !== TASK_REPEAT_NONE;
  if (!isRepeating) {
    const statusRow = buildTaskScheduleDetails(task);
    if (statusRow) {
      detailsWrap.appendChild(statusRow);
    }
  }
  taskCard.appendChild(detailsWrap);
  if (typeof cleanup === "function") {
    const existingCleanup = state.taskDetailCleanup.get(task.id);
    if (typeof existingCleanup === "function") {
      existingCleanup();
    }
    state.taskDetailCleanup.set(task.id, cleanup);
  }
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
  const timeMapOptions = buildTimeMapOptions(task, timeMapById);
  const repeatSummary = getRepeatSummary(task.repeat);
  const taskCard = buildTaskCardShell(task, { depth, timeMapById });
  const titleMarkup = buildTitleMarkup(task);
  const detailsOpen = expandedTaskDetails.has(task.id);
  applyTaskCardIndicators(taskCard, task, now);
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
  maybeAppendTaskDetails(taskCard, task, timeMapOptions, repeatSummary, detailsOpen);
  return taskCard;
}

