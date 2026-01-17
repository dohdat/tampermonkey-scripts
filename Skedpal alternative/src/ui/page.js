import { domRefs } from "./constants.js";
import { renderDayRows, loadTimeMaps } from "./time-maps.js";
import { initSettings } from "./settings.js";
import { loadTaskTemplates } from "./task-templates.js";
import {
  loadTasks,
  updateScheduleSummary,
  openNewTaskWithDefaults
} from "./tasks/tasks-actions.js";
import {
  initViewFromUrl,
  pushNavigation
} from "./navigation.js";
import {
  parseNewTaskFromUrl,
  parseZoomFromUrl,
  parseViewFromUrl
} from "./utils.js";
import { state } from "./state/page-state.js";
import { initCalendarView, renderCalendar } from "./calendar.js";
import { getCalendarRange } from "./calendar-utils.js";
import { refreshExternalEvents } from "./calendar-external.js";
import { applyTheme } from "./theme.js";
import { registerEventListeners } from "./page-listeners.js";

async function hydrate() {
  renderDayRows(domRefs.timeMapDayRows);
  await initSettings();
  await loadTimeMaps();
  const initialZoom = parseZoomFromUrl();
  if (initialZoom) {
    state.zoomFilter = initialZoom;
  }
  await loadTasks();
  await loadTaskTemplates();
  const isCalendarView = domRefs.appShell?.dataset?.activeView === "calendar";
  const isCalendarSplit = domRefs.tasksCalendarSplitWrap?.dataset?.split === "true";
  const viewMode = state.calendarViewMode || "day";
  const range = getCalendarRange(state.calendarAnchorDate, viewMode);
  const refreshPromise = refreshExternalEvents(range, viewMode, {
    allowStateUpdate: isCalendarView || isCalendarSplit
  }).catch((error) => {
    console.warn("Failed to refresh external calendar events on load.", error);
  });
  if (isCalendarView || isCalendarSplit) {
    await renderCalendar();
    refreshPromise.then((updated) => {
      if (updated) {
        renderCalendar();
      }
    });
  }
  if (initialZoom) {
    pushNavigation(initialZoom);
  } else {
    pushNavigation(null);
  }
  await updateScheduleSummary();
}

function clearNewTaskParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("newTask");
  url.searchParams.delete("title");
  url.searchParams.delete("url");
  history.replaceState({}, "", url.toString());
}

function handleNewTaskIntentFromUrl() {
  const payload = parseNewTaskFromUrl();
  if (!payload) {return;}
  openNewTaskWithDefaults(payload);
  clearNewTaskParams();
}

applyTheme();
initViewFromUrl(parseViewFromUrl);
registerEventListeners();
initCalendarView();
hydrate()
  .catch((error) => {
    console.error("Failed to hydrate SkedPal page.", error);
  })
  .finally(() => {
    handleNewTaskIntentFromUrl();
  });
