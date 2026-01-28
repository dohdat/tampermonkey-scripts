import {
  DAYS_PER_WEEK,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  SPLIT_VIEW_FOCUS_OFFSET_PX,
  SPLIT_VIEW_FOCUS_PADDING_PX,
  THREE,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TASK_REPEAT_NONE,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_UNSCHEDULED,
  domRefs
} from "./constants.js";
import { state } from "./state/page-state.js";
import {
  addCalendarDays,
  getCalendarRange,
  getCalendarTitle,
  getDayKey
} from "./calendar-utils.js";
import { parseCalendarViewFromUrl, updateUrlWithCalendarView } from "./utils.js";
import {
  buildEventMetaFromDataset,
  buildUpdatedTaskForPin,
  getScheduledEvents
} from "./calendar-helpers.js";
export { buildUpdatedTaskForDrag, formatRescheduledMessage } from "./calendar-helpers.js";
export { buildExternalUpdatePayload } from "./calendar-drag.js";
import {
  cleanupCalendarEventModal,
  initCalendarEventModal,
  openCalendarEventModal,
  openExternalEventModal
} from "./calendar-event-modal.js";
import {
  clearCalendarEventFocus,
  focusCalendarEventBlock
} from "./calendar-focus.js";
import {
  ensureExternalEvents,
  getExternalEventsForRange,
  hydrateExternalEvents,
  markExternalEventsCacheDirty,
  syncExternalEventsCache
} from "./calendar-external.js";
import { ensureCalendarDragHandlers, cleanupCalendarDragHandlers } from "./calendar-drag.js";
import {
  initCalendarCreateModal,
  openCalendarCreateFromClick,
  cleanupCalendarCreateModal
} from "./calendar-create-event.js";
import {
  buildExternalEventMeta,
  sendExternalDeleteRequest
} from "./calendar-external-events.js";
import { saveTask } from "../data/db.js";
import { getTaskAndDescendants } from "./utils.js";
import { showUndoBanner } from "./notifications.js";
import {
  HOUR_HEIGHT,
  buildEmptyState,
  renderCalendarGrid
} from "./calendar-render.js";

let nowIndicatorTimer = null;
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

function emitTasksUpdated() {
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
}

function getOccurrenceIsoFromMeta(eventMeta) {
  if (!eventMeta?.start) {return null;}
  const occurrenceDate = new Date(eventMeta.start);
  if (Number.isNaN(occurrenceDate.getTime())) {return null;}
  occurrenceDate.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return occurrenceDate.toISOString();
}

export async function completeScheduledTask(eventMeta) {
  const task = state.tasksCache.find((candidate) => candidate.id === eventMeta.taskId);
  if (!task) {return;}
  if (task.repeat?.type && task.repeat.type !== TASK_REPEAT_NONE) {
    const occurrenceIso = getOccurrenceIsoFromMeta(eventMeta);
    if (!occurrenceIso) {return;}
    window.dispatchEvent(
      new CustomEvent("skedpal:repeat-occurrence-complete", {
        detail: { taskId: task.id, occurrenceIso }
      })
    );
    return;
  }
  const affected = getTaskAndDescendants(task.id, state.tasksCache);
  if (!affected.length) {return;}
  const snapshots = affected.map((t) => JSON.parse(JSON.stringify(t)));
  const timestamp = new Date().toISOString();
  const updates = affected.map((entry) => {
    const currentStatus = entry.scheduleStatus || TASK_STATUS_UNSCHEDULED;
    const scheduleStatus =
      currentStatus === TASK_STATUS_COMPLETED ? currentStatus : TASK_STATUS_COMPLETED;
    return {
      ...entry,
      completed: true,
      completedAt: timestamp,
      scheduleStatus
    };
  });
  await Promise.all(updates.map((item) => saveTask(item)));
  emitTasksUpdated();
  const name = task.title || "Untitled task";
  showUndoBanner(`Completed "${name}".`, async () => {
    await Promise.all(snapshots.map((snap) => saveTask(snap)));
    emitTasksUpdated();
  });
}

