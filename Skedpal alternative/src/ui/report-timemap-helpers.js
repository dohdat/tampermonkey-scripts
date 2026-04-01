import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  PRIORITY_MAX,
  PRIORITY_MIN,
  REPORT_TIMEMAP_ASSIGNED_PREVIEW_COUNT,
  REPORT_PRIORITY_RGB_VAR_BY_VALUE,
  REPORT_TIMEMAP_TASK_SEARCH_PLACEHOLDER,
  TASK_STATUS_COMPLETED,
  TWO
} from "./constants.js";
import { getExternalEventsForRange } from "./calendar-external.js";

export function parseTimeToMinutes(value) {
  if (!value || typeof value !== "string") {return 0;}
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length !== TWO || parts.some((part) => !Number.isFinite(part))) {return 0;}
  const [hours, minutes] = parts;
  return Math.max(
    0,
    Math.min(HOURS_PER_DAY * MINUTES_PER_HOUR, hours * MINUTES_PER_HOUR + minutes)
  );
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function buildTimeMapRulesByDay(timeMap) {
  const rules = Array.isArray(timeMap?.rules) ? timeMap.rules : [];
  return rules.reduce((map, rule) => {
    const day = Number(rule.day);
    if (!Number.isFinite(day)) {return map;}
    if (!map.has(day)) {map.set(day, []);}
    map.get(day).push(rule);
    return map;
  }, new Map());
}

function clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {return null;}
  const clampedStart = startMs < horizonStartMs ? horizonStartMs : startMs;
  const clampedEnd = endMs > horizonEndMs ? horizonEndMs : endMs;
  if (clampedEnd <= clampedStart) {return null;}
  return { startMs: clampedStart, endMs: clampedEnd };
}

function getDayStartMs(valueMs) {
  const date = new Date(valueMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addInterval(map, key, startMs, endMs) {
  if (!map.has(key)) {map.set(key, []);}
  map.get(key).push([startMs, endMs]);
}

function buildAvailabilityIntervals(timeMaps, horizonStart, horizonEnd) {
  const intervals = [];
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  for (let cursor = startOfDay(horizonStart); cursor <= horizonEnd; cursor = addDays(cursor, 1)) {
    const dayStartMs = cursor.getTime();
    const dayOfWeek = cursor.getDay();
    (timeMaps || []).forEach((timeMap) => {
      const rulesByDay = buildTimeMapRulesByDay(timeMap);
      const dayRules = rulesByDay.get(dayOfWeek);
      if (!dayRules) {return;}
      dayRules.forEach((rule) => {
        const startMinutes = parseTimeToMinutes(rule.startTime);
        const endMinutes = parseTimeToMinutes(rule.endTime);
        if (endMinutes <= startMinutes) {return;}
        const startMs = dayStartMs + startMinutes * MS_PER_MINUTE;
        const endMs = dayStartMs + endMinutes * MS_PER_MINUTE;
        const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
        if (!clamped) {return;}
        intervals.push([clamped.startMs, clamped.endMs]);
      });
    });
  }
  return intervals;
}

export function getUniqueAvailabilityMinutes(timeMaps, horizonStart, horizonEnd) {
  const intervals = buildAvailabilityIntervals(timeMaps, horizonStart, horizonEnd);
  return sumIntervalsMinutes(intervals);
}

export function buildScheduledIntervalsByTimeMap(tasks, horizonStart, horizonEnd) {
  const usage = new Map();
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  (tasks || []).forEach((task) => {
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance) => {
      if (!instance?.timeMapId) {return;}
      const startMs = new Date(instance.start).getTime();
      const endMs = new Date(instance.end).getTime();
      const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
      if (!clamped) {return;}
      addInterval(usage, instance.timeMapId, clamped.startMs, clamped.endMs);
    });
  });
  return usage;
}

