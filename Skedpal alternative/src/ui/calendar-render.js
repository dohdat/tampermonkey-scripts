import { addCalendarDays, getDayKey } from "./calendar-utils.js";
import { buildDayEventLayout } from "./calendar-layout.js";
import { removeIconSvg } from "./constants.js";

export const HOUR_HEIGHT = 120;
const EVENT_GUTTER = 2;
const EVENT_EDGE_INSET = 8;
const EVENT_OVERLAP_INSET = 4;

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
  const intVal = Number.parseInt(normalized.slice(1), 16);
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getExternalEventStyles(event) {
  const colorHex = normalizeHexColor(event?.colorHex || "");
  if (colorHex) {
    return {
      backgroundColor: hexToRgba(colorHex, 0.22),
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
  const color = timeMapColorById?.get?.(event?.timeMapId || "");
  if (!color) {return null;}
  return {
    backgroundColor: `${color}1a`,
    borderColor: color
  };
}

function formatHourLabel(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildCalendarHeader(range) {
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
  return header;
}

function buildCalendarTimeColumn() {
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
  return timeCol;
}

function applyEventDataset(block, item) {
  const source = item.event.source || "task";
  block.dataset.eventSource = source;
  if (source === "task") {
    block.dataset.eventTaskId = item.event.taskId;
    block.dataset.eventOccurrenceId = item.event.occurrenceId || "";
    block.dataset.eventTimeMapId = item.event.timeMapId || "";
    block.dataset.eventStart = item.event.start.toISOString();
    block.dataset.eventEnd = item.event.end.toISOString();
    block.dataset.eventInstanceIndex = String(item.event.instanceIndex);
    return source;
  }
  block.classList.add("calendar-event--external");
  block.dataset.eventExternalId = item.event.id || "";
  block.dataset.eventCalendarId = item.event.calendarId || "";
  block.dataset.eventTitle = item.event.title || "";
  block.dataset.eventStart = item.event.start.toISOString();
  block.dataset.eventEnd = item.event.end.toISOString();
  return source;
}

function buildEventTitle(item) {
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

function buildCalendarEventBlock(item, timeMapColorById) {
  const top = (item.startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(20, ((item.endMinutes - item.startMinutes) / 60) * HOUR_HEIGHT);
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
  const source = applyEventDataset(block, item);
  const styles = getCalendarEventStyles(item.event, timeMapColorById);
  if (styles) {
    block.style.backgroundColor = styles.backgroundColor;
    block.style.borderColor = styles.borderColor;
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
  }
  block.appendChild(time);
  return block;
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

export function renderCalendarGrid(range, events, timeMapColorById, calendarGrid) {
  if (!calendarGrid) {return;}
  calendarGrid.innerHTML = "";
  calendarGrid.style.setProperty("--calendar-hour-height", `${HOUR_HEIGHT}px`);
  const header = buildCalendarHeader(range);
  const body = document.createElement("div");
  body.className = "calendar-grid-body";
  body.setAttribute("data-test-skedpal", "calendar-grid-body");
  body.style.gridTemplateColumns = "90px 1fr";
  const timeCol = buildCalendarTimeColumn();
  const daysWrap = buildCalendarDays(range, events, timeMapColorById);
  body.appendChild(timeCol);
  body.appendChild(daysWrap);
  calendarGrid.appendChild(header);
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