function handleCalendarActionButtons(event) {
  const target = event?.target;
  if (!target) {return false;}
  const deleteBtn = target.closest?.("[data-calendar-event-delete]");
  if (deleteBtn) {
    event.preventDefault();
    event.stopPropagation();
    deleteExternalEvent(deleteBtn);
    return true;
  }
  const pinBtn = target.closest?.("[data-calendar-event-pin]");
  if (pinBtn) {
    event.preventDefault();
    event.stopPropagation();
    const block = pinBtn.closest?.(".calendar-event");
    if (!block) {return true;}
    const eventMeta = getEventMetaFromBlock(block);
    if (!eventMeta || eventMeta.source === "external") {return true;}
    togglePinnedTaskEvent(eventMeta);
    return true;
  }
  const completeBtn = target.closest?.("[data-calendar-event-complete]");
  if (completeBtn) {
    event.preventDefault();
    event.stopPropagation();
    const block = completeBtn.closest?.(".calendar-event");
    if (!block) {return true;}
    const eventMeta = getEventMetaFromBlock(block);
    if (!eventMeta) {return true;}
    completeScheduledTask(eventMeta);
    return true;
  }
  return false;
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

async function togglePinnedTaskEvent(eventMeta) {
  const task = state.tasksCache.find((candidate) => candidate.id === eventMeta.taskId);
  if (!task) {return;}
  const nextPinned = !eventMeta.pinned;
  const updated = buildUpdatedTaskForPin(task, eventMeta, nextPinned);
  if (!updated) {return;}
  await saveTask(updated);
  state.tasksCache = state.tasksCache.map((item) => (item.id === updated.id ? updated : item));
  renderCalendar();
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
    markExternalEventsCacheDirty();
    state.calendarExternalAllowFetch = true;
    await syncExternalEventsCache(state.calendarExternalEvents);
    renderCalendar();
  } catch (error) {
    console.warn("Failed to delete Google Calendar event.", error);
  } finally {
    externalDeletePending = false;
    setDeleteButtonState(deleteBtn, false);
  }
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
  const minutes =
    now.getHours() * MINUTES_PER_HOUR +
    now.getMinutes() +
    now.getSeconds() / MINUTES_PER_HOUR;
  const top = (minutes / MINUTES_PER_HOUR) * HOUR_HEIGHT;
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

function handleCalendarEventClick(event) {
  if (event.target?.closest?.("a")) {return;}
  if (handleCalendarActionButtons(event)) {return;}
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

function handleCalendarGridClick(event) {
  const block = event.target.closest?.(".calendar-event");
  if (block) {
    handleCalendarEventClick(event);
    return;
  }
  openCalendarCreateFromClick(event);
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
  if (viewMode === "three") {return THREE;}
  return DAYS_PER_WEEK;
}
function setCalendarViewMode(viewMode) {
  state.calendarViewMode = viewMode;
  updateUrlWithCalendarView(viewMode);
  state.calendarExternalAllowFetch = true;
  renderCalendar();
}
function handleCalendarPrevClick() {
  const step = -getViewStep(getActiveCalendarViewMode());
  state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
  state.calendarExternalAllowFetch = true;
  renderCalendar();
}
function handleCalendarNextClick() {
  const step = getViewStep(getActiveCalendarViewMode());
  state.calendarAnchorDate = addCalendarDays(state.calendarAnchorDate, step);
  state.calendarExternalAllowFetch = true;
  renderCalendar();
}
function isCalendarSplitVisible() {
  return domRefs.tasksCalendarSplitWrap?.dataset?.split === "true";
}

function isCalendarVisible() {
  return isCalendarSplitVisible() || domRefs.appShell?.dataset?.activeView === "calendar";
}

function getSplitViewFocusOffsetPx() {
  const header = domRefs.appHeader;
  if (header?.getBoundingClientRect) {
    const rect = header.getBoundingClientRect();
    if (Number.isFinite(rect?.height) && rect.height > 0) {
      return rect.height + SPLIT_VIEW_FOCUS_PADDING_PX;
    }
  }
  return SPLIT_VIEW_FOCUS_OFFSET_PX;
}

function scrollCalendarGridToIndicator(calendarGrid, indicator, offsetPx) {
  if (!calendarGrid || !indicator || !indicator.getBoundingClientRect) {return false;}
  const gridRect = calendarGrid.getBoundingClientRect?.();
  const indicatorRect = indicator.getBoundingClientRect?.();
  if (!gridRect || !indicatorRect) {return false;}
  const delta = indicatorRect.top - gridRect.top - offsetPx;
  if (!Number.isFinite(delta)) {return false;}
  const nextTop = Math.max(0, (calendarGrid.scrollTop || 0) + delta);
  calendarGrid.scrollTop = nextTop;
  return true;
}
function handleCalendarTodayClick() {
  state.calendarAnchorDate = new Date();
  state.calendarExternalAllowFetch = true;
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
  if (!indicator) {return false;}
  if (isCalendarSplitVisible()) {
    const offsetPx =
      Number.isFinite(options.offsetPx) && options.offsetPx >= 0
        ? options.offsetPx
        : getSplitViewFocusOffsetPx();
    return scrollCalendarGridToIndicator(calendarGrid, indicator, offsetPx);
  }
  if (typeof indicator.scrollIntoView !== "function") {return false;}
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

export async function renderCalendar(tasks = state.tasksCache) {
  const viewMode = getActiveCalendarViewMode();
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  await hydrateExternalEvents(range, viewMode);
  const scheduledEvents = getScheduledEvents(tasks);
  const externalEvents = getExternalEventsForRange(range, viewMode);
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
  if (isCalendarVisible() && state.calendarExternalAllowFetch) {
    state.calendarExternalAllowFetch = false;
    ensureExternalEvents(range, viewMode)
      .then((updated) => {
        if (updated) {
          renderCalendar(tasks);
        }
      })
      .catch((error) => {
        console.warn("Failed to refresh external calendar events.", error);
      });
  }
}

export function cleanupCalendarView() {
  if (!calendarViewInitialized) {return;}
  const {
    calendarPrevBtn,
    calendarNextBtn,
    calendarTodayBtn,
    calendarDayBtn,
    calendarThreeBtn,
    calendarWeekBtn
  } = domRefs;
  calendarPrevBtn?.removeEventListener("click", handleCalendarPrevClick);
  calendarNextBtn?.removeEventListener("click", handleCalendarNextClick);
  calendarTodayBtn?.removeEventListener("click", handleCalendarTodayClick);
  calendarDayBtn?.removeEventListener("click", handleCalendarDayClick);
  calendarThreeBtn?.removeEventListener("click", handleCalendarThreeClick);
  calendarWeekBtn?.removeEventListener("click", handleCalendarWeekClick);
  if (nowIndicatorTimer) {
    clearInterval(nowIndicatorTimer);
    nowIndicatorTimer = null;
  }
  cleanupCalendarDragHandlers();
  cleanupCalendarCreateModal();
  cleanupCalendarEventModal();
  calendarViewInitialized = false;
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
  nowIndicatorTimer = window.setInterval(updateNowIndicator, MS_PER_MINUTE);
  renderCalendar();
  ensureCalendarDragHandlers({
    onRender: renderCalendar,
    onEventClick: handleCalendarGridClick
  });
  initCalendarCreateModal({ onRender: renderCalendar });
  initCalendarEventModal();
}
