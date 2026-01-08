import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import {
  addCalendarDays,
  getCalendarRange,
  getCalendarTitle,
  getDayKey,
  getDateFromDayKey,
  roundMinutesToStep,
  clampMinutes,
  getMinutesIntoDay
} from "./calendar-utils.js";
import { parseCalendarViewFromUrl, updateUrlWithCalendarView } from "./utils.js";
import {
  buildEventMetaFromDataset,
  buildUpdatedTaskForDrag,
  formatRescheduledMessage,
  getScheduledEvents
} from "./calendar-helpers.js";
export { buildUpdatedTaskForDrag, formatRescheduledMessage } from "./calendar-helpers.js";
import { saveTask } from "../data/db.js";
import {
  initCalendarEventModal,
  openCalendarEventModal,
  openExternalEventModal
} from "./calendar-event-modal.js";
import {
  clearCalendarEventFocus,
  focusCalendarEventBlock
} from "./calendar-focus.js";
import { showNotificationBanner, showUndoBanner } from "./notifications.js";
import { ensureExternalEvents, getExternalEventsForRange } from "./calendar-external.js";
import {
  buildExternalEventMeta,
  getUpdatedExternalEvents,
  sendExternalDeleteRequest,
  sendExternalUpdateRequest
} from "./calendar-external-events.js";
import {
  HOUR_HEIGHT,
  buildEmptyState,
  formatEventTimeRange,
  renderCalendarGrid
} from "./calendar-render.js";

const DRAG_STEP_MINUTES = 15;
const DRAG_ACTIVATION_DELAY = 80;
const DRAG_CANCEL_DISTANCE = 8;
let nowIndicatorTimer = null;
let dragState = null;
let pendingDrag = null;
let lastDragCompletedAt = 0;
let lastDragMoved = false;
let calendarViewInitialized = false;
let externalDeletePending = false;

function getEventMetaFromBlock(block) {
  if (!block?.dataset) {return null;}
  if (block.dataset.eventSource === "external") {
    return buildExternalEventMeta(block.dataset);
  }
  return buildEventMetaFromDataset(block.dataset || null);
}

function getRuntime() {
  return globalThis.chrome?.runtime || null;
}

function getExternalDeletePayload(deleteBtn) {
  if (!deleteBtn) {return null;}
  const eventId = deleteBtn.dataset.eventId || "";
  const calendarId = deleteBtn.dataset.calendarId || "";
  const title = deleteBtn.dataset.eventTitle || "this event";
  if (!eventId || !calendarId) {return null;}
  return { eventId, calendarId, title };
}

function confirmExternalDelete(title) {
  if (typeof window === "undefined") {return true;}
  return window.confirm(`Delete "${title}" from Google Calendar?`);
}

function setDeleteButtonState(button, disabled) {
  if (!button) {return;}
  button.disabled = Boolean(disabled);
  button.classList.toggle("opacity-60", Boolean(disabled));
}

function removeExternalEvent(payload) {
  state.calendarExternalEvents = (state.calendarExternalEvents || []).filter(
    (event) => !(event.id === payload.eventId && event.calendarId === payload.calendarId)
  );
}

function updateExternalEventInState(payload) {
  state.calendarExternalEvents = getUpdatedExternalEvents(
    state.calendarExternalEvents || [],
    payload
  );
}

export function buildExternalUpdatePayload(eventMeta, dayKey, minutes, durationMinutes) {
  const startDate = getDateFromDayKey(dayKey);
  if (!startDate) {return null;}
  startDate.setMinutes(minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  return {
    eventId: eventMeta.eventId,
    calendarId: eventMeta.calendarId,
    start: startDate,
    end: endDate
  };
}

async function persistDraggedExternalEvent(payload) {
  if (!payload) {return;}
  const response = await sendExternalUpdateRequest(getRuntime(), payload);
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to update calendar event");
  }
  updateExternalEventInState(payload);
}

