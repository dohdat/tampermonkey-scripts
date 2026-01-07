import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import {
  addCalendarDays,
  getCalendarRange,
  getCalendarTitle,
  getDayKey,
  getDateFromDayKey,
  roundMinutesToStep,
  clampMinutes
} from "./calendar-utils.js";
import { saveTask } from "../data/db.js";

const HOUR_HEIGHT = 120;
const DRAG_STEP_MINUTES = 15;
const EVENT_GUTTER = 2;
const EVENT_EDGE_INSET = 8;
const EVENT_OVERLAP_INSET = 4;
let nowIndicatorTimer = null;
let dragState = null;

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

function getMinutesIntoDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function normalizeEventToDay(event, dayStart, dayEnd) {
  const eventStart = new Date(Math.max(event.start.getTime(), dayStart.getTime()));
  const eventEnd = new Date(Math.min(event.end.getTime(), dayEnd.getTime()));
  const startMinutes = getMinutesIntoDay(eventStart);
  const endMinutes = getMinutesIntoDay(eventEnd);
  if (endMinutes <= startMinutes) return null;
  return {
    event,
    eventStart,
    eventEnd,
    startMinutes,
    endMinutes
  };
}

function buildOverlapGroups(items) {
  const groups = [];
  const sorted = [...items].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.endMinutes - b.endMinutes;
  });
  let current = null;
  sorted.forEach((item) => {
    if (!current || item.startMinutes >= current.endMinutes) {
      current = { items: [item], endMinutes: item.endMinutes };
      groups.push(current);
      return;
    }
    current.items.push(item);
    current.endMinutes = Math.max(current.endMinutes, item.endMinutes);
  });
  return groups;
}

export function buildDayEventLayout(dayEvents, day) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addCalendarDays(dayStart, 1);
  const normalized = dayEvents
    .map((event) => normalizeEventToDay(event, dayStart, dayEnd))
    .filter(Boolean);
  const groups = buildOverlapGroups(normalized);
  const layout = [];
  groups.forEach((group) => {
    const columns = [];
    const groupLayout = [];
    group.items.forEach((item) => {
      let columnIndex = columns.findIndex((end) => item.startMinutes >= end);
      if (columnIndex < 0) {
        columns.push(item.endMinutes);
        columnIndex = columns.length - 1;
      } else {
        columns[columnIndex] = item.endMinutes;
      }
      groupLayout.push({
        ...item,
        columnIndex,
        columnCount: columns.length
      });
    });
    groupLayout.forEach((item) => {
      item.columnCount = columns.length;
      layout.push(item);
    });
  });
  return layout;
}

export function getCalendarEventStyles(event, timeMapColorById) {
  const color = timeMapColorById?.get?.(event?.timeMapId || "");
  if (!color) return null;
  return {
    backgroundColor: `${color}1a`,
    borderColor: color
  };
}

function getScheduledEvents(tasks) {
  const events = [];
  (tasks || []).forEach((task) => {
    if (task.scheduleStatus !== "scheduled") return;
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance, index) => {
      if (!instance?.start || !instance?.end) return;
      const start = new Date(instance.start);
      const end = new Date(instance.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      events.push({
        taskId: task.id,
        title: task.title || "Untitled task",
        link: task.link || "",
        start,
        end,
        timeMapId: instance.timeMapId || "",
        occurrenceId: instance.occurrenceId || "",
        instanceIndex: index
      });
    });
  });
  return events;
}

