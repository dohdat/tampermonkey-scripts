import {
  caretDownIconSvg,
  caretRightIconSvg,
  checkboxCheckedIconSvg,
  checkboxIconSvg,
  calendarIconSvg,
  duplicateIconSvg,
  editIconSvg,
  outOfRangeIconSvg,
  plusIconSvg,
  removeIconSvg,
  zoomInIconSvg
} from "../constants.js";
import { formatDateTime, formatDurationShort } from "../utils.js";
import { getRepeatSummary } from "../repeat.js";
import { themeColors } from "../theme.js";

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
  taskCard.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
  taskCard.setAttribute("data-test-skedpal", dataTest);
  taskCard.dataset.taskId = task.id;
  taskCard.dataset.sectionId = task.section || "";
  taskCard.dataset.subsectionId = task.subsection || "";
  taskCard.tabIndex = 0;
  taskCard.style.minHeight = "fit-content";
  taskCard.style.padding = "5px";
  if (isSubtask) {
    taskCard.style.marginLeft = `${depth * 10}px`;
    taskCard.style.borderStyle = "dashed";
  }
  const timeMapIds = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
  const color = timeMapById.get(timeMapIds[0])?.color;
  if (color) {
    taskCard.style.backgroundColor = `${color}1a`;
  }
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
    isLongTitle,
    isSubtask,
    titleMarkup,
    detailsOpen,
    displayDurationMin
  } = options;
  const titleWrap = document.createElement("h3");
  const titleWeightClass = isSubtask && !hasChildren ? "font-normal" : "font-semibold";
  const titleSizeClass = isSubtask ? "text-sm" : "text-base";
  titleWrap.className = `task-title-main ${titleSizeClass} ${titleWeightClass}`;
  titleWrap.setAttribute("data-test-skedpal", "task-title-wrap");
  if (hasChildren) {
    titleWrap.appendChild(buildTaskCollapseButton(task, isCollapsed));
  }
  titleWrap.appendChild(buildTaskCompleteButton(task));
  titleWrap.appendChild(buildTaskTitleText(task, titleMarkup, isSubtask));
  return { titleWrap, isLongTitle, displayDurationMin, detailsOpen };
}

