import { addCalendarDays, getDayKey } from "./calendar-utils.js";
import { buildDayEventLayout } from "./calendar-layout.js";
import {
  CALENDAR_ALL_DAY_LABEL,
  EIGHT,
  FOUR,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  ONE_TWENTY,
  OPACITY_TWENTY_TWO,
  SEVEN,
  SIXTEEN,
  TWENTY,
  TWO,
  TWO_FIFTY_FIVE,
  removeIconSvg,
  pinIconSvg,
  checkboxIconSvg
} from "./constants.js";
import { themeColors } from "./theme.js";
import { state } from "./state/page-state.js";

export const HOUR_HEIGHT = ONE_TWENTY;
const EVENT_GUTTER = TWO;
const EVENT_EDGE_INSET = EIGHT;
const EVENT_OVERLAP_INSET = FOUR;
const URL_PATTERN = /https?:\/\/\S+/;
const UID_PATTERN = /#?UID:[^\s]+/;

export function formatEventTimeRange(start, end) {
  const startLabel = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

const FALLBACK_EXTERNAL_RGB_VARS = [
  "--color-blue-500-rgb",
  "--color-green-500-rgb",
  "--color-purple-500-rgb",
  "--color-red-400-rgb",
  "--color-amber-400-rgb",
  "--color-orange-500-rgb",
  "--color-teal-400-rgb",
  "--color-slate-400-rgb",
  "--color-blue-400-rgb",
  "--color-green-400-rgb",
  "--color-orange-400-rgb"
];

const PRIORITY_COLORS = {
  1: themeColors.slate400,
  2: themeColors.blue400,
  3: themeColors.sky400,
  4: themeColors.amber400,
  5: themeColors.orange500
};

function resolveTaskBackgroundMode() {
  const mode = state.settingsCache?.taskBackgroundMode || "priority";
  if (mode === "priority" || mode === "timemap" || mode === "none") {
    return mode;
  }
  return "priority";
}

function resolvePriorityBackgroundColor(priorityValue) {
  const color = PRIORITY_COLORS[priorityValue];
  return color ? `${color}1a` : "";
}

function getPaletteIndex(value, count) {
  if (!count) {return 0;}
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash + value.charCodeAt(i)) % count;
  }
  return hash;
}

