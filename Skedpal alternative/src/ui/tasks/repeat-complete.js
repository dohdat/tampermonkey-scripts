import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import {
  DAYS_PER_YEAR,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  REPEAT_COMPLETE_COMPLETED_ID,
  REPEAT_COMPLETE_COMPLETED_LIMIT,
  REPEAT_COMPLETE_OUT_OF_RANGE_ID,
  TEN,
  domRefs
} from "../constants.js";
import { formatDate, getLocalDateKey, parseLocalDateInput } from "../utils.js";
import { getDateParts } from "../repeat-yearly.js";
import { state } from "../state/page-state.js";

const { repeatCompleteModal, repeatCompleteList, repeatCompleteEmpty } = domRefs;

function formatMonthRange(start, end) {
  if (!start || !end) {return "";}
  const startMonth = start.toLocaleDateString(undefined, { month: "short" });
  const endMonth = end.toLocaleDateString(undefined, { month: "short" });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startYear}`;
    }
    return `${startMonth}-${endMonth} ${startYear}`;
  }
  return `${startMonth} ${startYear}-${endMonth} ${endYear}`;
}

function isMonthDayAfter(start, end) {
  if (start.month !== end.month) {
    return start.month > end.month;
  }
  return start.day > end.day;
}

function buildYearlyRangeLabel(task, date) {
  const repeat = task?.repeat;
  if (!repeat || repeat.unit !== "year") {return "";}
  if (!repeat.yearlyRangeStartDate || !repeat.yearlyRangeEndDate) {return "";}
  const startParts = getDateParts(repeat.yearlyRangeStartDate);
  const endParts = getDateParts(repeat.yearlyRangeEndDate);
  if (!startParts || !endParts) {return "";}
  const endYear = date.getFullYear();
  const startYear = isMonthDayAfter(startParts, endParts) ? endYear - 1 : endYear;
  const startDate = new Date(startYear, startParts.month - 1, startParts.day);
  const endDate = new Date(endYear, endParts.month - 1, endParts.day);
  const startLabel = formatDate(startDate);
  const endLabel = formatDate(endDate);
  if (!startLabel || !endLabel) {return "";}
  return `${startLabel} - ${endLabel}`;
}

const localDateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function parseCompletedOccurrenceDate(value) {
  if (!value) {return null;}
  if (typeof value === "string" && localDateKeyPattern.test(value)) {
    const iso = parseLocalDateInput(value);
    return iso ? new Date(iso) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCompletedOccurrenceEntries(task) {
  const entries = [];
  const seenKeys = new Set();
  (task?.completedOccurrences || []).forEach((value) => {
    const date = parseCompletedOccurrenceDate(value);
    if (!date) {return;}
    const key = getLocalDateKey(date);
    if (!key || seenKeys.has(key)) {return;}
    seenKeys.add(key);
    entries.push({ date, key });
  });
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}

function resolveOccurrenceTimeLabel({
  task,
  date,
  occurrenceId,
  horizonEnd,
  fallbackLabel,
  showOutOfRange
}) {
  if (showOutOfRange && date > horizonEnd) {
    return "Out of range";
  }
  const instances = task.scheduledInstances || [];
  let matches = instances.filter((instance) => instance.occurrenceId === occurrenceId);
  if (!matches.length) {
    const targetKey = getLocalDateKey(date);
    matches = instances.filter((instance) => getLocalDateKey(instance.start) === targetKey);
  }
  if (!matches.length) {
    return fallbackLabel;
  }
  const starts = matches.map((m) => new Date(m.start));
  const ends = matches.map((m) => new Date(m.end));
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  const startLabel = minStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endLabel = maxEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function buildOccurrenceButton({
  task,
  date,
  occurrenceId,
  horizonEnd,
  isNext,
  isOutOfRange
}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "repeat-complete-option";
  if (isOutOfRange) {
    btn.classList.add("repeat-complete-option--out-of-range");
  }
  btn.dataset.repeatCompleteTask = task.id;
  btn.dataset.repeatCompleteDate = date.toISOString();
  btn.setAttribute("data-test-skedpal", "repeat-complete-option");
  const details = document.createElement("span");
  details.className = "repeat-complete-details";
  details.setAttribute("data-test-skedpal", "repeat-complete-details");
  const radio = document.createElement("span");
  radio.className = "repeat-complete-radio";
  if (isNext) {
    radio.classList.add("repeat-complete-radio--next");
  }
  radio.setAttribute("data-test-skedpal", "repeat-complete-radio");
  const label = document.createElement("span");
  label.className = "repeat-complete-label";
  label.textContent =
    buildYearlyRangeLabel(task, date) || formatDate(date) || date.toLocaleDateString();
  label.setAttribute("data-test-skedpal", "repeat-complete-label");
  const time = document.createElement("span");
  time.className = "repeat-complete-time";
  time.setAttribute("data-test-skedpal", "repeat-complete-time");
  time.textContent = resolveOccurrenceTimeLabel({
    task,
    date,
    occurrenceId,
    horizonEnd,
    fallbackLabel: "Unscheduled",
    showOutOfRange: true
  });
  const meta = document.createElement("span");
  meta.className = "repeat-complete-meta";
  meta.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
  meta.setAttribute("data-test-skedpal", "repeat-complete-meta");
  details.appendChild(radio);
  details.appendChild(label);
  details.appendChild(time);
  if (isNext) {
    const next = document.createElement("span");
    next.className = "repeat-complete-badge";
    next.textContent = "Next";
    next.setAttribute("data-test-skedpal", "repeat-complete-next");
    details.appendChild(next);
  }
  btn.appendChild(details);
  btn.appendChild(meta);
  return btn;
}

function buildCompletedOccurrenceRow({ task, date, horizonEnd }) {
  const row = document.createElement("div");
  row.className = "repeat-complete-option";
  row.setAttribute("data-test-skedpal", "repeat-complete-completed-option");
  const details = document.createElement("span");
  details.className = "repeat-complete-details";
  details.setAttribute("data-test-skedpal", "repeat-complete-details");
  const radio = document.createElement("span");
  radio.className = "repeat-complete-radio";
  radio.setAttribute("data-test-skedpal", "repeat-complete-radio");
  const label = document.createElement("span");
  label.className = "repeat-complete-label";
  label.textContent =
    buildYearlyRangeLabel(task, date) || formatDate(date) || date.toLocaleDateString();
  label.setAttribute("data-test-skedpal", "repeat-complete-label");
  const time = document.createElement("span");
  time.className = "repeat-complete-time";
  time.textContent = resolveOccurrenceTimeLabel({
    task,
    date,
    occurrenceId: "",
    horizonEnd,
    fallbackLabel: "Completed",
    showOutOfRange: false
  });
  time.setAttribute("data-test-skedpal", "repeat-complete-time");
  const meta = document.createElement("span");
  meta.className = "repeat-complete-meta";
  meta.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
  meta.setAttribute("data-test-skedpal", "repeat-complete-meta");
  details.appendChild(radio);
  details.appendChild(label);
  details.appendChild(time);
  row.appendChild(details);
  row.appendChild(meta);
  return row;
}

function buildOutOfRangeSeparator({ label, count, isCollapsed, controlsId }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "repeat-complete-separator";
  button.classList.toggle("repeat-complete-separator--open", !isCollapsed);
  button.setAttribute("data-test-skedpal", "repeat-complete-separator");
  button.dataset.repeatCompleteSeparator = "true";
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute("aria-controls", controlsId);
  const suffix = count === 1 ? "occurrence" : "occurrences";
  button.textContent = `${label} - Out of range (${count} ${suffix})`;
  return button;
}

function buildCompletedSeparator({ label, count, isCollapsed, controlsId }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "repeat-complete-separator";
  button.classList.toggle("repeat-complete-separator--open", !isCollapsed);
  button.setAttribute("data-test-skedpal", "repeat-complete-completed-separator");
  button.dataset.repeatCompleteSeparator = "true";
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute("aria-controls", controlsId);
  const suffix = count === 1 ? "occurrence" : "occurrences";
  button.textContent = `${label} - Completed (${count} ${suffix})`;
  return button;
}

function appendOutOfRangeSection({ task, outOfRange, horizonEnd }) {
  if (!outOfRange.length || !repeatCompleteList) {return;}
  const firstOut = outOfRange[0].date;
  const lastOut = outOfRange[outOfRange.length - 1].date;
  const label = formatMonthRange(firstOut, lastOut);
  const separator = buildOutOfRangeSeparator({
    label,
    count: outOfRange.length,
    isCollapsed: true,
    controlsId: REPEAT_COMPLETE_OUT_OF_RANGE_ID
  });
  const outOfRangeWrap = document.createElement("div");
  outOfRangeWrap.id = REPEAT_COMPLETE_OUT_OF_RANGE_ID;
  outOfRangeWrap.className = "repeat-complete-out-of-range hidden";
  outOfRangeWrap.setAttribute("data-test-skedpal", "repeat-complete-out-of-range");
  repeatCompleteList.appendChild(separator);
  outOfRange.forEach(({ date, occurrenceId }) => {
    const btn = buildOccurrenceButton({
      task,
      date,
      occurrenceId,
      horizonEnd,
      isNext: false,
      isOutOfRange: true
    });
    outOfRangeWrap.appendChild(btn);
  });
  repeatCompleteList.appendChild(outOfRangeWrap);
}

function appendCompletedSection({ task, completedEntries, horizonEnd }) {
  if (!completedEntries.length || !repeatCompleteList) {return;}
  const limited = completedEntries.slice(0, REPEAT_COMPLETE_COMPLETED_LIMIT);
  const first = limited[limited.length - 1]?.date || limited[0]?.date;
  const last = limited[0]?.date || limited[limited.length - 1]?.date;
  const label = formatMonthRange(first, last) || "Previous";
  const completedWrap = document.createElement("div");
  completedWrap.id = REPEAT_COMPLETE_COMPLETED_ID;
  completedWrap.className = "repeat-complete-out-of-range hidden";
  completedWrap.setAttribute("data-test-skedpal", "repeat-complete-completed-wrap");
  const separator = buildCompletedSeparator({
    label,
    count: completedEntries.length,
    isCollapsed: true,
    controlsId: REPEAT_COMPLETE_COMPLETED_ID
  });
  repeatCompleteList.appendChild(separator);
  limited.forEach(({ date }) => {
    const row = buildCompletedOccurrenceRow({ task, date, horizonEnd });
    completedWrap.appendChild(row);
  });
  repeatCompleteList.appendChild(completedWrap);
}

export function closeRepeatCompleteModal() {
  if (repeatCompleteModal) {repeatCompleteModal.classList.add("hidden");}
  document.body.classList.remove("modal-open");
}

export function openRepeatCompleteModal(task) {
  if (!repeatCompleteModal || !repeatCompleteList) {return;}
  repeatCompleteList.innerHTML = "";
  const horizonDays =
    Number(state.settingsCache?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const now = new Date();
  const horizonEnd = new Date(now.getTime());
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  horizonEnd.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  const occurrences = getUpcomingOccurrences(task, now, TEN, DAYS_PER_YEAR);
  if (!occurrences.length) {
    repeatCompleteEmpty?.classList.remove("hidden");
  } else {
    repeatCompleteEmpty?.classList.add("hidden");
    const inRange = [];
    const outOfRange = [];
    occurrences.forEach(({ date, occurrenceId }) => {
      const entry = { date, occurrenceId };
      if (date > horizonEnd) {
        outOfRange.push(entry);
      } else {
        inRange.push(entry);
      }
    });
    inRange.forEach(({ date, occurrenceId }, index) => {
      const btn = buildOccurrenceButton({
        task,
        date,
        occurrenceId,
        horizonEnd,
        isNext: index === 0,
        isOutOfRange: false
      });
      repeatCompleteList.appendChild(btn);
    });
    appendOutOfRangeSection({ task, outOfRange, horizonEnd });
  }
  const completedEntries = buildCompletedOccurrenceEntries(task);
  appendCompletedSection({ task, completedEntries, horizonEnd });
  repeatCompleteModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}
