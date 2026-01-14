import {
  DAYS_PER_WEEK,
  FOURTEEN,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  SPLIT_VIEW_FOCUS_OFFSET_PX,
  SPLIT_VIEW_FOCUS_PADDING_PX,
  THREE,
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
  getScheduledEvents
} from "./calendar-helpers.js";
export { buildUpdatedTaskForDrag, formatRescheduledMessage } from "./calendar-helpers.js";
export { buildExternalUpdatePayload } from "./calendar-drag.js";
import {
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
  syncExternalEventsCache
} from "./calendar-external.js";
import { ensureCalendarDragHandlers } from "./calendar-drag.js";
import { initCalendarCreateModal, openCalendarCreateFromClick } from "./calendar-create-event.js";
import {
  buildExternalEventMeta,
  sendExternalDeleteRequest
} from "./calendar-external-events.js";
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

function isCalendarVisible() {
  return isCalendarSplitVisible() || domRefs.appShell?.dataset?.activeView === "calendar";
}

function getExternalFetchRange() {
  const horizonDays = Number(state.settingsCache?.schedulingHorizonDays);
  const safeDays = Number.isFinite(horizonDays) && horizonDays > 0 ? horizonDays : FOURTEEN;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = addCalendarDays(start, safeDays);
  return { start, end };
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
  if (isCalendarVisible() && state.calendarExternalAllowFetch) {
    state.calendarExternalAllowFetch = false;
    const fetchRange = getExternalFetchRange();
    ensureExternalEvents(fetchRange)
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