function normalizeHexColor(value) {
  const hex = String(value || "").trim();
  if (!/^#([0-9a-f]{6})$/i.test(hex)) {return "";}
  return hex.toLowerCase();
}

function hexToRgba(hex, alpha = 1) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {return "";}
  const intVal = Number.parseInt(normalized.slice(1), SIXTEEN);
  const r = (intVal >> SIXTEEN) & TWO_FIFTY_FIVE;
  const g = (intVal >> EIGHT) & TWO_FIFTY_FIVE;
  const b = intVal & TWO_FIFTY_FIVE;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getExternalEventStyles(event) {
  const colorHex = normalizeHexColor(event?.colorHex || "");
  if (colorHex) {
    return {
      backgroundColor: hexToRgba(colorHex, OPACITY_TWENTY_TWO),
      borderColor: colorHex,
      color: colorHex
    };
  }
  const fallbackIndex = getPaletteIndex(
    String(event?.calendarId || event?.title || "external"),
    FALLBACK_EXTERNAL_RGB_VARS.length
  );
  const rgbVar = FALLBACK_EXTERNAL_RGB_VARS[fallbackIndex];
  return {
    backgroundColor: `rgba(var(${rgbVar}), .22)`,
    borderColor: `rgb(var(${rgbVar}))`,
    color: `rgb(var(${rgbVar}))`
  };
}

export function getCalendarEventStyles(event, timeMapColorById) {
  if (event?.source === "external") {
    return getExternalEventStyles(event);
  }
  const backgroundMode = resolveTaskBackgroundMode();
  if (backgroundMode === "priority") {
    const color = resolvePriorityBackgroundColor(Number(event?.priority) || 0);
    if (!color) {return null;}
    return {
      backgroundColor: color,
      borderColor: color.slice(0, SEVEN)
    };
  }
  if (backgroundMode === "none") {
    return {
      backgroundColor: `${themeColors.slate400}1a`,
      borderColor: themeColors.slate400
    };
  }
  const color = timeMapColorById?.get?.(event?.timeMapId || "");
  if (!color) {return null;}
  return {
    backgroundColor: `${color}1a`,
    borderColor: color
  };
}

function isAllDayExternalEvent(event) {
  return event?.source === "external" && Boolean(event?.allDay);
}

function formatHourLabel(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildCalendarHeader(range, options = {}) {
  const header = document.createElement("div");
  header.className = "calendar-grid-header";
  if (!options.splitView) {
    header.setAttribute("data-test-skedpal", "calendar-grid-header");
  } else {
    header.removeAttribute("data-test-skedpal");
  }
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
  return header;
}

function buildCalendarTimeColumn() {
  const timeCol = document.createElement("div");
  timeCol.className = "calendar-time-col";
  timeCol.setAttribute("data-test-skedpal", "calendar-time-col");
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const label = document.createElement("div");
    label.className = "calendar-time-label";
    label.textContent = formatHourLabel(hour);
    label.setAttribute("data-test-skedpal", "calendar-time-label");
    timeCol.appendChild(label);
  }
  return timeCol;
}

function applyTaskEventDataset(block, event) {
  block.dataset.eventTaskId = event.taskId;
  block.dataset.eventOccurrenceId = event.occurrenceId || "";
  block.dataset.eventTimeMapId = event.timeMapId || "";
  block.dataset.eventStart = event.start.toISOString();
  block.dataset.eventEnd = event.end.toISOString();
  block.dataset.eventInstanceIndex = String(event.instanceIndex);
  block.dataset.eventPinned = event.pinned ? "true" : "false";
}

function applyExternalEventDataset(block, event) {
  block.classList.add("calendar-event--external");
  block.dataset.eventPinned = "false";
  block.dataset.eventExternalId = event.id || "";
  block.dataset.eventCalendarId = event.calendarId || "";
  block.dataset.eventTitle = event.title || "";
  block.dataset.eventLink = event.link || "";
  block.dataset.eventStart = event.start.toISOString();
  block.dataset.eventEnd = event.end.toISOString();
}

function applyEventDataset(block, item) {
  const source = item.event.source || "task";
  block.dataset.eventSource = source;
  block.dataset.eventAllDay = item.event.allDay ? "true" : "false";
  if (source === "task") {
    applyTaskEventDataset(block, item.event);
    return source;
  }
  applyExternalEventDataset(block, item.event);
  return source;
}

function buildEventTitle(item) {
  const titleText = item.event.title || "";
  const cleanedTitle = titleText.replace(UID_PATTERN, "").trim();
  const urlMatch = cleanedTitle.match(URL_PATTERN);
  const urlFromTitle = urlMatch ? urlMatch[0] : "";
  const displayText = urlFromTitle
    ? cleanedTitle.replace(URL_PATTERN, "").trim()
    : cleanedTitle;
  const fallbackTitle = displayText || "(No title)";
  const linkUrl = urlFromTitle || item.event.link || "";
  if (linkUrl) {
    const title = document.createElement("a");
    title.className = "calendar-event-title calendar-event-title-link";
    title.href = linkUrl;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = displayText || linkUrl || fallbackTitle;
    title.setAttribute("data-test-skedpal", "calendar-event-title-link");
    return title;
  }
  const title = document.createElement("div");
  title.className = "calendar-event-title";
  title.textContent = fallbackTitle;
  title.setAttribute("data-test-skedpal", "calendar-event-title");
  return title;
}

function buildExternalDeleteButton(event) {
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "calendar-event-delete";
  deleteBtn.innerHTML = removeIconSvg;
  deleteBtn.title = "Delete from Google Calendar";
  deleteBtn.dataset.calendarEventDelete = "true";
  deleteBtn.dataset.eventId = event.id || "";
  deleteBtn.dataset.calendarId = event.calendarId || "";
  deleteBtn.dataset.eventTitle = event.title || "";
  deleteBtn.setAttribute("data-test-skedpal", "calendar-event-external-delete");
  return deleteBtn;
}

function buildCompleteButton(event) {
  const completeBtn = document.createElement("button");
  completeBtn.type = "button";
  completeBtn.className = "calendar-event-complete";
  completeBtn.innerHTML = checkboxIconSvg;
  completeBtn.title = "Mark completed";
  completeBtn.dataset.calendarEventComplete = "true";
  completeBtn.setAttribute("aria-label", `Complete ${event?.title || "task"}`);
  completeBtn.setAttribute("data-test-skedpal", "calendar-event-complete");
  return completeBtn;
}

function buildPinButton(event) {
  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "calendar-event-pin";
  pinBtn.innerHTML = pinIconSvg;
  pinBtn.title = event?.pinned ? "Unpin task" : "Pin task";
  pinBtn.dataset.calendarEventPin = "true";
  pinBtn.setAttribute("aria-pressed", event?.pinned ? "true" : "false");
  pinBtn.setAttribute("data-test-skedpal", "calendar-event-pin");
  if (event?.pinned) {
    pinBtn.classList.add("calendar-event-pin--active");
  }
  return pinBtn;
}

function buildResizeHandle() {
  const handle = document.createElement("div");
  handle.className = "calendar-event-resize-handle";
  handle.dataset.calendarEventResize = "true";
  handle.setAttribute("data-test-skedpal", "calendar-event-resize-handle");
  return handle;
}

function buildCalendarEventBlock(item, timeMapColorById) {
  const top = (item.startMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT;
  const height = Math.max(
    TWENTY,
    ((item.endMinutes - item.startMinutes) / MINUTES_PER_HOUR) * HOUR_HEIGHT
  );
  const block = document.createElement("div");
  block.className = "calendar-event";
  block.style.top = `${top}px`;
  block.style.height = `${height}px`;
  if (item.columnCount > 1) {
    const inset = EVENT_OVERLAP_INSET;
    const totalGutter = EVENT_GUTTER * (item.columnCount - 1);
    block.style.width = `calc((100% - ${totalGutter}px) / ${item.columnCount} - ${inset * TWO}px)`;
    block.style.left = `calc(${item.columnIndex} * ((100% - ${totalGutter}px) / ${item.columnCount}) + ${item.columnIndex * EVENT_GUTTER}px + ${inset}px)`;
    block.style.right = "auto";
  } else {
    block.style.left = `${EVENT_EDGE_INSET}px`;
    block.style.right = `${EVENT_EDGE_INSET}px`;
  }
  const source = applyEventDataset(block, item);
  const styles = getCalendarEventStyles(item.event, timeMapColorById);
  if (styles) {
    block.style.backgroundColor = styles.backgroundColor;
    block.style.borderColor = styles.borderColor;
  }
  if (source === "task") {
    block.classList.add("calendar-event--task");
    block.classList.add("calendar-event--pinnable");
    if (item.event.pinned) {
      block.classList.add("calendar-event--pinned");
    }
  }
  if (item.eventEnd < new Date()) {
    block.classList.add("calendar-event--past");
  }
  block.setAttribute("data-test-skedpal", "calendar-event");
  const title = buildEventTitle(item);
  if (source === "external") {
    const icon = buildExternalEventIcon();
    title.prepend(icon);
  }
  const time = document.createElement("div");
  time.className = "calendar-event-time";
  time.textContent = formatEventTimeRange(item.eventStart, item.eventEnd);
  time.setAttribute("data-test-skedpal", "calendar-event-time");
  block.appendChild(title);
  if (source === "external") {
    block.appendChild(buildExternalDeleteButton(item.event));
  } else {
    block.appendChild(buildCompleteButton(item.event));
    block.appendChild(buildPinButton(item.event));
  }
  block.appendChild(time);
  block.appendChild(buildResizeHandle());
  return block;
}

function splitEventsForCalendar(events = []) {
  const timedEvents = [];
  const allDayEvents = [];
  (events || []).forEach((event) => {
    if (isAllDayExternalEvent(event)) {
      allDayEvents.push(event);
      return;
    }
    timedEvents.push(event);
  });
  return { timedEvents, allDayEvents };
}

function sortAllDayEvents(events = []) {
  return [...events].sort((a, b) => {
    const startDelta = a.start.getTime() - b.start.getTime();
    if (startDelta !== 0) {return startDelta;}
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function buildAllDayEventBlock(event, timeMapColorById) {
  const item = { event };
  const block = document.createElement("div");
  block.className = "calendar-event calendar-event--all-day";
  const source = applyEventDataset(block, item);
  const styles = getCalendarEventStyles(event, timeMapColorById);
  if (styles) {
    block.style.backgroundColor = styles.backgroundColor;
    block.style.borderColor = styles.borderColor;
  }
  if (event.end < new Date()) {
    block.classList.add("calendar-event--past");
  }
  block.setAttribute("data-test-skedpal", "calendar-event");
  const title = buildEventTitle(item);
  if (source === "external") {
    title.prepend(buildExternalEventIcon());
  }
  const time = document.createElement("div");
  time.className = "calendar-event-time";
  time.textContent = CALENDAR_ALL_DAY_LABEL;
  time.setAttribute("data-test-skedpal", "calendar-event-time");
  block.appendChild(title);
  if (source === "external") {
    block.appendChild(buildExternalDeleteButton(event));
  }
  block.appendChild(time);
  return block;
}

function buildAllDayRow(range, allDayEvents, timeMapColorById) {
  if (!Array.isArray(allDayEvents) || !allDayEvents.length) {return null;}
  const row = document.createElement("div");
  row.className = "calendar-all-day-row";
  row.setAttribute("data-test-skedpal", "calendar-all-day-row");
  row.style.gridTemplateColumns = `90px repeat(${range.days}, minmax(0, 1fr))`;
  const label = document.createElement("div");
  label.className = "calendar-all-day-label";
  label.textContent = CALENDAR_ALL_DAY_LABEL;
  label.setAttribute("data-test-skedpal", "calendar-all-day-label");
  row.appendChild(label);
  for (let i = 0; i < range.days; i += 1) {
    const dayStart = addCalendarDays(range.start, i);
    const dayEnd = addCalendarDays(dayStart, 1);
    const dayKey = getDayKey(dayStart);
    const col = document.createElement("div");
    col.className = "calendar-all-day-col";
    col.dataset.day = dayKey;
    col.setAttribute("data-test-skedpal", "calendar-all-day-col");
    const dayEvents = sortAllDayEvents(
      allDayEvents.filter((event) => event.end > dayStart && event.start < dayEnd)
    );
    dayEvents.forEach((event) => {
      col.appendChild(buildAllDayEventBlock(event, timeMapColorById));
    });
    row.appendChild(col);
  }
  return row;
}

function buildCalendarDays(range, events, timeMapColorById) {
  const daysWrap = document.createElement("div");
  daysWrap.className = "calendar-days";
  daysWrap.setAttribute("data-test-skedpal", "calendar-days");
  daysWrap.style.gridTemplateColumns = `repeat(${range.days}, minmax(0, 1fr))`;
  const eventsByDay = new Map();
  events.forEach((event) => {
    const key = getDayKey(event.start);
    if (!eventsByDay.has(key)) {eventsByDay.set(key, []);}
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
      const block = buildCalendarEventBlock(item, timeMapColorById);
      col.appendChild(block);
    });
    daysWrap.appendChild(col);
  }
  return daysWrap;
}

export function renderCalendarGrid(range, events, timeMapColorById, calendarGrid, options = {}) {
  if (!calendarGrid) {return;}
  calendarGrid.innerHTML = "";
  calendarGrid.style.setProperty("--calendar-hour-height", `${HOUR_HEIGHT}px`);
  const { timedEvents, allDayEvents } = splitEventsForCalendar(events);
  const header = options.splitView ? null : buildCalendarHeader(range, options);
  const allDayRow = buildAllDayRow(range, allDayEvents, timeMapColorById);
  const body = document.createElement("div");
  body.className = "calendar-grid-body";
  body.setAttribute("data-test-skedpal", "calendar-grid-body");
  body.style.gridTemplateColumns = "90px 1fr";
  const timeCol = buildCalendarTimeColumn();
  const daysWrap = buildCalendarDays(range, timedEvents, timeMapColorById);
  body.appendChild(timeCol);
  body.appendChild(daysWrap);
  if (header) {
    calendarGrid.appendChild(header);
  }
  if (allDayRow) {
    calendarGrid.appendChild(allDayRow);
  }
  calendarGrid.appendChild(body);
}

export function buildEmptyState() {
  const empty = document.createElement("div");
  empty.className = "calendar-empty";
  empty.textContent = "No scheduled tasks in this range.";
  empty.setAttribute("data-test-skedpal", "calendar-empty");
  return empty;
}

function buildExternalEventIcon() {
  const icon = document.createElement("span");
  icon.className = "calendar-event-icon";
  icon.setAttribute("data-test-skedpal", "calendar-event-external-icon");
  icon.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M6 2h40a6 6 0 0 1 6 6v40H6a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"></path>
    <path fill="#1967D2" d="M46 2h12a6 6 0 0 1 6 6v16H52V8a6 6 0 0 0-6-6z"></path>
    <path fill="#FFFFFF" d="M14 18h36v30H14z"></path>
    <path fill="#FBBC04" d="M50 24h14v24a6 6 0 0 1-6 6H50z"></path>
    <path fill="#34A853" d="M14 48h36v10a6 6 0 0 1-6 6H14z"></path>
    <path fill="#188038" d="M0 48h14v10a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6z"></path>
    <path fill="#EA4335" d="M64 48v10a6 6 0 0 1-6 6H50z"></path>
    <path fill="#1A73E8" d="M28 42V24h6v18z"></path>
    <path fill="#1A73E8" d="M28 42v-6h12v6z"></path>
  </svg>`;
  return icon;
}