export function buildExternalIntervalsByTimeMap(timeMaps, horizonStart, horizonEnd) {
  const externalEvents = getExternalEventsForRange(
    { start: horizonStart, end: horizonEnd },
    "report"
  );
  if (!externalEvents.length) {return new Map();}
  const usage = new Map();
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  const dayMs = HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;
  (timeMaps || []).forEach((timeMap) => {
    const rulesByDay = buildTimeMapRulesByDay(timeMap);
    if (!rulesByDay.size) {return;}
    externalEvents.forEach((event) => {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
      if (!clamped) {return;}
      for (
        let cursorMs = getDayStartMs(clamped.startMs);
        cursorMs <= clamped.endMs;
        cursorMs += dayMs
      ) {
        const dayRules = rulesByDay.get(new Date(cursorMs).getDay());
        if (!dayRules) {continue;}
        const dayEventStart = Math.max(clamped.startMs, cursorMs);
        const dayEventEnd = Math.min(clamped.endMs, cursorMs + dayMs);
        if (dayEventEnd <= dayEventStart) {continue;}
        dayRules.forEach((rule) => {
          const startMinutes = parseTimeToMinutes(rule.startTime);
          const endMinutes = parseTimeToMinutes(rule.endTime);
          if (endMinutes <= startMinutes) {return;}
          const ruleStartMs = cursorMs + startMinutes * MS_PER_MINUTE;
          const ruleEndMs = cursorMs + endMinutes * MS_PER_MINUTE;
          const overlapStart = Math.max(dayEventStart, ruleStartMs);
          const overlapEnd = Math.min(dayEventEnd, ruleEndMs);
          if (overlapEnd <= overlapStart) {return;}
          addInterval(usage, timeMap.id, overlapStart, overlapEnd);
        });
      }
    });
  });
  return usage;
}

