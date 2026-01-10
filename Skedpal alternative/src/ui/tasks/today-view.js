import { TASK_STATUS_SCHEDULED, domRefs } from "../constants.js";
import { renderTaskCard } from "./task-card.js";
import { getSectionName, getSubsectionsFor } from "../sections-data.js";
import { normalizeTimeMap } from "../utils.js";

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
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

function buildTodayTasks(tasks, dayStart, dayEnd) {
  return (tasks || [])
    .filter((task) => !task.completed && task.scheduleStatus === TASK_STATUS_SCHEDULED)
    .map((task) => ({
      task,
      todayStart: getTodayStart(task, dayStart, dayEnd)
    }))
    .filter((entry) => entry.todayStart)
    .sort((a, b) => a.todayStart - b.todayStart)
    .map((entry) => entry.task);
}

function renderTodayEmpty(list) {
  const empty = document.createElement("div");
  empty.className =
    "rounded-2xl border-dashed border-slate-800 bg-slate-900/50 px-4 py-6 text-sm text-slate-400";
  empty.textContent = "No tasks scheduled for today.";
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

export function renderTodayView(tasks, timeMaps, options = {}) {
  const list = domRefs.todayList;
  if (!list) {return;}
  list.innerHTML = "";
  const now = options.now ? new Date(options.now) : new Date();
  const collapsedTasks =
    options.collapsedTasks instanceof Set ? options.collapsedTasks : new Set();
  const expandedTaskDetails =
    options.expandedTaskDetails instanceof Set ? options.expandedTaskDetails : new Set();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const todayTasks = buildTodayTasks(tasks, dayStart, dayEnd);

  if (todayTasks.length === 0) {
    renderTodayEmpty(list);
    return;
  }

  const parentById = buildParentMap(tasks);
  const getTaskDepthById = buildTaskDepthGetter(parentById);
  const childrenByParent = buildChildrenByParent(todayTasks);
  const computeTotalDuration = buildDurationCalculator(childrenByParent);
  const getSubsectionName = buildSubsectionNameGetter();
  todayTasks.forEach((task) => {
    list.appendChild(
      renderTaskCard(task, {
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
