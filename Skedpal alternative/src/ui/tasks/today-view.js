import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TASK_STATUS_SCHEDULED,
  domRefs
} from "../constants.js";
import { ensureExternalEvents, getExternalEventsForRange } from "../calendar-external.js";
import { formatEventTimeRange, getCalendarEventStyles } from "../calendar-render.js";
import { renderTaskCard } from "./task-card.js";
import { getSectionName, getSubsectionsFor } from "../sections-data.js";
import { normalizeTimeMap } from "../utils.js";

const URL_PATTERN = /https?:\/\/\S+/;
const UID_PATTERN = /#?UID:[^\s]+/;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return d;
}

export function getTodayRange(date = new Date()) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return { start: dayStart, end: dayEnd };
}

function getTodayStart(task, dayStart, dayEnd) {
  const instances = Array.isArray(task.scheduledInstances)
    ? task.scheduledInstances
    : [];
  const todayInstance = instances
    .map((instance) => {
      const start = instance?.start ? new Date(instance.start) : null;
      return start && !Number.isNaN(start) ? start : null;
    })
    .filter(Boolean)
    .find((start) => start >= dayStart && start <= dayEnd);
  if (todayInstance) {return todayInstance;}
  if (task.scheduledStart) {
    const start = new Date(task.scheduledStart);
    if (!Number.isNaN(start) && start >= dayStart && start <= dayEnd) {
      return start;
    }
  }
  return null;
}

function buildTodayTaskEntries(tasks, dayStart, dayEnd) {
  return (tasks || [])
    .filter((task) => !task.completed && task.scheduleStatus === TASK_STATUS_SCHEDULED)
    .map((task) => ({
      task,
      todayStart: getTodayStart(task, dayStart, dayEnd)
    }))
    .filter((entry) => entry.todayStart)
    .sort((a, b) => a.todayStart - b.todayStart)
    .map((entry) => ({ type: "task", start: entry.todayStart, task: entry.task }));
}

function renderTodayEmpty(list) {
  const empty = document.createElement("div");
  empty.className =
    "rounded-2xl border-dashed border-slate-800 bg-slate-900/50 px-4 py-6 text-sm text-slate-400";
  empty.textContent = "No tasks or calendar events scheduled for today.";
  empty.setAttribute("data-test-skedpal", "today-empty");
  list.appendChild(empty);
}

function buildParentMap(tasks) {
  return (tasks || []).reduce((map, task) => {
    if (task.subtaskParentId) {
      map.set(task.id, task.subtaskParentId);
    }
    return map;
  }, new Map());
}

function buildTaskDepthGetter(parentById) {
  const depthMemo = new Map();
  const getTaskDepthById = (taskId) => {
    if (!taskId) {return 0;}
    if (depthMemo.has(taskId)) {return depthMemo.get(taskId);}
    const parentId = parentById.get(taskId);
    if (!parentId) {
      depthMemo.set(taskId, 0);
      return 0;
    }
    const depth = getTaskDepthById(parentId) + 1;
    depthMemo.set(taskId, depth);
    return depth;
  };
  return getTaskDepthById;
}

function buildChildrenByParent(tasks) {
  return tasks.reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!pid) {return map;}
    if (!map.has(pid)) {map.set(pid, []);}
    map.get(pid).push(task);
    return map;
  }, new Map());
}

function buildDurationCalculator(childrenByParent) {
  const durationMemo = new Map();
  const computeTotalDuration = (task) => {
    if (!task?.id) {return 0;}
    if (durationMemo.has(task.id)) {return durationMemo.get(task.id);}
    const children = childrenByParent.get(task.id) || [];
    if (children.length === 0) {
      const own = Number(task.durationMin) || 0;
      durationMemo.set(task.id, own);
      return own;
    }
    const total = children.reduce((sum, child) => sum + computeTotalDuration(child), 0);
    durationMemo.set(task.id, total);
    return total;
  };
  return computeTotalDuration;
}

function buildSubsectionNameGetter() {
  return (sectionId, subsectionId) => {
    const subs = getSubsectionsFor(sectionId);
    return subs.find((s) => s.id === subsectionId)?.name || "";
  };
}