async function deleteExternalEvent(deleteBtn) {
  if (externalDeletePending) {return;}
  const payload = getExternalDeletePayload(deleteBtn);
  if (!payload) {return;}
  if (!confirmExternalDelete(payload.title)) {return;}
  externalDeletePending = true;
  setDeleteButtonState(deleteBtn, true);
  try {
    const response = await sendExternalDeleteRequest(getRuntime(), payload);
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to delete calendar event");
    }
    removeExternalEvent(payload);
    renderCalendar();
  } catch (error) {
    console.warn("Failed to delete Google Calendar event.", error);
  } finally {
    externalDeletePending = false;
    setDeleteButtonState(deleteBtn, false);
  }
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
  if (!task) {return;}
  const startDate = getDateFromDayKey(dayKey);
  if (!startDate) {return;}
  startDate.setMinutes(minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const updated = buildUpdatedTaskForDrag(task, eventMeta, startDate, endDate);
  if (!updated) {return;}
  await saveTask(updated);
  state.tasksCache = state.tasksCache.map((item) => (item.id === updated.id ? updated : item));
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
  if (!calendarGrid) {return;}
  const viewMode = state.calendarViewMode || "week";
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  calendarGrid
    .querySelectorAll('[data-test-skedpal="calendar-now-indicator"]')
    .forEach((node) => node.remove());
  const now = new Date();
  if (now < range.start || now >= range.end) {return;}
  const todayKey = getDayKey(now);
  const todayCol = calendarGrid.querySelector(`[data-day="${todayKey}"]`);
  if (!todayCol) {return;}
  const indicator = buildNowIndicator();
  positionNowIndicator(indicator, now);
  todayCol.appendChild(indicator);
}

function clearDragState() {
  if (!dragState) {return;}
  dragState.block?.classList?.remove("calendar-event--dragging");
  dragState.dayCol?.classList?.remove("calendar-day-col--drag-target");
  dragState = null;
}

function beginCalendarDrag(pending) {
  if (!pending || pending !== pendingDrag) {return;}
  const { block, dayCol, eventMeta, pointerId, lastClientY } = pending;
  if (!block || !dayCol || !eventMeta) {return;}
  const rect = dayCol.getBoundingClientRect();
  const y = clampMinutes(lastClientY - rect.top, 0, rect.height);
  const pointerMinutes = (y / rect.height) * 24 * 60;
  const startMinutes = getMinutesIntoDay(eventMeta.start);
  const grabOffsetMinutes = pointerMinutes - startMinutes;
  const durationMinutes = Math.max(
    DRAG_STEP_MINUTES,
    Math.round((eventMeta.end.getTime() - eventMeta.start.getTime()) / 60000)
  );
  dragState = {
    block,
    dayCol,
    eventMeta,
    durationMinutes,
    originDayKey: dayCol.dataset.day,
    originMinutes: roundMinutesToStep(getMinutesIntoDay(eventMeta.start), DRAG_STEP_MINUTES),
    minutes: roundMinutesToStep(getMinutesIntoDay(eventMeta.start), DRAG_STEP_MINUTES),
    moved: false,
    grabOffsetMinutes
  };
  pendingDrag = null;
  block.classList.add("calendar-event--dragging");
  dayCol.classList.add("calendar-day-col--drag-target");
  if (typeof block.setPointerCapture === "function") {
    block.setPointerCapture(pointerId);
  }
}

function scheduleCalendarDrag(event) {
  if (event.target?.closest?.("a")) {return;}
  if (event.target?.closest?.("[data-calendar-event-delete]")) {return;}
  const target = event.target.closest?.(".calendar-event");
  if (!target || event.button !== 0) {return;}
  const dayCol = target.closest?.(".calendar-day-col");
  if (!dayCol || !dayCol.dataset.day) {return;}
  const eventMeta = getEventMetaFromBlock(target);
  if (!eventMeta) {return;}
  if (pendingDrag?.timer) {
    clearTimeout(pendingDrag.timer);
  }
  pendingDrag = {
    block: target,
    dayCol,
    eventMeta,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    timer: setTimeout(() => beginCalendarDrag(pendingDrag), DRAG_ACTIVATION_DELAY)
  };
}