function buildTaskTitleActions(task, detailsOpen) {
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "task-actions-wrap";
  const titleActions = document.createElement("div");
  titleActions.className = "title-actions task-title-actions";
  titleActions.setAttribute("data-test-skedpal", "task-title-actions");
  const zoomTaskBtn = document.createElement("button");
  zoomTaskBtn.type = "button";
  zoomTaskBtn.dataset.zoomTask = task.id;
  zoomTaskBtn.dataset.zoomSection = task.section || "";
  zoomTaskBtn.dataset.zoomSubsection = task.subsection || "";
  zoomTaskBtn.className = "title-icon-btn";
  zoomTaskBtn.title = "Zoom into task";
  zoomTaskBtn.setAttribute("data-test-skedpal", "task-zoom-btn");
  zoomTaskBtn.innerHTML = zoomInIconSvg;
  const editTaskBtn = document.createElement("button");
  editTaskBtn.type = "button";
  editTaskBtn.dataset.edit = task.id;
  editTaskBtn.className = "title-icon-btn";
  editTaskBtn.title = "Edit task";
  editTaskBtn.setAttribute("data-test-skedpal", "task-edit-btn");
  editTaskBtn.innerHTML = editIconSvg;
  editTaskBtn.style.borderColor = themeColors.green500;
  editTaskBtn.style.color = themeColors.green500;
  const duplicateTaskBtn = document.createElement("button");
  duplicateTaskBtn.type = "button";
  duplicateTaskBtn.dataset.duplicateTask = task.id;
  duplicateTaskBtn.className = "title-icon-btn";
  duplicateTaskBtn.title = "Duplicate task";
  duplicateTaskBtn.setAttribute("data-test-skedpal", "task-duplicate-btn");
  duplicateTaskBtn.innerHTML = duplicateIconSvg;
  duplicateTaskBtn.style.borderColor = themeColors.blue500;
  duplicateTaskBtn.style.color = themeColors.blue500;
  const deleteTaskBtn = document.createElement("button");
  deleteTaskBtn.type = "button";
  deleteTaskBtn.dataset.delete = task.id;
  deleteTaskBtn.className = "title-icon-btn";
  deleteTaskBtn.title = "Delete task";
  deleteTaskBtn.setAttribute("data-test-skedpal", "task-delete-btn");
  deleteTaskBtn.innerHTML = removeIconSvg;
  deleteTaskBtn.style.borderColor = themeColors.orange500;
  deleteTaskBtn.style.color = themeColors.orange500;
  const addSubtaskBtn = document.createElement("button");
  addSubtaskBtn.type = "button";
  addSubtaskBtn.dataset.addSubtask = task.id;
  addSubtaskBtn.className = "title-icon-btn";
  addSubtaskBtn.title = "Add subtask";
  addSubtaskBtn.setAttribute("aria-label", "Add subtask");
  addSubtaskBtn.setAttribute("data-test-skedpal", "task-add-subtask-btn");
  addSubtaskBtn.innerHTML = plusIconSvg;
  const detailsToggleBtn = document.createElement("button");
  detailsToggleBtn.type = "button";
  detailsToggleBtn.dataset.toggleTaskDetails = task.id;
  detailsToggleBtn.className = "title-icon-btn";
  detailsToggleBtn.title = detailsOpen ? "Hide details" : "Show details";
  detailsToggleBtn.setAttribute("aria-label", detailsOpen ? "Hide details" : "Show details");
  detailsToggleBtn.setAttribute("data-test-skedpal", "task-details-toggle");
  detailsToggleBtn.innerHTML = detailsOpen ? caretDownIconSvg : caretRightIconSvg;
  titleActions.appendChild(zoomTaskBtn);
  titleActions.appendChild(duplicateTaskBtn);
  titleActions.appendChild(addSubtaskBtn);
  titleActions.appendChild(editTaskBtn);
  titleActions.appendChild(deleteTaskBtn);
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

function buildTaskSummaryRow(task, options = {}) {
  const { showOutOfRangeIcon = false } = options;
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
      const viewCalendarBtn = document.createElement("button");
      viewCalendarBtn.type = "button";
      viewCalendarBtn.className = "title-icon-btn";
      viewCalendarBtn.title = "View on calendar";
      viewCalendarBtn.dataset.viewCalendarTask = task.id;
      viewCalendarBtn.setAttribute("data-test-skedpal", "task-summary-view-calendar");
      viewCalendarBtn.innerHTML = calendarIconSvg;
      viewCalendarBtn.style.opacity = "0";
      viewCalendarBtn.style.pointerEvents = "none";
      const revealCalendarBtn = () => {
        viewCalendarBtn.style.opacity = "1";
        viewCalendarBtn.style.pointerEvents = "auto";
      };
      const hideCalendarBtn = () => {
        viewCalendarBtn.style.opacity = "0";
        viewCalendarBtn.style.pointerEvents = "none";
      };
      if (typeof summaryRow.addEventListener === "function") {
        summaryRow.addEventListener("mouseenter", revealCalendarBtn);
        summaryRow.addEventListener("mouseleave", hideCalendarBtn);
      }
      if (typeof viewCalendarBtn.addEventListener === "function") {
        viewCalendarBtn.addEventListener("focus", revealCalendarBtn);
        viewCalendarBtn.addEventListener("blur", hideCalendarBtn);
      }
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
  }
  if (viewCalendarBtn) {
    summaryRow.appendChild(viewCalendarBtn);
  }
  return hasContent ? summaryRow : null;
}