function buildExternalEventTitle(event) {
  const titleText = String(event?.title || "");
  const cleanedTitle = titleText.replace(UID_PATTERN, "").trim();
  const urlMatch = cleanedTitle.match(URL_PATTERN);
  const urlFromTitle = urlMatch ? urlMatch[0] : "";
  const displayText = urlFromTitle ? cleanedTitle.replace(URL_PATTERN, "").trim() : cleanedTitle;
  const fallbackTitle = displayText || "(No title)";
  const linkUrl = urlFromTitle || event?.link || "";
  if (linkUrl) {
    const title = document.createElement("a");
    title.className =
      "text-sm font-semibold text-lime-300 hover:text-lime-200 underline decoration-lime-400";
    title.href = linkUrl;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = displayText || linkUrl || fallbackTitle;
    title.setAttribute("data-test-skedpal", "today-external-title-link");
    return title;
  }
  const title = document.createElement("div");
  title.className = "text-sm font-semibold text-slate-100";
  title.textContent = fallbackTitle;
  title.setAttribute("data-test-skedpal", "today-external-title");
  return title;
}

function buildExternalEventBadge(styles) {
  const badge = document.createElement("span");
  badge.className =
    "inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300";
  badge.textContent = "Google Calendar";
  badge.setAttribute("data-test-skedpal", "today-external-badge");
  if (styles?.borderColor) {
    badge.style.borderColor = styles.borderColor;
    badge.style.color = styles.borderColor;
  }
  return badge;
}

function buildExternalEventCard(event, dayStart, dayEnd) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow";
  card.setAttribute("data-test-skedpal", "today-external-card");
  card.dataset.eventId = event?.id || "";
  card.dataset.calendarId = event?.calendarId || "";
  const styles = getCalendarEventStyles(event);
  if (styles) {
    card.style.borderColor = styles.borderColor;
    card.style.backgroundColor = styles.backgroundColor;
  }

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-start justify-between gap-2";
  header.setAttribute("data-test-skedpal", "today-external-header");

  const titleWrap = document.createElement("div");
  titleWrap.className = "flex min-w-0 flex-col gap-1";
  titleWrap.setAttribute("data-test-skedpal", "today-external-title-wrap");
  titleWrap.appendChild(buildExternalEventTitle(event));

  const time = document.createElement("div");
  const displayStart = event.start < dayStart ? dayStart : event.start;
  const displayEnd = event.end > dayEnd ? dayEnd : event.end;
  time.className = "text-xs text-slate-400";
  time.textContent = formatEventTimeRange(displayStart, displayEnd);
  time.setAttribute("data-test-skedpal", "today-external-time");
  titleWrap.appendChild(time);

  header.appendChild(titleWrap);
  header.appendChild(buildExternalEventBadge(styles));
  card.appendChild(header);
  return card;
}

function buildExternalEventEntries(dayStart, dayEnd) {
  const externalEvents = getExternalEventsForRange({ start: dayStart, end: dayEnd });
  return (externalEvents || []).map((event) => ({
    type: "external",
    start: event.start < dayStart ? dayStart : event.start,
    event
  }));
}

export function renderTodayView(tasks, timeMaps, options = {}) {
  const list = domRefs.todayList;
  if (!list) {return;}
  list.innerHTML = "";
  const now = options.now ? new Date(options.now) : new Date();
  const collapsedTasks =
    options.collapsedTasks instanceof Set ? options.collapsedTasks : new Set();
  const expandedTaskDetails =
    options.expandedTaskDetails instanceof Set ? options.expandedTaskDetails : new Set();
  const { start: dayStart, end: dayEnd } = getTodayRange(now);
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const taskEntries = buildTodayTaskEntries(tasks, dayStart, dayEnd);
  const externalEntries = buildExternalEventEntries(dayStart, dayEnd);
  const todayEntries = [...taskEntries, ...externalEntries].sort(
    (a, b) => a.start - b.start
  );
  const todayTasks = taskEntries.map((entry) => entry.task);

  if (todayEntries.length === 0) {
    renderTodayEmpty(list);
    return;
  }

  const parentById = buildParentMap(tasks);
  const getTaskDepthById = buildTaskDepthGetter(parentById);
  const childrenByParent = buildChildrenByParent(todayTasks);
  const computeTotalDuration = buildDurationCalculator(childrenByParent);
  const getSubsectionName = buildSubsectionNameGetter();
  todayEntries.forEach((entry) => {
    if (entry.type === "external") {
      list.appendChild(buildExternalEventCard(entry.event, dayStart, dayEnd));
      return;
    }
    list.appendChild(
      renderTaskCard(entry.task, {
        tasks: todayTasks,
        timeMapById,
        collapsedTasks,
        expandedTaskDetails,
        computeTotalDuration,
        getTaskDepthById,
        getSectionName,
        getSubsectionName
      })
    );
  });
}

export async function refreshTodayView(tasks, timeMaps, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  renderTodayView(tasks, timeMaps, { ...options, now });
  const updated = await ensureExternalEvents(getTodayRange(now));
  if (updated) {
    renderTodayView(tasks, timeMaps, { ...options, now });
  }
  return updated;
}
