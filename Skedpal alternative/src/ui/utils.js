import { SUBTASK_ORDER_OFFSET } from "./constants.js";

export function updateUrlWithZoom(filter) {
  const url = new URL(window.location.href);
  if (!filter) {
    url.searchParams.delete("zoom");
  } else {
    let parts = ["task", filter.taskId || "", filter.sectionId || "", filter.subsectionId || ""];
    if (filter.type === "section") {
      parts = ["section", filter.sectionId || ""];
    } else if (filter.type === "subsection") {
      parts = ["subsection", filter.sectionId || "", filter.subsectionId || ""];
    }
    url.searchParams.set("zoom", parts.join(":"));
  }
  history.replaceState({}, "", url.toString());
}

export function parseZoomFromUrl() {
  const url = new URL(window.location.href);
  const zoom = url.searchParams.get("zoom");
  if (!zoom) {return null;}
  const [type, a, b, c] = zoom.split(":");
  if (type === "section") {
    return { type, sectionId: a || "" };
  }
  if (type === "subsection") {
    return { type, sectionId: a || "", subsectionId: b || "" };
  }
  if (type === "task") {
    return { type, taskId: a || "", sectionId: b || "", subsectionId: c || "" };
  }
  return null;
}

export function updateUrlWithView(view) {
  const url = new URL(window.location.href);
  if (view) {
    url.searchParams.set("view", view);
  } else {
    url.searchParams.delete("view");
  }
  history.replaceState({}, "", url.toString());
}

export function parseViewFromUrl(defaultView = "tasks") {
  const url = new URL(window.location.href);
  return url.searchParams.get("view") || defaultView;
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export function normalizeTimeMap(timeMap) {
  if (Array.isArray(timeMap.rules) && timeMap.rules.length > 0) {
    return { ...timeMap, rules: timeMap.rules.map((r) => ({ ...r, day: Number(r.day) })) };
  }
  const days = timeMap.days || [];
  const startTime = timeMap.startTime || "09:00";
  const endTime = timeMap.endTime || "12:00";
  return {
    ...timeMap,
    rules: days.map((day) => ({ day: Number(day), startTime, endTime }))
  };
}

export function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date) ? date.toLocaleString() : "No date";
}

export function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date) ? date.toLocaleDateString() : "";
}

export function normalizeHorizonDays(value, min = 1, max = 60, fallback = 14) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {return fallback;}
  return Math.min(max, Math.max(min, parsed));
}

export function getInheritedSubtaskFields(parentTask) {
  if (!parentTask) {return {};}
  return {
    section: parentTask.section || "",
    subsection: parentTask.subsection || "",
    timeMapIds: Array.isArray(parentTask.timeMapIds) ? [...parentTask.timeMapIds] : [],
    priority: Number(parentTask.priority) || 0,
    minBlockMin: Number(parentTask.minBlockMin) || 0,
    deadline: parentTask.deadline || null,
    startFrom: parentTask.startFrom || null
  };
}

export function getLocalDateKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {return "";}
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateInput(value) {
  if (!value) {return null;}
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {return null;}
  const [year, month, day] = parts;
  const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) {return null;}
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null;
  }
  return localDate.toISOString();
}

export function isStartAfterDeadline(startFrom, deadline) {
  const startIso = parseLocalDateInput(startFrom);
  const deadlineIso = parseLocalDateInput(deadline);
  if (!startIso || !deadlineIso) {return false;}
  return new Date(startIso) > new Date(deadlineIso);
}

export function formatDurationShort(minutes) {
  const mins = Number(minutes) || 0;
  if (mins >= 60) {
    const hours = mins / 60;
    const rounded = Math.round(hours * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded}h`;
  }
  return `${Math.max(1, mins)}m`;
}

export function formatDurationLong(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (!mins) {return "0m";}
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (!hours) {return `${remainder}m`;}
  if (!remainder) {return `${hours}h`;}
  return `${hours}h ${remainder}m`;
}

export function toggleClearButtonVisibility(input, button) {
  if (!input || !button) {return false;}
  const hasValue = Boolean((input.value || "").trim());
  button.classList.toggle("hidden", !hasValue);
  return hasValue;
}

export function getWeekdayShortLabel(day) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "Sun";
}

export function getNthWeekday(date) {
  const day = date.getDay();
  const dayOfMonth = date.getDate();
  const nth = Math.ceil(dayOfMonth / 7);
  return { nth: nth > 4 ? -1 : nth, weekday: day };
}

export function formatOrdinal(n) {
  if (n === -1) {return "last";}
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {return `${n}st`;}
  if (mod10 === 2 && mod100 !== 12) {return `${n}nd`;}
  if (mod10 === 3 && mod100 !== 13) {return `${n}rd`;}
  return `${n}th`;
}

export function formatRRuleDate(dateStr) {
  if (!dateStr) {return "";}
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {return "";}
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}${m}${day}`;
}

export function normalizeSubtaskScheduleMode(value) {
  const valid = new Set(["parallel", "sequential", "sequential-single"]);
  return valid.has(value) ? value : "parallel";
}

export function sortTasksByOrder(list = []) {
  return [...list].sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (aOrder === bOrder) {
      return (a.title || "").localeCompare(b.title || "");
    }
    return aOrder - bOrder;
  });
}

