import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { formatDateTime } from "./utils.js";

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

function formatMissedPercentage(missedCount, expectedCount) {
  if (!expectedCount || expectedCount <= 0) {return "";}
  const ratio = Math.min(1, Math.max(0, missedCount / expectedCount));
  return ` (${Math.round(ratio * 100)}%)`;
}

export function getMissedTaskRows(tasks = [], settings = state.settingsCache) {
  const parentIds = new Set(
    (tasks || []).filter((task) => task.subtaskParentId).map((task) => task.subtaskParentId)
  );
  return (tasks || [])
    .filter((task) => {
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
    })
    .map((task) => {
      const missedCount = Number(task.missedCount) || 0;
      return {
        id: task.id,
        title: task.title || "Untitled task",
        status: task.scheduleStatus || "unscheduled",
        missedCount,
        expectedCount: Number(task.expectedCount) || 0,
        missedLastRun: Number(task.missedLastRun) || 0,
        priority: Number(task.priority) || 0,
        deadline: task.deadline || "",
        sectionLabel: getSectionLabel(task.section, settings),
        subsectionLabel: getSubsectionLabel(task.section, task.subsection, settings)
      };
    })
    .sort((a, b) => {
      const rateDiff = getMissedRate(b) - getMissedRate(a);
      if (rateDiff) {return rateDiff;}
      if (a.missedCount !== b.missedCount) {return b.missedCount - a.missedCount;}
      const statusDiff = getStatusWeight(b.status) - getStatusWeight(a.status);
      if (statusDiff) {return statusDiff;}
      if (a.priority !== b.priority) {return b.priority - a.priority;}
      const deadlineDiff = compareDeadlines(a.deadline, b.deadline);
      if (deadlineDiff) {return deadlineDiff;}
      return a.title.localeCompare(b.title);
    });
}

function buildReportRow(row) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow";
  card.setAttribute("data-test-skedpal", "report-missed-row");
  const title = document.createElement("div");
  title.className = "text-base font-semibold text-slate-100";
  title.setAttribute("data-test-skedpal", "report-missed-title");
  title.textContent = row.title;
  const meta = document.createElement("div");
  meta.className = "mt-1 flex flex-wrap gap-2 text-xs text-slate-400";
  meta.setAttribute("data-test-skedpal", "report-missed-meta");
  const missedBase = row.expectedCount
    ? `Missed: ${row.missedLastRun} of ${row.expectedCount}${formatMissedPercentage(
        row.missedLastRun,
        row.expectedCount
      )}`
    : `Missed: ${row.missedCount}`;
  const priorityValue = Number(row.priority) || 0;
  const priorityMarkup = priorityValue
    ? `Priority: <span class="priority-text" data-priority="${priorityValue}" data-test-skedpal="report-missed-priority-value">${priorityValue}</span>`
    : "Priority: 0";
  meta.innerHTML = `
    <span data-test-skedpal="report-missed-count">${missedBase}</span>
    <span data-test-skedpal="report-missed-status">Status: ${row.status}</span>
    <span data-test-skedpal="report-missed-priority">${priorityMarkup}</span>
    <span data-test-skedpal="report-missed-deadline">Deadline: ${
      row.deadline ? formatDateTime(row.deadline) : "None"
    }</span>
    <span data-test-skedpal="report-missed-section">Section: ${row.sectionLabel}</span>
    <span data-test-skedpal="report-missed-subsection">Subsection: ${row.subsectionLabel}</span>
  `;
  card.appendChild(title);
  card.appendChild(meta);
  return card;
}

export function renderReport(tasks = state.tasksCache) {
  const { reportList, reportBadge } = domRefs;
  if (!reportList) {return;}
  reportList.innerHTML = "";
  const rows = getMissedTaskRows(tasks, state.settingsCache);
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
  rows.forEach((row) => reportList.appendChild(buildReportRow(row)));
}