function buildTaskHeader(task, options) {
  const header = document.createElement("div");
  header.className = `task-title-row title-hover-group${options.isLongTitle ? " task-title-row--stacked" : ""}`;
  const { titleWrap, displayDurationMin, detailsOpen, isLongTitle } = buildTitleWrap(task, options);
  const actionsWrap = buildTaskTitleActions(task, detailsOpen);
  actionsWrap.style.flex = "1";
  actionsWrap.style.flexWrap = isLongTitle ? "nowrap" : "wrap";
  actionsWrap.style.justifyContent = "flex-start";
  const durationPill = buildTaskDurationPill(displayDurationMin);
  if (actionsWrap.firstChild) {
    actionsWrap.insertBefore(durationPill, actionsWrap.firstChild);
  } else {
    actionsWrap.appendChild(durationPill);
  }
  if (!options.hideSummaryRow) {
    const summaryRow = buildTaskSummaryRow(task, {
      showOutOfRangeIcon: options.showOutOfRangeIcon
    });
    if (summaryRow) {
      actionsWrap.appendChild(summaryRow);
    }
  }
  header.appendChild(titleWrap);
  header.appendChild(actionsWrap);
  return header;
}

function buildTaskMeta(task, timeMapNames, repeatSummary) {
  const meta = document.createElement("div");
  meta.className = "mt-2 flex flex-wrap gap-2 text-xs text-slate-400";
  meta.setAttribute("data-test-skedpal", "task-meta");
  const deadlineMarkup = task.deadline
    ? `<span data-test-skedpal="task-deadline">Deadline: ${formatDateTime(task.deadline)}</span>`
    : "";
  const startFromMarkup = task.startFrom
    ? `<span data-test-skedpal="task-start-from">Start from: ${formatDateTime(
        task.startFrom
      )}</span>`
    : "";
    const minBlockMarkup = task.minBlockMin
      ? `<span data-test-skedpal="task-min-block">Min block: ${task.minBlockMin}m</span>`
      : "";
    const priorityValue = Number(task.priority) || 0;
    const priorityMarkup = priorityValue
      ? `Priority: <span class="priority-text" data-priority="${priorityValue}" data-test-skedpal="task-priority-value">${priorityValue}</span>`
      : "Priority: 0";
    meta.innerHTML = `
            ${deadlineMarkup}
            ${startFromMarkup}
            ${minBlockMarkup}
            <span data-test-skedpal="task-priority">${priorityMarkup}</span>
            <span data-test-skedpal="task-timemaps">TimeMaps: ${timeMapNames.join(", ")}</span>
            <span data-test-skedpal="task-repeat">Repeat: ${repeatSummary}</span>
          `;
  return meta;
}

function buildTaskScheduleDetails(task) {
  const scheduledStartMarkup = task.scheduledStart
    ? `<span data-test-skedpal="task-scheduled-start">Start: ${formatDateTime(
        task.scheduledStart
      )}</span>`
    : "";
  const scheduledEndMarkup = task.scheduledEnd
    ? `<span data-test-skedpal="task-scheduled-end">End: ${formatDateTime(
        task.scheduledEnd
      )}</span>`
    : "";
  if (!scheduledStartMarkup && !scheduledEndMarkup) {
    return null;
  }
  const statusRow = document.createElement("div");
  statusRow.className = "mt-1 flex flex-wrap gap-3 text-xs text-slate-400";
  statusRow.innerHTML = `
          ${scheduledStartMarkup}
          ${scheduledEndMarkup}
        `;
  statusRow.setAttribute("data-test-skedpal", "task-status-details");
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
  const isLongTitle = (task.title || "").length > 60;
  const detailsOpen = expandedTaskDetails.has(task.id);
  const showOutOfRangeIcon = Boolean(context.firstOccurrenceOutOfRangeByTaskId?.get(task.id));
  const header = buildTaskHeader(task, {
    hasChildren,
    isCollapsed,
    isLongTitle,
    isSubtask: depth > 0,
    titleMarkup,
    detailsOpen,
    displayDurationMin,
    hideSummaryRow,
    showOutOfRangeIcon
  });
  taskCard.appendChild(header);
  if (detailsOpen) {
    const meta = buildTaskMeta(task, timeMapNames, repeatSummary);
    taskCard.appendChild(meta);
    const isRepeating = task.repeat && task.repeat.type !== "none";
    if (!isRepeating) {
      const statusRow = buildTaskScheduleDetails(task);
      if (statusRow) {
        taskCard.appendChild(statusRow);
      }
    }
  }
  return taskCard;
}
