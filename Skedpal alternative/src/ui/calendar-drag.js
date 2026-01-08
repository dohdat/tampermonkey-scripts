import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import {
  getDateFromDayKey,
  roundMinutesToStep,
  clampMinutes,
  getMinutesIntoDay
} from "./calendar-utils.js";
import {
  buildEventMetaFromDataset,
  buildUpdatedTaskForDrag,
  formatRescheduledMessage
} from "./calendar-helpers.js";
import { saveTask } from "../data/db.js";
import { showNotificationBanner, showUndoBanner } from "./notifications.js";
import {
  buildExternalEventMeta,
  getUpdatedExternalEvents,
  sendExternalUpdateRequest
} from "./calendar-external-events.js";
import { HOUR_HEIGHT, formatEventTimeRange } from "./calendar-render.js";

const DRAG_STEP_MINUTES = 15;
const DRAG_ACTIVATION_DELAY = 80;
const DRAG_CANCEL_DISTANCE = 8;
let dragState = null;
let pendingDrag = null;
let resizeState = null;
let lastDragCompletedAt = 0;
let lastDragMoved = false;
let lastResizeCompletedAt = 0;
let lastResizeMoved = false;
let calendarDragCleanup = null;
let calendarRenderHandler = null;
let calendarClickHandler = null;

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

function updateDragTarget(dayCol, block, minutes, durationMinutes) {
  const top = (minutes / 60) * HOUR_HEIGHT;
  block.style.top = `${top}px`;
  const timeLabel = block.querySelector('[data-test-skedpal="calendar-event-time"]');
  if (timeLabel) {
    const start = getDateFromDayKey(dayCol.dataset.day);
    if (start) {
      start.setMinutes(minutes, 0, 0);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      timeLabel.textContent = formatEventTimeRange(start, end);
    }
  }
}

function updateResizeTarget(dayCol, block, startMinutes, endMinutes) {
  const height = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;
  block.style.height = `${Math.max(20, height)}px`;
  const timeLabel = block.querySelector('[data-test-skedpal="calendar-event-time"]');
  if (timeLabel) {
    const start = getDateFromDayKey(dayCol.dataset.day);
    if (start) {
      start.setMinutes(startMinutes, 0, 0);
      const end = new Date(start.getTime() + (endMinutes - startMinutes) * 60000);
      timeLabel.textContent = formatEventTimeRange(start, end);
    }
  }
}

function clearDragState() {
  if (!dragState) {return;}
  dragState.block?.classList?.remove("calendar-event--dragging");
  dragState.dayCol?.classList?.remove("calendar-day-col--drag-target");
  dragState = null;
}

