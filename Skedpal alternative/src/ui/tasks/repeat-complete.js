import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import {
  DAYS_PER_YEAR,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TEN,
  domRefs
} from "../constants.js";
import { formatDate, getLocalDateKey } from "../utils.js";
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
  label.textContent = formatDate(date) || date.toLocaleDateString();
  label.setAttribute("data-test-skedpal", "repeat-complete-label");
  const time = document.createElement("span");
  time.className = "repeat-complete-time";
  time.setAttribute("data-test-skedpal", "repeat-complete-time");
  if (date > horizonEnd) {
    time.textContent = "Out of range";
  } else {
    const instances = task.scheduledInstances || [];
    let matches = instances.filter((instance) => instance.occurrenceId === occurrenceId);
    if (!matches.length) {
      const targetKey = getLocalDateKey(date);
      matches = instances.filter(
        (instance) => getLocalDateKey(instance.start) === targetKey
      );
    }
    if (matches.length) {
      const starts = matches.map((m) => new Date(m.start));
      const ends = matches.map((m) => new Date(m.end));
      const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
      const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
      const startLabel = minStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const endLabel = maxEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      time.textContent = `${startLabel} - ${endLabel}`;
    } else {
      time.textContent = "Unscheduled";
    }
  }
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

function buildOutOfRangeSeparator({ label, count, isCollapsed, controlsId }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "repeat-complete-separator";
  if (!isCollapsed) {
    button.classList.add("repeat-complete-separator--open");
  }
  button.setAttribute("data-test-skedpal", "repeat-complete-separator");
  button.dataset.repeatCompleteSeparator = "true";
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute("aria-controls", controlsId);
  const suffix = count === 1 ? "occurrence" : "occurrences";
  button.textContent = `${label} - Out of range (${count} ${suffix})`;
  return button;
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
    if (outOfRange.length) {
      const firstOut = outOfRange[0].date;
      const lastOut = outOfRange[outOfRange.length - 1].date;
      const label = formatMonthRange(firstOut, lastOut);
      const outOfRangeId = "repeat-complete-out-of-range";
      const separator = buildOutOfRangeSeparator({
        label,
        count: outOfRange.length,
        isCollapsed: true,
        controlsId: outOfRangeId
      });
      const outOfRangeWrap = document.createElement("div");
      outOfRangeWrap.id = outOfRangeId;
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
  }
  repeatCompleteModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}