function updatePendingDrag(event) {
  if (!pendingDrag || dragState) {return;}
  pendingDrag.lastClientX = event.clientX;
  pendingDrag.lastClientY = event.clientY;
  const dx = pendingDrag.lastClientX - pendingDrag.startClientX;
  const dy = pendingDrag.lastClientY - pendingDrag.startClientY;
  const distance = Math.hypot(dx, dy);
  if (distance > DRAG_CANCEL_DISTANCE) {
    clearTimeout(pendingDrag.timer);
    pendingDrag = null;
  }
}

function updateActiveDrag(event) {
  const hovered = document.elementFromPoint(event.clientX, event.clientY);
  const nextDayCol = hovered?.closest?.(".calendar-day-col") || dragState.dayCol;
  if (!nextDayCol || !nextDayCol.dataset.day) {return;}
  if (nextDayCol !== dragState.dayCol) {
    dragState.dayCol?.classList?.remove("calendar-day-col--drag-target");
    nextDayCol.classList.add("calendar-day-col--drag-target");
    nextDayCol.appendChild(dragState.block);
    dragState.dayCol = nextDayCol;
  }
  const rect = nextDayCol.getBoundingClientRect();
  const y = clampMinutes(event.clientY - rect.top, 0, rect.height);
  const pointerMinutes = (y / rect.height) * 24 * 60;
  const adjustedMinutes = pointerMinutes - (dragState.grabOffsetMinutes || 0);
  const roundedMinutes = roundMinutesToStep(adjustedMinutes, DRAG_STEP_MINUTES);
  const maxStart = Math.max(0, 24 * 60 - dragState.durationMinutes);
  const minutes = clampMinutes(roundedMinutes, 0, maxStart);
  if (minutes !== dragState.minutes) {
    dragState.moved = true;
  }
  dragState.minutes = minutes;
  updateDragTarget(nextDayCol, dragState.block, minutes);
}

function handleCalendarDragMove(event) {
  updatePendingDrag(event);
  if (!dragState) {return;}
  updateActiveDrag(event);
}

async function handleCalendarDragEnd() {
  if (pendingDrag?.timer) {
    clearTimeout(pendingDrag.timer);
    pendingDrag = null;
  }
  if (!dragState) {return;}
  const { eventMeta, dayCol, minutes, durationMinutes, originDayKey, originMinutes } =
    dragState;
  lastDragCompletedAt = Date.now();
  lastDragMoved = Boolean(dragState.moved);
  clearDragState();
  if (!dayCol || !dayCol.dataset.day) {
    renderCalendar();
    return;
  }
  if (dayCol.dataset.day === originDayKey && minutes === originMinutes) {
    renderCalendar();
    return;
  }
  if (eventMeta.source === "external") {
    const payload = buildExternalUpdatePayload(
      eventMeta,
      dayCol.dataset.day,
      minutes,
      durationMinutes
    );
    if (!payload) {
      renderCalendar();
      return;
    }
    const previous = {
      eventId: eventMeta.eventId,
      calendarId: eventMeta.calendarId,
      start: eventMeta.start,
      end: eventMeta.end
    };
    showNotificationBanner("Saving...");
    try {
      await persistDraggedExternalEvent(payload);
      renderCalendar();
      showUndoBanner(formatRescheduledMessage(payload.start), async () => {
        showNotificationBanner("Undoing...");
        try {
          await persistDraggedExternalEvent(previous);
          renderCalendar();
          showNotificationBanner("Changes reverted.", { autoHideMs: 2500 });
        } catch (error) {
          console.warn("Failed to undo external calendar update.", error);
          showNotificationBanner("Unable to undo changes.", { autoHideMs: 3500 });
        }
      });
      return;
    } catch (error) {
      console.warn("Failed to update external calendar event.", error);
      showNotificationBanner("Failed to update Google Calendar event.", {
        autoHideMs: 3500
      });
    }
  } else {
    await persistDraggedEvent(eventMeta, dayCol.dataset.day, minutes, durationMinutes);
  }
  renderCalendar();
}