export function getContainerKey(section, subsection) {
  return `${section || ""}__${subsection || ""}`;
}

export function getNextOrder(section, subsection, tasks = []) {
  const key = getContainerKey(section, subsection);
  const maxOrder = (tasks || []).reduce((max, task) => {
    if (getContainerKey(task.section, task.subsection) !== key) {return max;}
    const orderValue = Number(task.order);
    if (!Number.isFinite(orderValue)) {return max;}
    return Math.max(max, orderValue);
  }, 0);
  return maxOrder + 1;
}

export function getNextSubtaskOrder(parentTask, section, subsection, tasks = []) {
  if (!parentTask) {return getNextOrder(section, subsection, tasks);}
  const targetKey = getContainerKey(section, subsection);
  const siblings = sortTasksByOrder(
    (tasks || []).filter(
      (t) =>
        getContainerKey(t.section, t.subsection) === targetKey &&
        t.subtaskParentId === parentTask.id
    )
  );
  const baseline = siblings.length > 0 ? siblings[siblings.length - 1] : parentTask;
  const baseOrder = Number.isFinite(baseline.order) ? baseline.order : 0;
  return baseOrder + SUBTASK_ORDER_OFFSET;
}

export function getTaskDepth(taskId, tasks = []) {
  if (!taskId) {return 0;}
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const memo = new Map();
  const compute = (id) => {
    if (!id) {return 0;}
    if (memo.has(id)) {return memo.get(id);}
    const task = byId.get(id);
    if (!task?.subtaskParentId) {
      memo.set(id, 0);
      return 0;
    }
    const depth = compute(task.subtaskParentId) + 1;
    memo.set(id, depth);
    return depth;
  };
  return compute(taskId);
}

export function getTaskAndDescendants(taskId, tasks = []) {
  if (!taskId) {return [];}
  const byParent = (tasks || []).reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!map.has(pid)) {map.set(pid, []);}
    map.get(pid).push(task);
    return map;
  }, new Map());
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const result = [];
  const stack = [taskId];
  while (stack.length) {
    const current = stack.pop();
    const children = byParent.get(current) || [];
    children.forEach((child) => {
      result.push(child);
      stack.push(child.id);
    });
  }
  const root = byId.get(taskId);
  return root ? [root, ...result] : result;
}

export function getSubsectionDescendantIds(subsections = [], rootId = "") {
  if (!rootId) {return new Set();}
  const childrenByParent = (subsections || []).reduce((map, sub) => {
    const pid = sub.parentId || "";
    if (!map.has(pid)) {map.set(pid, []);}
    map.get(pid).push(sub.id);
    return map;
  }, new Map());
  const visited = new Set();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) {continue;}
    visited.add(current);
    const children = childrenByParent.get(current) || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) {stack.push(childId);}
    });
  }
  return visited;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getSectionColorMap(sections = []) {
  const map = new Map();
  const usedHues = new Set();
  sections.forEach((section, index) => {
    const seed = String(section.id || section.name || index);
    let hue = hashString(seed) % 360;
    let attempts = 0;
    while (usedHues.has(hue) && attempts < 360) {
      hue = (hue + 29) % 360;
      attempts += 1;
    }
    usedHues.add(hue);
    map.set(section.id, {
      dot: `hsl(${hue}, 75%, 55%)`,
      glow: `hsla(${hue}, 75%, 55%, 0.18)`
    });
  });
  return map;
}

export function resolveTimeMapIdsAfterDelete(task, settings, timeMaps, deletedId) {
  const remainingIds = new Set((timeMaps || []).map((tm) => tm.id));
  const initialIds = Array.isArray(task?.timeMapIds) ? task.timeMapIds : [];
  const filtered = initialIds.filter((id) => id !== deletedId && remainingIds.has(id));
  if (filtered.length) {return [...new Set(filtered)];}

  const sectionId = task?.section || "";
  const subsectionId = task?.subsection || "";
  const subsectionList = settings?.subsections?.[sectionId] || [];
  const subsection = subsectionList.find((sub) => sub.id === subsectionId);
  const templateIds = Array.isArray(subsection?.template?.timeMapIds)
    ? subsection.template.timeMapIds
    : [];
  const templateFiltered = templateIds.filter((id) => remainingIds.has(id));
  if (templateFiltered.length) {return [...new Set(templateFiltered)];}

  const defaultId = settings?.defaultTimeMapId;
  if (defaultId && remainingIds.has(defaultId)) {return [defaultId];}

  const firstAvailable = remainingIds.values().next().value;
  return firstAvailable ? [firstAvailable] : [];
}
