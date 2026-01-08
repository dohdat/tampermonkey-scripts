import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { formatDateTime, normalizeTimeMap, renderInBatches } from "./utils.js";
import { renderTaskCard } from "./tasks/task-card.js";
let reportRenderToken = 0;

function parseTimeToMinutes(value) {
  if (!value || typeof value !== "string") {return 0;}
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {return 0;}
  const [hours, minutes] = parts;
  return Math.max(0, Math.min(24 * 60, hours * 60 + minutes));
}

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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getSectionLabel(sectionId, settings) {
  if (!sectionId) {return "No section";}
  const section = (settings?.sections || []).find((s) => s.id === sectionId);
  return section?.name || "Untitled section";
}

function getSubsectionLabel(sectionId, subsectionId, settings) {
  if (!subsectionId) {return "No subsection";}
  const list = settings?.subsections?.[sectionId] || [];
  const subsection = list.find((s) => s.id === subsectionId);
  return subsection?.name || "Untitled subsection";
}

function compareDeadlines(a, b) {
  if (!a && !b) {return 0;}
  if (!a) {return 1;}
  if (!b) {return -1;}
  return new Date(a).getTime() - new Date(b).getTime();
}

function getStatusWeight(status) {
  if (status === "unscheduled") {return 2;}
  if (status === "ignored") {return 1;}
  return 0;
}

function getMissedRate(row) {
  if (row.expectedCount > 0) {
    return row.missedLastRun / row.expectedCount;
  }
  return row.missedCount > 0 ? 1 : 0;
}

function shouldIncludeMissedTask(task, parentIds) {
  if (task.completed) {return false;}
  if (parentIds.has(task.id)) {return false;}
  if (["unscheduled", "ignored"].includes(task.scheduleStatus)) {return true;}
  const expectedCount = Number(task.expectedCount) || 0;
  const missedLastRun = Number(task.missedLastRun) || 0;
  const missedCount = Number(task.missedCount) || 0;
  if (expectedCount > 0) {
    return missedLastRun > 0;
  }
  return missedCount > 0;
}

function compareMissedTaskRows(a, b) {
  const rateDiff = getMissedRate(b) - getMissedRate(a);
  if (rateDiff) {return rateDiff;}
  if (a.missedCount !== b.missedCount) {return b.missedCount - a.missedCount;}
  const statusDiff = getStatusWeight(b.status) - getStatusWeight(a.status);
  if (statusDiff) {return statusDiff;}
  if (a.priority !== b.priority) {return b.priority - a.priority;}
  const deadlineDiff = compareDeadlines(a.deadline, b.deadline);
  if (deadlineDiff) {return deadlineDiff;}
  return a.title.localeCompare(b.title);
}

function getTaskTitle(task) {
  return task.title || "Untitled task";
}

function getTaskStatus(task) {
  return task.scheduleStatus || "unscheduled";
}

function getTaskNumber(value) {
  return Number(value) || 0;
}

function getTaskDeadline(task) {
  return task.deadline || "";
}

function getTaskSection(task) {
  return task.section || "";
}

function getTaskSubsection(task) {
  return task.subsection || "";
}

function getTaskTimeMapIds(task) {
  return Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
}

function getMissedFillPercent(row) {
  if (row.expectedCount > 0) {
    return Math.min(100, Math.max(0, (row.missedLastRun / row.expectedCount) * 100));
  }
  return row.missedCount > 0 ? 100 : 0;
}

function buildReportTaskContext(rows, timeMaps, expandedTaskDetails) {
  const timeMapById = new Map(
    (timeMaps || []).map((timeMap) => [timeMap.id, normalizeTimeMap(timeMap)])
  );
  return {
    tasks: rows,
    timeMapById,
    collapsedTasks: new Set(),
    expandedTaskDetails:
      expandedTaskDetails instanceof Set ? expandedTaskDetails : new Set(),
    computeTotalDuration: (task) => getTaskNumber(task.durationMin),
    getTaskDepthById: () => 0,
    getSectionName: () => "",
    getSubsectionName: () => ""
  };
}

