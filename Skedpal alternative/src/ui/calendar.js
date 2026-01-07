import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import {
  addCalendarDays,
  getCalendarRange,
  getCalendarTitle,
  getDayKey
} from "./calendar-utils.js";

const HOUR_HEIGHT = 48;
let nowIndicatorTimer = null;

function formatHourLabel(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatEventTimeRange(start, end) {
  const startLabel = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function getScheduledEvents(tasks) {
  const events = [];
  (tasks || []).forEach((task) => {
    if (task.scheduleStatus !== "scheduled") return;
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance) => {
      if (!instance?.start || !instance?.end) return;
      const start = new Date(instance.start);
      const end = new Date(instance.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      events.push({
        taskId: task.id,
        title: task.title || "Untitled task",
        start,
        end,
        timeMapId: instance.timeMapId || ""
      });
    });
  });
  return events;
}

function buildEmptyState() {
  const empty = document.createElement("div");
  empty.className = "calendar-empty";
  empty.textContent = "No scheduled tasks in this range.";
  empty.setAttribute("data-test-skedpal", "calendar-empty");
  return empty;
}

function buildNowIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "calendar-now-indicator";
  indicator.setAttribute("data-test-skedpal", "calendar-now-indicator");
  const dot = document.createElement("div");
  dot.className = "calendar-now-dot";
  dot.setAttribute("data-test-skedpal", "calendar-now-dot");
  const line = document.createElement("div");
  line.className = "calendar-now-line";
  line.setAttribute("data-test-skedpal", "calendar-now-line");
  indicator.appendChild(dot);
  indicator.appendChild(line);
  return indicator;
}

function positionNowIndicator(indicator, now) {
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const top = (minutes / 60) * HOUR_HEIGHT;
  indicator.style.top = `${top}px`;
}

function updateNowIndicator() {
  const { calendarGrid } = domRefs;
  if (!calendarGrid) return;
  const viewMode = state.calendarViewMode || "week";
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  calendarGrid
    .querySelectorAll('[data-test-skedpal="calendar-now-indicator"]')
    .forEach((node) => node.remove());
  const now = new Date();
  if (now < range.start || now >= range.end) return;
  const todayKey = getDayKey(now);
  const todayCol = calendarGrid.querySelector(`[data-day="${todayKey}"]`);
  if (!todayCol) return;
  const indicator = buildNowIndicator();
  positionNowIndicator(indicator, now);
  todayCol.appendChild(indicator);
}

function renderCalendarGrid(range, events) {
  const { calendarGrid } = domRefs;
  if (!calendarGrid) return;
  calendarGrid.innerHTML = "";
  calendarGrid.style.setProperty("--calendar-hour-height", `${HOUR_HEIGHT}px`);

  const header = document.createElement("div");
  header.className = "calendar-grid-header";
  header.setAttribute("data-test-skedpal", "calendar-grid-header");
  header.style.gridTemplateColumns = `90px repeat(${range.days}, minmax(0, 1fr))`;

  const headerSpacer = document.createElement("div");
  headerSpacer.className = "calendar-grid-spacer";
  headerSpacer.setAttribute("data-test-skedpal", "calendar-grid-spacer");
  header.appendChild(headerSpacer);

  for (let i = 0; i < range.days; i += 1) {
    const day = addCalendarDays(range.start, i);
    const dayLabel = document.createElement("div");
    dayLabel.className = "calendar-day-header";
    dayLabel.setAttribute("data-test-skedpal", "calendar-day-header");
    dayLabel.textContent = day.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    if (getDayKey(day) === getDayKey(new Date())) {
      dayLabel.classList.add("calendar-day-header--today");
    }
    header.appendChild(dayLabel);
  }

  const body = document.createElement("div");
  body.className = "calendar-grid-body";
  body.setAttribute("data-test-skedpal", "calendar-grid-body");
  body.style.gridTemplateColumns = "90px 1fr";

  const timeCol = document.createElement("div");
  timeCol.className = "calendar-time-col";
  timeCol.setAttribute("data-test-skedpal", "calendar-time-col");
  for (let hour = 0; hour < 24; hour += 1) {
    const label = document.createElement("div");
    label.className = "calendar-time-label";
    label.textContent = formatHourLabel(hour);
    label.setAttribute("data-test-skedpal", "calendar-time-label");
    timeCol.appendChild(label);
  }

  const daysWrap = document.createElement("div");
  daysWrap.className = "calendar-days";
  daysWrap.setAttribute("data-test-skedpal", "calendar-days");
  daysWrap.style.gridTemplateColumns = `repeat(${range.days}, minmax(0, 1fr))`;

  const eventsByDay = new Map();
  events.forEach((event) => {
    const key = getDayKey(event.start);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(event);
  });

  for (let i = 0; i < range.days; i += 1) {
    const day = addCalendarDays(range.start, i);
    const dayKey = getDayKey(day);
    const col = document.createElement("div");
    col.className = "calendar-day-col";
    col.setAttribute("data-test-skedpal", "calendar-day-col");
    col.dataset.day = dayKey;
    const dayEvents = eventsByDay.get(dayKey) || [];
    dayEvents.forEach((event) => {
      const eventStart = new Date(Math.max(event.start.getTime(), day.getTime()));
      const dayEnd = addCalendarDays(day, 1);
      const eventEnd = new Date(Math.min(event.end.getTime(), dayEnd.getTime()));
      const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
      const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
      const top = (startMinutes / 60) * HOUR_HEIGHT;
      const height = Math.max(20, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT);
      const block = document.createElement("div");
      block.className = "calendar-event";
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      block.setAttribute("data-test-skedpal", "calendar-event");
      const title = document.createElement("div");
      title.className = "calendar-event-title";
      title.textContent = event.title;
      title.setAttribute("data-test-skedpal", "calendar-event-title");
      const time = document.createElement("div");
      time.className = "calendar-event-time";
      time.textContent = formatEventTimeRange(event.start, event.end);
      time.setAttribute("data-test-skedpal", "calendar-event-time");
      block.appendChild(title);
      block.appendChild(time);
      col.appendChild(block);
    });
    daysWrap.appendChild(col);
  }

  body.appendChild(timeCol);
  body.appendChild(daysWrap);
  calendarGrid.appendChild(header);
  calendarGrid.appendChild(body);
}

