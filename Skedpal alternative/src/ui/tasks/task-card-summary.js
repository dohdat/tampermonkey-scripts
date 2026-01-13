import {
  TASK_REPEAT_NONE,
  calendarIconSvg,
  outOfRangeIconSvg,
  unscheduledIconSvg
} from "../constants.js";
import { themeColors } from "../theme.js";

function shouldShowFutureStartIcon(task, now) {
  if (!task || task.completed) {return false;}
  if (task.scheduledStart) {return false;}
  if (!task.startFrom) {return false;}
  const startFrom = new Date(task.startFrom);
  if (Number.isNaN(startFrom.getTime())) {return false;}
  return startFrom > now;
}

export function buildSummaryIconFlags(task, options) {
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

export function buildTaskSummaryRow(task, options = {}) {
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