function formatMissedPercentage(missedCount, expectedCount) {
  if (!expectedCount || expectedCount <= 0) {return "";}
  const ratio = Math.min(1, Math.max(0, missedCount / expectedCount));
  return ` (${Math.round(ratio * 100)}%)`;
}

function buildTimeMapRulesByDay(timeMap) {
  const rules = Array.isArray(timeMap?.rules) ? timeMap.rules : [];
  return rules.reduce((map, rule) => {
    const day = Number(rule.day);
    if (!Number.isFinite(day)) {return map;}
    if (!map.has(day)) {map.set(day, []);}
    map.get(day).push(rule);
    return map;
  }, new Map());
}

function getTimeMapCapacityMinutes(timeMap, horizonStart, horizonEnd) {
  const rulesByDay = buildTimeMapRulesByDay(timeMap);
  if (!rulesByDay.size) {return 0;}
  let totalMinutes = 0;
  for (let cursor = new Date(horizonStart); cursor <= horizonEnd; cursor = addDays(cursor, 1)) {
    const dayRules = rulesByDay.get(cursor.getDay());
    if (!dayRules) {continue;}
    dayRules.forEach((rule) => {
      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);
      if (endMinutes > startMinutes) {
        totalMinutes += endMinutes - startMinutes;
      }
    });
  }
  return totalMinutes;
}

function buildScheduledMinutesByTimeMap(tasks, horizonStart, horizonEnd) {
  const usage = new Map();
  (tasks || []).forEach((task) => {
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance) => {
      if (!instance?.timeMapId) {return;}
      const start = new Date(instance.start);
      const end = new Date(instance.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return;}
      const clampedStart = start < horizonStart ? horizonStart : start;
      const clampedEnd = end > horizonEnd ? horizonEnd : end;
      if (clampedEnd <= clampedStart) {return;}
      const minutes = Math.round((clampedEnd.getTime() - clampedStart.getTime()) / 60000);
      if (minutes <= 0) {return;}
      usage.set(instance.timeMapId, (usage.get(instance.timeMapId) || 0) + minutes);
    });
  });
  return usage;
}

export function getTimeMapUsageRows(tasks = [], timeMaps = [], settings = state.settingsCache) {
  const horizonDays = Number(settings?.schedulingHorizonDays) || 14;
  const horizonStart = startOfDay(new Date());
  const horizonEnd = endOfDay(addDays(horizonStart, horizonDays));
  const scheduledByTimeMap = buildScheduledMinutesByTimeMap(tasks, horizonStart, horizonEnd);
  return (timeMaps || []).map((timeMap) => {
    const capacityMinutes = getTimeMapCapacityMinutes(timeMap, horizonStart, horizonEnd);
    const scheduledMinutes = scheduledByTimeMap.get(timeMap.id) || 0;
    const percent = capacityMinutes > 0
      ? Math.round((scheduledMinutes / capacityMinutes) * 100)
      : 0;
    return {
      id: timeMap.id,
      name: timeMap.name || "Untitled TimeMap",
      color: timeMap.color || "",
      scheduledMinutes,
      capacityMinutes,
      percent,
      isOverSubscribed: capacityMinutes > 0 && scheduledMinutes > capacityMinutes
    };
  }).sort((a, b) => {
    if (a.isOverSubscribed !== b.isOverSubscribed) {
      return a.isOverSubscribed ? -1 : 1;
    }
    if (b.percent !== a.percent) {return b.percent - a.percent;}
    return a.name.localeCompare(b.name);
  });
}