function updateCalendarTitle(viewMode) {
  const { calendarTitle } = domRefs;
  if (!calendarTitle) return;
  calendarTitle.textContent = getCalendarTitle(state.calendarAnchorDate, viewMode);
}

function updateViewToggle(viewMode) {
  const { calendarDayBtn, calendarWeekBtn } = domRefs;
  if (calendarDayBtn) {
    calendarDayBtn.classList.toggle("calendar-view-btn--active", viewMode === "day");
  }
  if (calendarWeekBtn) {
    calendarWeekBtn.classList.toggle("calendar-view-btn--active", viewMode === "week");
  }
}

export function renderCalendar(tasks = state.tasksCache) {
  const viewMode = state.calendarViewMode || "week";
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  const events = getScheduledEvents(tasks).filter(
    (event) => event.end > range.start && event.start < range.end
  );
  updateCalendarTitle(viewMode);
  updateViewToggle(viewMode);
  renderCalendarGrid(range, events);
  updateNowIndicator();
  if (!events.length) {
    domRefs.calendarGrid?.appendChild(buildEmptyState());
  }
}

export function initCalendarView() {
  const {
    calendarPrevBtn,
    calendarNextBtn,
    calendarTodayBtn,
    calendarDayBtn,
    calendarWeekBtn
  } = domRefs;

  if (calendarPrevBtn) {
    calendarPrevBtn.addEventListener("click", () => {
      const step = state.calendarViewMode === "day" ? -1 : -7;
      state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
      renderCalendar();
    });
  }
  if (calendarNextBtn) {
    calendarNextBtn.addEventListener("click", () => {
      const step = state.calendarViewMode === "day" ? 1 : 7;
      state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
      renderCalendar();
    });
  }
  if (calendarTodayBtn) {
    calendarTodayBtn.addEventListener("click", () => {
      state.calendarAnchorDate = new Date();
      renderCalendar();
    });
  }
  if (calendarDayBtn) {
    calendarDayBtn.addEventListener("click", () => {
      state.calendarViewMode = "day";
      renderCalendar();
    });
  }
  if (calendarWeekBtn) {
    calendarWeekBtn.addEventListener("click", () => {
      state.calendarViewMode = "week";
      renderCalendar();
    });
  }
  if (nowIndicatorTimer) {
    clearInterval(nowIndicatorTimer);
  }
  nowIndicatorTimer = setInterval(updateNowIndicator, 60 * 1000);
  renderCalendar();
}