function handleCalendarEventClick(event) {
  if (event.target?.closest?.("a")) {return;}
  if (lastDragMoved && Date.now() - lastDragCompletedAt < 250) {return;}
  const deleteBtn = event.target.closest?.("[data-calendar-event-delete]");
  if (deleteBtn) {
    event.preventDefault();
    event.stopPropagation();
    deleteExternalEvent(deleteBtn);
    return;
  }
  const block = event.target.closest?.(".calendar-event");
  if (!block) {return;}
  const eventMeta = getEventMetaFromBlock(block);
  if (!eventMeta) {return;}
  if (eventMeta.source === "external") {
    handleExternalEventClick(eventMeta, block);
    return;
  }
  openCalendarEventModal(eventMeta, block);
}

function handleExternalEventClick(eventMeta, block) {
  const external = (state.calendarExternalEvents || []).find(
    (item) => item.id === eventMeta.eventId && item.calendarId === eventMeta.calendarId
  );
  const fallback = {
    id: eventMeta.eventId,
    calendarId: eventMeta.calendarId,
    title: block.dataset.eventTitle || "Calendar event",
    link: block.dataset.eventLink || "",
    start: eventMeta.start,
    end: eventMeta.end
  };
  openExternalEventModal(external || fallback, block);
}

function ensureCalendarDragHandlers() {
  const { calendarGrid } = domRefs;
  if (!calendarGrid || calendarGrid.dataset.dragReady === "true") {return;}
  calendarGrid.dataset.dragReady = "true";
  calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");
  calendarGrid.addEventListener("pointerdown", scheduleCalendarDrag);
  calendarGrid.addEventListener("click", handleCalendarEventClick);
  window.addEventListener("pointermove", handleCalendarDragMove);
  window.addEventListener("pointerup", handleCalendarDragEnd);
  window.addEventListener("pointercancel", handleCalendarDragEnd);
}

function updateCalendarTitle(viewMode) {
  const { calendarTitle } = domRefs;
  if (!calendarTitle) {return;}
  calendarTitle.textContent = getCalendarTitle(state.calendarAnchorDate, viewMode);
}

function getActiveCalendarViewMode() {
  return isCalendarSplitVisible() ? "day" : (state.calendarViewMode || "week");
}

function getViewStep(viewMode) {
  if (viewMode === "day") {return 1;}
  if (viewMode === "three") {return 3;}
  return 7;
}
function setCalendarViewMode(viewMode) {
  state.calendarViewMode = viewMode;
  updateUrlWithCalendarView(viewMode);
  renderCalendar();
}
function handleCalendarPrevClick() {
  const step = -getViewStep(getActiveCalendarViewMode());
  state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
  renderCalendar();
}
function handleCalendarNextClick() {
  const step = getViewStep(getActiveCalendarViewMode());
  state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
  renderCalendar();
}
function isCalendarSplitVisible() {
  return domRefs.tasksCalendarSplitWrap?.dataset?.split === "true";
}
function handleCalendarTodayClick() {
  state.calendarAnchorDate = new Date();
  renderCalendar();
  const block = isCalendarSplitVisible() ? "start" : "center";
  focusCalendarNow({ behavior: "auto", block });
}
function handleCalendarDayClick() { setCalendarViewMode("day"); }
function handleCalendarThreeClick() { setCalendarViewMode("three"); }
function handleCalendarWeekClick() { setCalendarViewMode("week"); }

function updateViewToggle(viewMode) {
  const { calendarDayBtn, calendarThreeBtn, calendarWeekBtn } = domRefs;
  if (calendarDayBtn) {
    calendarDayBtn.classList.toggle("calendar-view-btn--active", viewMode === "day");
  }
  if (calendarThreeBtn) {
    calendarThreeBtn.classList.toggle(
      "calendar-view-btn--active",
      viewMode === "three"
    );
  }
  if (calendarWeekBtn) {
    calendarWeekBtn.classList.toggle("calendar-view-btn--active", viewMode === "week");
  }
}