export function buildUpdatedTaskForDrag(task, eventMeta, newStart, newEnd) {
  if (!task || !eventMeta || !(newStart instanceof Date) || !(newEnd instanceof Date)) {
    return null;
  }
  const instances = Array.isArray(task.scheduledInstances)
    ? task.scheduledInstances.map((instance) => ({ ...instance }))
    : [];
  if (!instances.length) return null;
  let targetIndex = -1;
  if (eventMeta.occurrenceId) {
    targetIndex = instances.findIndex(
      (instance) => instance.occurrenceId === eventMeta.occurrenceId
    );
  }
  if (targetIndex < 0 && Number.isFinite(eventMeta.instanceIndex)) {
    targetIndex = eventMeta.instanceIndex;
  }
  if (targetIndex < 0 && eventMeta.start instanceof Date && eventMeta.end instanceof Date) {
    const originalStart = eventMeta.start.getTime();
    const originalEnd = eventMeta.end.getTime();
    targetIndex = instances.findIndex((instance) => {
      const start = new Date(instance.start);
      const end = new Date(instance.end);
      return start.getTime() === originalStart && end.getTime() === originalEnd;
    });
  }
  if (targetIndex < 0 || !instances[targetIndex]) return null;
  instances[targetIndex] = {
    ...instances[targetIndex],
    start: newStart.toISOString(),
    end: newEnd.toISOString()
  };
  const sorted = instances
    .map((instance) => ({
      ...instance,
      startDate: new Date(instance.start),
      endDate: new Date(instance.end)
    }))
    .filter(
      (instance) =>
        !Number.isNaN(instance.startDate.getTime()) &&
        !Number.isNaN(instance.endDate.getTime())
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const scheduledStart = sorted[0]?.startDate?.toISOString() || null;
  const scheduledEnd = sorted[sorted.length - 1]?.endDate?.toISOString() || null;
  const scheduledTimeMapId = sorted[0]?.timeMapId || null;
  return {
    ...task,
    scheduledInstances: instances,
    scheduledStart,
    scheduledEnd,
    scheduledTimeMapId,
    scheduleStatus: task.scheduleStatus || "scheduled"
  };
}

function getEventMetaFromBlock(block) {
  const taskId = block?.dataset?.eventTaskId || "";
  const occurrenceId = block?.dataset?.eventOccurrenceId || "";
  const instanceIndexRaw = block?.dataset?.eventInstanceIndex || "";
  const instanceIndex = Number(instanceIndexRaw);
  const startIso = block?.dataset?.eventStart || "";
  const endIso = block?.dataset?.eventEnd || "";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!taskId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return {
    taskId,
    occurrenceId,
    instanceIndex: Number.isFinite(instanceIndex) ? instanceIndex : null,
    start,
    end
  };
}

function getDragMinutesFromPointer(dayCol, clientY, durationMinutes) {
  const rect = dayCol.getBoundingClientRect();
  const y = clampMinutes(clientY - rect.top, 0, rect.height);
  const minutes = (y / rect.height) * 24 * 60;
  const rounded = roundMinutesToStep(minutes, DRAG_STEP_MINUTES);
  const maxStart = Math.max(0, 24 * 60 - durationMinutes);
  return clampMinutes(rounded, 0, maxStart);
}

function updateDragTarget(dayCol, block, minutes) {
  const top = (minutes / 60) * HOUR_HEIGHT;
  block.style.top = `${top}px`;
  const timeLabel = block.querySelector('[data-test-skedpal="calendar-event-time"]');
  if (timeLabel && dragState?.eventMeta) {
    const start = getDateFromDayKey(dayCol.dataset.day);
    if (start) {
      start.setMinutes(minutes, 0, 0);
      const end = new Date(start.getTime() + dragState.durationMinutes * 60000);
      timeLabel.textContent = formatEventTimeRange(start, end);
    }
  }
}

async function persistDraggedEvent(eventMeta, dayKey, minutes, durationMinutes) {
  const task = state.tasksCache.find((candidate) => candidate.id === eventMeta.taskId);
  if (!task) return;
  const startDate = getDateFromDayKey(dayKey);
  if (!startDate) return;
  startDate.setMinutes(minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const updated = buildUpdatedTaskForDrag(task, eventMeta, startDate, endDate);
  if (!updated) return;
  await saveTask(updated);
  state.tasksCache = state.tasksCache.map((item) => (item.id === updated.id ? updated : item));
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

function renderCalendarGrid(range, events, timeMapColorById) {
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
    const layout = buildDayEventLayout(dayEvents, day);
    layout.forEach((item) => {
      const top = (item.startMinutes / 60) * HOUR_HEIGHT;
      const height = Math.max(
        20,
        ((item.endMinutes - item.startMinutes) / 60) * HOUR_HEIGHT
      );
      const block = document.createElement("div");
      block.className = "calendar-event";
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      if (item.columnCount > 1) {
        const inset = EVENT_OVERLAP_INSET;
        const totalGutter = EVENT_GUTTER * (item.columnCount - 1);
        block.style.width = `calc((100% - ${totalGutter}px) / ${item.columnCount} - ${inset * 2}px)`;
        block.style.left = `calc(${item.columnIndex} * ((100% - ${totalGutter}px) / ${item.columnCount}) + ${item.columnIndex * EVENT_GUTTER}px + ${inset}px)`;
        block.style.right = "auto";
      } else {
        block.style.left = `${EVENT_EDGE_INSET}px`;
        block.style.right = `${EVENT_EDGE_INSET}px`;
      }
      block.dataset.eventTaskId = item.event.taskId;
      block.dataset.eventOccurrenceId = item.event.occurrenceId || "";
      block.dataset.eventStart = item.event.start.toISOString();
      block.dataset.eventEnd = item.event.end.toISOString();
      block.dataset.eventInstanceIndex = String(item.event.instanceIndex);
      const styles = getCalendarEventStyles(item.event, timeMapColorById);
      if (styles) {
        block.style.backgroundColor = styles.backgroundColor;
        block.style.borderColor = styles.borderColor;
      }
      block.setAttribute("data-test-skedpal", "calendar-event");
      let title = null;
      if (item.event.link) {
        title = document.createElement("a");
        title.className = "calendar-event-title calendar-event-title-link";
        title.href = item.event.link;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
        title.textContent = item.event.title;
        title.setAttribute("data-test-skedpal", "calendar-event-title-link");
      } else {
        title = document.createElement("div");
        title.className = "calendar-event-title";
        title.textContent = item.event.title;
        title.setAttribute("data-test-skedpal", "calendar-event-title");
      }
      const time = document.createElement("div");
      time.className = "calendar-event-time";
      time.textContent = formatEventTimeRange(item.eventStart, item.eventEnd);
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

function clearDragState() {
  if (!dragState) return;
  dragState.block?.classList?.remove("calendar-event--dragging");
  dragState.dayCol?.classList?.remove("calendar-day-col--drag-target");
  dragState = null;
}

function startCalendarDrag(event) {
  if (event.target?.closest?.("a")) return;
  const target = event.target.closest?.(".calendar-event");
  if (!target || event.button !== 0) return;
  const dayCol = target.closest?.(".calendar-day-col");
  if (!dayCol || !dayCol.dataset.day) return;
  const eventMeta = getEventMetaFromBlock(target);
  if (!eventMeta) return;
  const durationMinutes = Math.max(
    DRAG_STEP_MINUTES,
    Math.round((eventMeta.end.getTime() - eventMeta.start.getTime()) / 60000)
  );
  event.preventDefault();
  dragState = {
    block: target,
    dayCol,
    eventMeta,
    durationMinutes,
    originDayKey: dayCol.dataset.day,
    originMinutes: roundMinutesToStep(getMinutesIntoDay(eventMeta.start), DRAG_STEP_MINUTES),
    minutes: roundMinutesToStep(getMinutesIntoDay(eventMeta.start), DRAG_STEP_MINUTES)
  };
  target.classList.add("calendar-event--dragging");
  dayCol.classList.add("calendar-day-col--drag-target");
  if (typeof target.setPointerCapture === "function") {
    target.setPointerCapture(event.pointerId);
  }
}

function handleCalendarDragMove(event) {
  if (!dragState) return;
  const hovered = document.elementFromPoint(event.clientX, event.clientY);
  const nextDayCol = hovered?.closest?.(".calendar-day-col") || dragState.dayCol;
  if (!nextDayCol || !nextDayCol.dataset.day) return;
  if (nextDayCol !== dragState.dayCol) {
    dragState.dayCol?.classList?.remove("calendar-day-col--drag-target");
    nextDayCol.classList.add("calendar-day-col--drag-target");
    nextDayCol.appendChild(dragState.block);
    dragState.dayCol = nextDayCol;
  }
  const minutes = getDragMinutesFromPointer(
    nextDayCol,
    event.clientY,
    dragState.durationMinutes
  );
  dragState.minutes = minutes;
  updateDragTarget(nextDayCol, dragState.block, minutes);
}

async function handleCalendarDragEnd() {
  if (!dragState) return;
  const { eventMeta, dayCol, minutes, durationMinutes, originDayKey, originMinutes } =
    dragState;
  clearDragState();
  if (!dayCol || !dayCol.dataset.day) {
    renderCalendar();
    return;
  }
  if (dayCol.dataset.day === originDayKey && minutes === originMinutes) {
    renderCalendar();
    return;
  }
  await persistDraggedEvent(eventMeta, dayCol.dataset.day, minutes, durationMinutes);
  renderCalendar();
}

function ensureCalendarDragHandlers() {
  const { calendarGrid } = domRefs;
  if (!calendarGrid || calendarGrid.dataset.dragReady === "true") return;
  calendarGrid.dataset.dragReady = "true";
  calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");
  calendarGrid.addEventListener("pointerdown", startCalendarDrag);
  window.addEventListener("pointermove", handleCalendarDragMove);
  window.addEventListener("pointerup", handleCalendarDragEnd);
  window.addEventListener("pointercancel", handleCalendarDragEnd);
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

export function focusCalendarNow(options = {}) {
  const { behavior = "auto" } = options;
  const calendarGrid = domRefs.calendarGrid || document.getElementById("calendar-grid");
  if (!calendarGrid) return false;
  const indicator = calendarGrid.querySelector(
    '[data-test-skedpal="calendar-now-indicator"]'
  );
  if (!indicator || typeof indicator.scrollIntoView !== "function") return false;
  indicator.scrollIntoView({ block: "center", inline: "nearest", behavior });
  return true;
}

export function renderCalendar(tasks = state.tasksCache) {
  const viewMode = state.calendarViewMode || "week";
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  const events = getScheduledEvents(tasks).filter(
    (event) => event.end > range.start && event.start < range.end
  );
  const timeMapColorById = new Map(
    (state.tasksTimeMapsCache || [])
      .filter((timeMap) => timeMap?.id && timeMap?.color)
      .map((timeMap) => [timeMap.id, timeMap.color])
  );
  updateCalendarTitle(viewMode);
  updateViewToggle(viewMode);
  renderCalendarGrid(range, events, timeMapColorById);
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
      focusCalendarNow({ behavior: "auto" });
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
  ensureCalendarDragHandlers();
}
