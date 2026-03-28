import { TWO_THOUSAND_FIVE_HUNDRED, domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { clearCalendarEventFocus, focusCalendarEventBlock } from "./calendar-focus.js";

function clearPersistedCalendarFocus() {
  if (state.calendarFocusClearTimer) {
    if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
      window.clearTimeout(state.calendarFocusClearTimer);
    }
    state.calendarFocusClearTimer = null;
  }
  state.calendarFocusTaskId = "";
  state.calendarFocusBehavior = "auto";
}

function persistCalendarFocus(taskId, behavior, autoClearMs) {
  if (!taskId) {
    clearPersistedCalendarFocus();
    return;
  }
  if (state.calendarFocusClearTimer) {
    if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
      window.clearTimeout(state.calendarFocusClearTimer);
    }
    state.calendarFocusClearTimer = null;
  }
  state.calendarFocusTaskId = taskId;
  state.calendarFocusBehavior = behavior || "auto";
  if (autoClearMs > 0 && typeof window !== "undefined" && typeof window.setTimeout === "function") {
    state.calendarFocusClearTimer = window.setTimeout(() => {
      clearPersistedCalendarFocus();
    }, autoClearMs);
  }
}

export function focusCalendarEvent(taskId, options = {}) {
  const {
    behavior = "auto",
    persist = true,
    autoClearMs = TWO_THOUSAND_FIVE_HUNDRED,
    allowWithoutScroll = false
  } = options;
  if (!taskId) {return false;}
  const calendarGrid = domRefs.calendarGrid || document.getElementById("calendar-grid");
  if (!calendarGrid) {return false;}
  clearCalendarEventFocus(calendarGrid);
  const eventBlock = calendarGrid.querySelector(`[data-event-task-id="${taskId}"]`);
  if (!eventBlock) {return false;}
  focusCalendarEventBlock(eventBlock, { autoClearMs, pulse: true });
  if (persist) {
    persistCalendarFocus(taskId, behavior, autoClearMs);
  }
  if (typeof eventBlock.scrollIntoView === "function") {
    eventBlock.scrollIntoView({ block: "center", inline: "nearest", behavior });
    return true;
  }
  return allowWithoutScroll;
}