export function getMissedTaskRows(tasks = [], settings = state.settingsCache) {
  const parentIds = new Set(
    (tasks || []).filter((task) => task.subtaskParentId).map((task) => task.subtaskParentId)
  );
  return (tasks || [])
    .filter((task) => shouldIncludeMissedTask(task, parentIds))
    .map((task) => {
      const missedCount = getTaskNumber(task.missedCount);
      return {
        id: task.id,
        title: getTaskTitle(task),
        status: getTaskStatus(task),
        missedCount,
        expectedCount: getTaskNumber(task.expectedCount),
        missedLastRun: getTaskNumber(task.missedLastRun),
        priority: getTaskNumber(task.priority),
        durationMin: getTaskNumber(task.durationMin),
        minBlockMin: getTaskNumber(task.minBlockMin),
        deadline: getTaskDeadline(task),
        startFrom: task.startFrom || "",
        section: getTaskSection(task),
        subsection: getTaskSubsection(task),
        subtaskParentId: task.subtaskParentId || "",
        link: task.link || "",
        repeat: task.repeat || null,
        scheduledStart: task.scheduledStart || "",
        scheduledEnd: task.scheduledEnd || "",
        completed: Boolean(task.completed),
        sectionLabel: getSectionLabel(task.section, settings),
        subsectionLabel: getSubsectionLabel(task.section, task.subsection, settings),
        timeMapIds: getTaskTimeMapIds(task)
      };
    })
    .sort(compareMissedTaskRows);
}

function buildReportRow(row, context) {
  const card = renderTaskCard(row, context);
  card.setAttribute("data-test-skedpal", "report-missed-row");
  const fillPercent = getMissedFillPercent(row);
  if (fillPercent > 0) {
    const fillColor = "rgba(var(--color-orange-500-rgb), 0.18)";
    card.style.backgroundImage =
      `linear-gradient(90deg, ${fillColor} ${fillPercent}%, rgba(0, 0, 0, 0) ${fillPercent}%)`;
  }
  const missedBase = row.expectedCount
    ? `Missed: ${row.missedLastRun} of ${row.expectedCount}${formatMissedPercentage(
        row.missedLastRun,
        row.expectedCount
      )}`
    : `Missed: ${row.missedCount}`;
  const summaryRow = document.createElement("div");
  summaryRow.className = "task-summary-row";
  summaryRow.setAttribute("data-test-skedpal", "report-missed-summary");
  summaryRow.style.display = "flex";
  summaryRow.style.alignItems = "center";
  summaryRow.style.marginLeft = "auto";
  summaryRow.style.gap = "0.35rem";
  summaryRow.textContent = missedBase;
  const actionsWrap = card.querySelector(".task-actions-wrap");
  if (actionsWrap) {
    actionsWrap.appendChild(summaryRow);
  }
  const priorityValue = Number(row.priority) || 0;
  const priorityMarkup = priorityValue
    ? `Priority: <span class="priority-text" data-priority="${priorityValue}" data-test-skedpal="report-missed-priority-value">${priorityValue}</span>`
    : "Priority: 0";
  if (context?.expandedTaskDetails?.has(row.id)) {
    const meta = document.createElement("div");
    meta.className = "mt-2 flex flex-wrap gap-2 text-xs text-slate-400";
    meta.setAttribute("data-test-skedpal", "report-missed-meta");
    meta.innerHTML = `
      <span data-test-skedpal="report-missed-status">Status: ${row.status}</span>
      <span data-test-skedpal="report-missed-priority">${priorityMarkup}</span>
      <span data-test-skedpal="report-missed-deadline">Deadline: ${
        row.deadline ? formatDateTime(row.deadline) : "None"
      }</span>
      <span data-test-skedpal="report-missed-section">Section: ${row.sectionLabel}</span>
      <span data-test-skedpal="report-missed-subsection">Subsection: ${row.subsectionLabel}</span>
    `;
    card.appendChild(meta);
  }
  return card;
}

function formatMinutesSummary(scheduledMinutes, capacityMinutes) {
  if (!capacityMinutes) {
    return `Used: ${scheduledMinutes} min`;
  }
  return `Used: ${scheduledMinutes} of ${capacityMinutes} min`;
}