export function sumIntervalsMinutes(intervals) {
  if (!intervals.length) {return 0;}
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let totalMs = 0;
  let [currentStart, currentEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const [start, end] = sorted[i];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      totalMs += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  totalMs += currentEnd - currentStart;
  return Math.round(totalMs / MS_PER_MINUTE);
}

function getTaskTitleForAssignment(task) {
  return task?.title || "Untitled task";
}

function getTaskTimeMapIdsForAssignment(task) {
  return Array.isArray(task?.timeMapIds) ? task.timeMapIds.filter(Boolean) : [];
}

export function buildAssignedTasksByTimeMap(tasks = []) {
  const assignedTasksByTimeMap = new Map();
  (tasks || []).forEach((task, taskIndex) => {
    if (!task || task.subtaskParentId) {return;}
    if (task.completed || task.scheduleStatus === TASK_STATUS_COMPLETED) {return;}
    const rawTimeMapIds = getTaskTimeMapIdsForAssignment(task);
    if (!rawTimeMapIds.length) {return;}
    const assignment = {
      id: task.id || `task-${taskIndex}`,
      title: getTaskTitleForAssignment(task),
      priority: Number(task.priority) || 0,
      sectionId: task.section || "",
      subsectionId: task.subsection || ""
    };
    const uniqueTimeMapIds = new Set(rawTimeMapIds);
    uniqueTimeMapIds.forEach((timeMapId) => {
      if (!assignedTasksByTimeMap.has(timeMapId)) {
        assignedTasksByTimeMap.set(timeMapId, []);
      }
      assignedTasksByTimeMap.get(timeMapId).push(assignment);
    });
  });
  assignedTasksByTimeMap.forEach((assignedTasks) => {
    assignedTasks.sort((a, b) => {
      if (b.priority !== a.priority) {return b.priority - a.priority;}
      return a.title.localeCompare(b.title);
    });
  });
  return assignedTasksByTimeMap;
}

export function buildTimeMapUsageSearchInput(value = "") {
  const wrap = document.createElement("div");
  wrap.className = "mt-2";
  wrap.setAttribute("data-test-skedpal", "report-timemap-search");
  const input = document.createElement("input");
  input.type = "search";
  input.value = value || "";
  input.placeholder = REPORT_TIMEMAP_TASK_SEARCH_PLACEHOLDER;
  input.className =
    "w-full rounded-lg border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none";
  input.setAttribute("data-test-skedpal", "report-timemap-search-input");
  input.setAttribute("data-report-timemap-search", "true");
  wrap.appendChild(input);
  return wrap;
}

export function buildTimeMapAssignedTasksBlock(row) {
  const wrap = document.createElement("div");
  wrap.className = "relative mt-2";
  wrap.setAttribute("data-test-skedpal", "report-timemap-assigned");
  if (!Array.isArray(row?.assignedTasks) || row.assignedTasks.length === 0) {
    const empty = document.createElement("span");
    empty.className = "text-slate-400";
    empty.setAttribute("data-test-skedpal", "report-timemap-assigned-empty");
    empty.textContent = "Tasks: None assigned";
    wrap.appendChild(empty);
    return wrap;
  }
  const title = document.createElement("span");
  title.className = "text-slate-400 text-[11px]";
  title.setAttribute("data-test-skedpal", "report-timemap-assigned-title");
  title.textContent = `Tasks (${row.assignedTaskCount}):`;
  wrap.appendChild(title);

  const buildAssignedTaskButton = (task) => {
    const rawPriority = Number(task.priority) || 0;
    const boundedPriority = Math.min(PRIORITY_MAX, Math.max(PRIORITY_MIN, rawPriority));
    const priorityRgbVar =
      REPORT_PRIORITY_RGB_VAR_BY_VALUE[boundedPriority] || "--color-slate-400-rgb";
    const taskBtn = document.createElement("button");
    taskBtn.type = "button";
    taskBtn.className =
      "inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-xs text-slate-100 transition-colors hover:brightness-110";
    taskBtn.setAttribute("data-test-skedpal", "report-timemap-assigned-task");
    taskBtn.setAttribute("data-report-timemap-task", task.id || "");
    taskBtn.dataset.reportTimemapTask = task.id || "";
    taskBtn.dataset.sectionId = task.sectionId || "";
    taskBtn.dataset.subsectionId = task.subsectionId || "";
    taskBtn.dataset.priority = String(rawPriority);
    taskBtn.title = `Priority ${rawPriority} - Open task in Tasks view`;
    taskBtn.style.backgroundColor = `rgba(var(${priorityRgbVar}), .30)`;
    taskBtn.style.border = `1px solid rgba(var(${priorityRgbVar}), .78)`;
    const taskLabel = document.createElement("span");
    taskLabel.className = "truncate";
    taskLabel.setAttribute("data-test-skedpal", "report-timemap-assigned-task-label");
    taskLabel.textContent = task.title || "Untitled task";
    taskBtn.appendChild(taskLabel);
    return taskBtn;
  };

  const list = document.createElement("div");
  list.className = "mt-1 flex flex-wrap items-center gap-1.5";
  list.setAttribute("data-test-skedpal", "report-timemap-assigned-list");
  const previewTasks = row.assignedTasks.slice(0, REPORT_TIMEMAP_ASSIGNED_PREVIEW_COUNT);
  const hiddenTasks = row.assignedTasks.slice(REPORT_TIMEMAP_ASSIGNED_PREVIEW_COUNT);
  previewTasks.forEach((task) => {
    list.appendChild(buildAssignedTaskButton(task));
  });
  if (hiddenTasks.length) {
    const moreWrap = document.createElement("div");
    moreWrap.className = "inline-block";
    moreWrap.setAttribute("data-test-skedpal", "report-timemap-assigned-more");
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className =
      "rounded border-slate-700 bg-slate-900/50 px-1.5 py-0.5 text-xs text-slate-300 hover:border-lime-400/70";
    toggleBtn.setAttribute("data-test-skedpal", "report-timemap-assigned-more-toggle");
    toggleBtn.setAttribute("data-report-timemap-more-toggle", "true");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.dataset.hiddenCount = String(hiddenTasks.length);
    toggleBtn.textContent = `+${hiddenTasks.length} more`;
    const moreList = document.createElement("div");
    moreList.className = "mt-1 hidden flex flex-wrap items-center gap-1.5";
    moreList.setAttribute("data-test-skedpal", "report-timemap-assigned-more-list");
    hiddenTasks.forEach((task) => {
      moreList.appendChild(buildAssignedTaskButton(task));
    });
    moreWrap.appendChild(toggleBtn);
    moreWrap.appendChild(moreList);
    list.appendChild(moreWrap);
  }
  wrap.appendChild(list);
  return wrap;
}