function clearResizeState() {
  if (!resizeState) {return;}
  resizeState.block?.classList?.remove("calendar-event--resizing");
  resizeState = null;
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

function beginCalendarResize(event, handle) {
  if (pendingDrag?.timer) {
    clearTimeout(pendingDrag.timer);
    pendingDrag = null;
  }
  const block = handle?.closest?.(".calendar-event");
  if (!block || event.button !== 0) {return;}
  const dayCol = block.closest?.(".calendar-day-col");
  if (!dayCol || !dayCol.dataset.day) {return;}
  const eventMeta = getEventMetaFromBlock(block);
  if (!eventMeta || eventMeta.source === "external") {return;}
  const startMinutes = roundMinutesToStep(
    getMinutesIntoDay(eventMeta.start),
    DRAG_STEP_MINUTES
  );
  const endMinutes = roundMinutesToStep(
    getMinutesIntoDay(eventMeta.end),
    DRAG_STEP_MINUTES
  );
  resizeState = {
    block,
    dayCol,
    eventMeta,
    pointerId: event.pointerId,
    startMinutes,
    originEndMinutes: endMinutes,
    endMinutes,
    moved: false
  };
  block.classList.add("calendar-event--resizing");
  if (typeof block.setPointerCapture === "function") {
    block.setPointerCapture(event.pointerId);
  }
}

function scheduleCalendarDrag(event) {
  if (event.target?.closest?.("a")) {return;}
  if (event.target?.closest?.("[data-calendar-event-delete]")) {return;}
  if (event.target?.closest?.("[data-calendar-event-resize]")) {return;}
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
  if (!dragState) {return;}
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
  updateDragTarget(nextDayCol, dragState.block, minutes, dragState.durationMinutes);
}

function updateActiveResize(event) {
  if (!resizeState) {return;}
  const rect = resizeState.dayCol.getBoundingClientRect();
  const y = clampMinutes(event.clientY - rect.top, 0, rect.height);
  const pointerMinutes = (y / rect.height) * 24 * 60;
  const roundedMinutes = roundMinutesToStep(pointerMinutes, DRAG_STEP_MINUTES);
  const minEnd = resizeState.startMinutes + DRAG_STEP_MINUTES;
  const endMinutes = clampMinutes(roundedMinutes, minEnd, 24 * 60);
  if (endMinutes !== resizeState.endMinutes) {
    resizeState.moved = true;
  }
  resizeState.endMinutes = endMinutes;
  updateResizeTarget(resizeState.dayCol, resizeState.block, resizeState.startMinutes, endMinutes);
}

function handleCalendarPointerDown(event) {
  const resizeHandle = event.target?.closest?.("[data-calendar-event-resize]");
  if (resizeHandle) {
    beginCalendarResize(event, resizeHandle);
    return;
  }
  scheduleCalendarDrag(event);
}

function handleCalendarPointerMove(event) {
  if (resizeState) {
    updateActiveResize(event);
    return;
  }
  updatePendingDrag(event);
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
    calendarRenderHandler?.();
    return;
  }
  if (dayCol.dataset.day === originDayKey && minutes === originMinutes) {
    calendarRenderHandler?.();
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
      calendarRenderHandler?.();
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
      calendarRenderHandler?.();
      showUndoBanner(formatRescheduledMessage(payload.start), async () => {
        showNotificationBanner("Undoing...");
        try {
          await persistDraggedExternalEvent(previous);
          calendarRenderHandler?.();
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
  calendarRenderHandler?.();
}

async function handleCalendarResizeEnd() {
  if (!resizeState) {return;}
  const { eventMeta, dayCol, startMinutes, endMinutes, originEndMinutes } = resizeState;
  lastResizeCompletedAt = Date.now();
  lastResizeMoved = Boolean(resizeState.moved);
  clearResizeState();
  if (!dayCol || !dayCol.dataset.day) {
    calendarRenderHandler?.();
    return;
  }
  if (!lastResizeMoved || endMinutes === originEndMinutes) {
    calendarRenderHandler?.();
    return;
  }
  const durationMinutes = Math.max(DRAG_STEP_MINUTES, endMinutes - startMinutes);
  await persistDraggedEvent(eventMeta, dayCol.dataset.day, startMinutes, durationMinutes);
  calendarRenderHandler?.();
}

async function handleCalendarPointerEnd() {
  if (resizeState) {
    await handleCalendarResizeEnd();
    return;
  }
  await handleCalendarDragEnd();
}

function handleCalendarEventClick(event) {
  if (!calendarClickHandler) {return;}
  if (lastDragMoved && Date.now() - lastDragCompletedAt < 250) {return;}
  if (lastResizeMoved && Date.now() - lastResizeCompletedAt < 250) {return;}
  calendarClickHandler(event);
}

export function ensureCalendarDragHandlers(options = {}) {
  const { onRender, onEventClick } = options;
  if (onRender) {calendarRenderHandler = onRender;}
  if (onEventClick) {calendarClickHandler = onEventClick;}
  const { calendarGrid } = domRefs;
  if (!calendarGrid || calendarGrid.dataset.dragReady === "true") {return;}
  calendarGrid.dataset.dragReady = "true";
  calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");
  calendarGrid.addEventListener("pointerdown", handleCalendarPointerDown);
  calendarGrid.addEventListener("click", handleCalendarEventClick);
  window.addEventListener("pointermove", handleCalendarPointerMove);
  window.addEventListener("pointerup", handleCalendarPointerEnd);
  window.addEventListener("pointercancel", handleCalendarPointerEnd);
  calendarDragCleanup = () => {
    calendarGrid.removeEventListener("pointerdown", handleCalendarPointerDown);
    calendarGrid.removeEventListener("click", handleCalendarEventClick);
    window.removeEventListener("pointermove", handleCalendarPointerMove);
    window.removeEventListener("pointerup", handleCalendarPointerEnd);
    window.removeEventListener("pointercancel", handleCalendarPointerEnd);
    calendarGrid.dataset.dragReady = "false";
  };
}

export function cleanupCalendarDragHandlers() {
  if (!calendarDragCleanup) {return;}
  calendarDragCleanup();
  calendarDragCleanup = null;
}