export function focusCalendarNow(options = {}) {
  const { behavior = "auto", block = "center" } = options;
  const calendarGrid = domRefs.calendarGrid || document.getElementById("calendar-grid");
  if (!calendarGrid) {return false;}
  const indicator = calendarGrid.querySelector(
    '[data-test-skedpal="calendar-now-indicator"]'
  );
  if (!indicator || typeof indicator.scrollIntoView !== "function") {return false;}
  indicator.scrollIntoView({ block, inline: "nearest", behavior });
  return true;
}

export function focusCalendarEvent(taskId, options = {}) {
  const { behavior = "auto" } = options;
  if (!taskId) {return false;}
  const calendarGrid = domRefs.calendarGrid || document.getElementById("calendar-grid");
  if (!calendarGrid) {return false;}
  clearCalendarEventFocus(calendarGrid);
  const eventBlock = calendarGrid.querySelector(`[data-event-task-id="${taskId}"]`);
  if (!eventBlock || typeof eventBlock.scrollIntoView !== "function") {return false;}
  focusCalendarEventBlock(eventBlock, { autoClearMs: 2500, pulse: true });
  eventBlock.scrollIntoView({ block: "center", inline: "nearest", behavior });
  return true;
}

export function renderCalendar(tasks = state.tasksCache) {
  const viewMode = getActiveCalendarViewMode();
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  const scheduledEvents = getScheduledEvents(tasks);
  const externalEvents = getExternalEventsForRange(range);
  const events = [...scheduledEvents, ...externalEvents].filter(
    (event) => event.end > range.start && event.start < range.end
  );
  const timeMapColorById = new Map(
    (state.tasksTimeMapsCache || [])
      .filter((timeMap) => timeMap?.id && timeMap?.color)
      .map((timeMap) => [timeMap.id, timeMap.color])
  );
  updateCalendarTitle(viewMode);
  updateViewToggle(viewMode);
  renderCalendarGrid(range, events, timeMapColorById, domRefs.calendarGrid, {
    splitView: isCalendarSplitVisible()
  });
  updateNowIndicator();
  if (!events.length) {
    domRefs.calendarGrid?.appendChild(buildEmptyState());
  }
  ensureExternalEvents(range)
    .then((updated) => {
      if (updated) {
        renderCalendar(tasks);
      }
    })
    .catch((error) => {
      console.warn("Failed to refresh external calendar events.", error);
    });
}

export function initCalendarView() {
  if (calendarViewInitialized) {
    renderCalendar();
    return;
  }
  calendarViewInitialized = true;
  state.calendarViewMode = parseCalendarViewFromUrl(state.calendarViewMode || "day");
  const {
    calendarPrevBtn,
    calendarNextBtn,
    calendarTodayBtn,
    calendarDayBtn,
    calendarThreeBtn,
    calendarWeekBtn
  } = domRefs;

  if (calendarPrevBtn) {
    calendarPrevBtn.addEventListener("click", handleCalendarPrevClick);
  }
  if (calendarNextBtn) {
    calendarNextBtn.addEventListener("click", handleCalendarNextClick);
  }
  if (calendarTodayBtn) {
    calendarTodayBtn.addEventListener("click", handleCalendarTodayClick);
  }
  if (calendarDayBtn) {
    calendarDayBtn.addEventListener("click", handleCalendarDayClick);
  }
  if (calendarThreeBtn) {
    calendarThreeBtn.addEventListener("click", handleCalendarThreeClick);
  }
  if (calendarWeekBtn) {
    calendarWeekBtn.addEventListener("click", handleCalendarWeekClick);
  }
  if (nowIndicatorTimer) {
    clearInterval(nowIndicatorTimer);
  }
  nowIndicatorTimer = window.setInterval(updateNowIndicator, 60 * 1000);
  renderCalendar();
  ensureCalendarDragHandlers();
  initCalendarEventModal();
}