function buildTimeMapUsageCard(rows) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
  card.setAttribute("data-test-skedpal", "report-timemap-card");
  const header = document.createElement("div");
  header.className = "text-base font-semibold text-slate-100";
  header.setAttribute("data-test-skedpal", "report-timemap-title");
  header.textContent = "TimeMap usage";
  const subtitle = document.createElement("div");
  subtitle.className = "mt-1 text-xs text-slate-400";
  subtitle.setAttribute("data-test-skedpal", "report-timemap-subtitle");
  subtitle.textContent = "Scheduled minutes vs availability in the current horizon.";
  card.appendChild(header);
  card.appendChild(subtitle);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "mt-3 text-sm text-slate-400";
    empty.setAttribute("data-test-skedpal", "report-timemap-empty");
    empty.textContent = "No TimeMaps available.";
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement("div");
  list.className = "mt-3 grid gap-2";
  list.setAttribute("data-test-skedpal", "report-timemap-list");
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className =
      "relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-200";
    item.setAttribute("data-test-skedpal", "report-timemap-row");
    if (row.color) {
      item.style.borderColor = row.color;
    }
    const fillPercent = Math.min(100, Math.max(0, row.percent || 0));
    const fillColor = row.color || "var(--color-green-500)";
    item.style.background = `linear-gradient(90deg, ${fillColor}33 ${fillPercent}%, rgba(2, 6, 23, 0.5) ${fillPercent}%)`;
    const name = document.createElement("div");
    name.className = "relative flex items-center gap-2 text-sm font-semibold text-slate-100";
    name.setAttribute("data-test-skedpal", "report-timemap-name");
    name.textContent = row.name;
    if (row.color) {
      name.style.color = row.color;
    }
    const meterWrap = document.createElement("div");
    meterWrap.className = "relative mt-2 h-2 w-full overflow-hidden rounded-full";
    meterWrap.setAttribute("data-test-skedpal", "report-timemap-meter");
    const meterFill = document.createElement("div");
    meterFill.className = "h-full rounded-full";
    meterFill.setAttribute("data-test-skedpal", "report-timemap-meter-fill");
    meterFill.style.width = `${fillPercent}%`;
    const trackColor = row.color ? `${row.color}33` : "rgba(148, 163, 184, 0.3)";
    meterWrap.style.backgroundColor = trackColor;
    meterFill.style.backgroundColor = fillColor;
    const meta = document.createElement("div");
    meta.className = "relative mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400";
    meta.setAttribute("data-test-skedpal", "report-timemap-meta");
    const percentLabel = row.capacityMinutes
      ? `${Math.min(999, Math.max(0, row.percent))}%`
      : "No availability";
    meta.innerHTML = `
      <span data-test-skedpal="report-timemap-percent">Used: ${percentLabel}</span>
      <span data-test-skedpal="report-timemap-minutes">${formatMinutesSummary(
        row.scheduledMinutes,
        row.capacityMinutes
      )}</span>
      ${row.isOverSubscribed ? '<span class="text-orange-400" data-test-skedpal="report-timemap-over">Over-subscribed</span>' : ""}
    `;
    item.appendChild(name);
    meterWrap.appendChild(meterFill);
    item.appendChild(meterWrap);
    item.appendChild(meta);
    list.appendChild(item);
  });
  card.appendChild(list);
  return card;
}

export function renderReport(tasks = state.tasksCache) {
  const { reportList, reportBadge } = domRefs;
  if (!reportList) {return;}
  const renderToken = ++reportRenderToken;
  reportList.innerHTML = "";
  const usageRows = getTimeMapUsageRows(
    tasks,
    state.tasksTimeMapsCache,
    state.settingsCache
  );
  reportList.appendChild(buildTimeMapUsageCard(usageRows));
  const rows = getMissedTaskRows(tasks, state.settingsCache);
  const reportContext = buildReportTaskContext(
    rows,
    state.tasksTimeMapsCache,
    state.expandedTaskDetails
  );
  if (reportBadge) {
    reportBadge.textContent = rows.length ? String(rows.length) : "";
    reportBadge.classList.toggle("hidden", rows.length === 0);
  }
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className =
      "rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400";
    empty.setAttribute("data-test-skedpal", "report-empty");
    empty.textContent = "No missed tasks yet.";
    reportList.appendChild(empty);
    return;
  }
  renderInBatches({
    items: rows,
    batchSize: 40,
    shouldCancel: () => renderToken !== reportRenderToken,
    renderBatch: (batch) => {
      const fragment = document.createDocumentFragment();
      batch.forEach((row) => fragment.appendChild(buildReportRow(row, reportContext)));
      reportList.appendChild(fragment);
    }
  });
}
