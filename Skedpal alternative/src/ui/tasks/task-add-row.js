import {
  ADD_TASK_BUTTON_TEST_ID,
  ADD_TASK_INPUT_TEST_ID,
  ADD_TASK_ROW_TEST_ID,
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  SUBTASK_SCHEDULE_PARALLEL,
  TASK_STATUS_UNSCHEDULED,
  TASK_TITLE_MAX_LENGTH,
  plusIconSvg
} from "../constants.js";
import { saveTask } from "../../data/db.js";
import { state } from "../state/page-state.js";
import { getSubsectionTemplate } from "../sections.js";
import {
  buildInheritedSubtaskUpdate,
  getNextOrder,
  getNextSubtaskOrder,
  normalizeSubtaskScheduleMode,
  parseLocalDateInput,
  uuid
} from "../utils.js";
import {
  buildTitleConversionHighlightsHtml,
  parseTitleDates,
  parseTitleLiteralList,
  pruneTitleLiteralList,
  resolveMergedDateRange,
  serializeTitleLiteralList
} from "../title-date-utils.js";

const CLIPBOARD_LINE_REGEX = /\r?\n/;
const CLIPBOARD_BULLET_REGEX = /^(?:[-*]|\d+[).])\s+/;

function getRowParts(row) {
  if (!row) {return { button: null, input: null };}
  return {
    button: row.querySelector?.("[data-add-task-button]") || null,
    input: row.querySelector?.("[data-add-task-input]") || null
  };
}

function collapseAddTaskRow(row, options = {}) {
  const { clear = true } = options;
  const { button, input } = getRowParts(row);
  const preview = row?.querySelector?.('[data-test-skedpal="task-add-conversion-preview"]');
  row?.removeAttribute("data-add-task-active");
  if (input) {
    input.classList.add("hidden");
    if (clear) {
      input.value = "";
      delete input.dataset.titleLiterals;
    }
  }
  if (preview) {
    preview.textContent = "";
    preview.classList.add("opacity-0", "pointer-events-none");
  }
  button?.classList.remove("hidden");
}

function collapseOtherAddTaskRows(activeRow) {
  const rows = document.querySelectorAll?.("[data-add-task-row]") || [];
  rows.forEach((row) => {
    if (row === activeRow) {return;}
    if (row.dataset?.addTaskActive !== "true") {return;}
    collapseAddTaskRow(row);
  });
}

function activateAddTaskRow(row) {
  if (!row) {return;}
  const { button, input } = getRowParts(row);
  if (!input || !button) {return;}
  if (row.dataset.addTaskActive === "true") {return;}
  collapseOtherAddTaskRows(row);
  row.dataset.addTaskActive = "true";
  button.classList.add("hidden");
  input.classList.remove("hidden");
  input.focus();
}

export function handleAddTaskRowClick(button) {
  const row = button?.closest?.("[data-add-task-row]");
  if (!row) {return false;}
  activateAddTaskRow(row);
  return true;
}

export function collapseAddTaskRowForInput(input) {
  if (!input) {return;}
  const row = input.closest?.("[data-add-task-row]");
  if (!row) {return;}
  collapseAddTaskRow(row);
}

function resolveTemplateForLocation(sectionId, subsectionId, templateOverride) {
  if (templateOverride) {return templateOverride;}
  if (!sectionId || !subsectionId) {return null;}
  return getSubsectionTemplate(sectionId, subsectionId);
}

function resolveTimeMapIds(template, settings) {
  if (Array.isArray(template?.timeMapIds) && template.timeMapIds.length) {
    return [...template.timeMapIds];
  }
  const defaultId = settings?.defaultTimeMapId;
  return defaultId ? [defaultId] : [];
}

function resolveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveQuickAddContext(sectionId, subsectionId, parentTask, template) {
  const inheritedSection = parentTask?.section || sectionId;
  const inheritedSubsection = parentTask?.subsection || subsectionId;
  const resolvedTemplate = resolveTemplateForLocation(
    inheritedSection,
    inheritedSubsection,
    template
  );
  return { inheritedSection, inheritedSubsection, resolvedTemplate };
}

function resolveQuickAddOrder(parentTask, sectionId, subsectionId, tasks) {
  if (parentTask) {
    return getNextSubtaskOrder(parentTask, sectionId, subsectionId, tasks);
  }
  return getNextOrder(sectionId, subsectionId, tasks);
}

function resolveTemplateRepeat(template) {
  return template?.repeat ? { ...template.repeat } : { ...DEFAULT_TASK_REPEAT };
}

function resolveTemplateScheduleMode(template) {
  return normalizeSubtaskScheduleMode(
    template?.subtaskScheduleMode || SUBTASK_SCHEDULE_PARALLEL
  );
}

function resolveTemplateDeadline(template) {
  return parseLocalDateInput(template?.deadline || "");
}

function resolveTemplateStartFrom(template) {
  return parseLocalDateInput(template?.startFrom || "");
}

function resolveTemplateLink(template) {
  return template?.link || "";
}

function resolveQuickAddDefaults(resolvedTemplate, settings) {
  return {
    durationMin: resolveNumber(
      resolvedTemplate?.durationMin,
      DEFAULT_TASK_DURATION_MIN
    ),
    minBlockMin: resolveNumber(
      resolvedTemplate?.minBlockMin,
      DEFAULT_TASK_MIN_BLOCK_MIN
    ),
    priority: resolveNumber(resolvedTemplate?.priority, DEFAULT_TASK_PRIORITY),
    timeMapIds: resolveTimeMapIds(resolvedTemplate, settings),
    repeat: resolveTemplateRepeat(resolvedTemplate),
    subtaskScheduleMode: resolveTemplateScheduleMode(resolvedTemplate),
    deadline: resolveTemplateDeadline(resolvedTemplate),
    startFrom: resolveTemplateStartFrom(resolvedTemplate),
    link: resolveTemplateLink(resolvedTemplate)
  };
}

function normalizeClipboardTaskTitle(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {return "";}
  return trimmed.replace(CLIPBOARD_BULLET_REGEX, "").trim();
}

function readTitleLiterals(input, value) {
  if (!input) {return [];}
  const stored = parseTitleLiteralList(input.dataset.titleLiterals);
  const pruned = pruneTitleLiteralList(value, stored);
  if (pruned.length) {
    input.dataset.titleLiterals = serializeTitleLiteralList(pruned);
  } else {
    delete input.dataset.titleLiterals;
  }
  return pruned;
}

function addTitleLiteral(input, value, literal) {
  if (!input || !literal) {return false;}
  const existing = readTitleLiterals(input, value);
  if (existing.includes(literal)) {return false;}
  const next = [...existing, literal];
  input.dataset.titleLiterals = serializeTitleLiteralList(next);
  return true;
}

function updateAddTaskConversionPreview(input) {
  if (!input) {return;}
  const row = input.closest?.("[data-add-task-row]");
  const preview = row?.querySelector?.('[data-test-skedpal="task-add-conversion-preview"]');
  if (!preview) {return;}
  const value = input.value || "";
  const literals = readTitleLiterals(input, value);
  const result = buildTitleConversionHighlightsHtml(value, { literals });
  if (!result.hasRanges) {
    preview.textContent = "";
    preview.classList.add("opacity-0", "pointer-events-none");
    return;
  }
  preview.innerHTML = result.html;
  preview.classList.remove("opacity-0", "pointer-events-none");
}

export function parseClipboardTaskTitles(text) {
  if (!text) {return [];}
  return text
    .split(CLIPBOARD_LINE_REGEX)
    .map(normalizeClipboardTaskTitle)
    .filter(Boolean);
}

function buildQuickAddPayload({
  id,
  title,
  parsedDeadline,
  parsedStartFrom,
  parsedRepeat,
  sectionId,
  subsectionId,
  parentTask,
  tasks,
  template,
  settings
}) {
  const { inheritedSection, inheritedSubsection, resolvedTemplate } = resolveQuickAddContext(
    sectionId,
    subsectionId,
    parentTask,
    template
  );
  const defaults = resolveQuickAddDefaults(resolvedTemplate, settings);
  const dateRange = resolveMergedDateRange({
    startFrom: parsedStartFrom ?? defaults.startFrom,
    deadline: parsedDeadline ?? defaults.deadline,
    startFromSource: parsedStartFrom ? "parsed" : "existing",
    deadlineSource: parsedDeadline ? "parsed" : "existing"
  });
  const order = resolveQuickAddOrder(parentTask, inheritedSection, inheritedSubsection, tasks);
  const basePayload = {
    id,
    title,
    durationMin: defaults.durationMin,
    minBlockMin: defaults.minBlockMin,
    priority: defaults.priority,
    deadline: dateRange.deadline,
    startFrom: dateRange.startFrom,
    link: defaults.link,
    timeMapIds: defaults.timeMapIds,
    section: inheritedSection || "",
    subsection: inheritedSubsection || "",
    order,
    subtaskParentId: null,
    subtaskScheduleMode: defaults.subtaskScheduleMode,
    repeat: parsedRepeat || defaults.repeat,
    reminders: [],
    completed: false,
    completedAt: null,
    completedOccurrences: [],
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
  if (!parentTask) {return basePayload;}
  return buildInheritedSubtaskUpdate(basePayload, parentTask) || basePayload;
}

export function buildQuickAddTaskPayload({
  title,
  sectionId = "",
  subsectionId = "",
  tasks = [],
  id = uuid(),
  parentTask = null,
  template = null,
  settings = state.settingsCache,
  titleLiterals = []
} = {}) {
  const parsed = parseTitleDates(title, { literals: titleLiterals });
  const trimmedTitle = (parsed.title || "").trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (parentTask) {
    return buildQuickAddPayload({
      id,
      title: trimmedTitle,
      parsedDeadline: parsed.deadline,
      parsedStartFrom: parsed.startFrom,
      parsedRepeat: parsed.repeat,
      parentTask,
      tasks,
      template,
      settings
    });
  }
  return buildQuickAddPayload({
    id,
    title: trimmedTitle,
    parsedDeadline: parsed.deadline,
    parsedStartFrom: parsed.startFrom,
    parsedRepeat: parsed.repeat,
    sectionId,
    subsectionId,
    parentTask,
    tasks,
    template,
    settings
  });
}

export function buildQuickAddTaskPayloadsFromTitles({
  titles = [],
  sectionId = "",
  subsectionId = "",
  tasks = [],
  parentTask = null,
  template = null,
  settings = state.settingsCache
} = {}) {
  const payloads = [];
  let taskSnapshot = Array.isArray(tasks) ? [...tasks] : [];
  titles.filter(Boolean).forEach((title) => {
    const payload = buildQuickAddTaskPayload({
      title,
      sectionId,
      subsectionId,
      tasks: taskSnapshot,
      parentTask,
      template,
      settings
    });
    payloads.push(payload);
    taskSnapshot = [...taskSnapshot, payload];
  });
  return payloads;
}

export async function handleAddTaskInputSubmit(input) {
  if (!input) {return false;}
  const rawTitle = input.value || "";
  if (!rawTitle.trim()) {
    collapseAddTaskRowForInput(input);
    return false;
  }
  const sectionId = input.dataset.addTaskSection || "";
  const subsectionId = input.dataset.addTaskSubsection || "";
  const parentId = input.dataset.addTaskParent || "";
  const parentTask = parentId
    ? state.tasksCache.find((task) => task.id === parentId)
    : null;
  const literals = readTitleLiterals(input, rawTitle);
  const payload = buildQuickAddTaskPayload({
    title: rawTitle,
    sectionId,
    subsectionId,
    tasks: state.tasksCache,
    parentTask,
    titleLiterals: literals
  });
  await saveTask(payload);
  collapseAddTaskRowForInput(input);
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
  return true;
}

export function handleAddTaskInputConversion(event) {
  const input = event.target;
  if (!(input instanceof HTMLElement)) {return;}
  if (!input.matches("[data-add-task-input]")) {return;}
  updateAddTaskConversionPreview(input);
}

export function handleAddTaskLiteralClick(event) {
  const target = event.target;
  const chip = target?.closest?.("[data-title-literal]");
  if (!chip) {return false;}
  const row = chip.closest?.("[data-add-task-row]");
  const input = row?.querySelector?.("[data-add-task-input]");
  if (!input) {return false;}
  const literal = chip.dataset?.titleLiteral || "";
  if (!literal) {return false;}
  const value = input.value || "";
  if (!addTitleLiteral(input, value, literal)) {return false;}
  updateAddTaskConversionPreview(input);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function buildAddTaskRow({
  sectionId = "",
  subsectionId = "",
  parentId = ""
} = {}) {
  const row = document.createElement("div");
  row.className =
    "task-add-row group opacity-40 transition-opacity hover:opacity-90 focus-within:opacity-100";
  row.dataset.addTaskRow = "true";
  row.dataset.sectionId = sectionId;
  row.dataset.subsectionId = subsectionId;
  row.setAttribute("data-test-skedpal", ADD_TASK_ROW_TEST_ID);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.addTaskSection = sectionId;
  button.dataset.addTaskSubsection = subsectionId;
  button.dataset.addTaskParent = parentId;
  button.dataset.addTaskButton = "true";
  button.className =
    "flex w-full items-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500/80 hover:text-lime-300 hover:bg-slate-900/30";
  button.setAttribute("data-test-skedpal", ADD_TASK_BUTTON_TEST_ID);
  const iconWrap = document.createElement("span");
  iconWrap.className = "inline-flex items-center text-slate-500/80 group-hover:text-lime-300";
  iconWrap.setAttribute("data-test-skedpal", "task-add-icon");
  iconWrap.innerHTML = plusIconSvg;
  const label = document.createElement("span");
  label.textContent = "Add task";
  label.setAttribute("data-test-skedpal", "task-add-label");
  button.appendChild(iconWrap);
  button.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = TASK_TITLE_MAX_LENGTH;
  input.placeholder = "Add task";
  input.dataset.addTaskInput = "true";
  input.dataset.addTaskSection = sectionId;
  input.dataset.addTaskSubsection = subsectionId;
  input.dataset.addTaskParent = parentId;
  input.className =
    "hidden w-full rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none";
  input.setAttribute("data-test-skedpal", ADD_TASK_INPUT_TEST_ID);

  row.appendChild(button);
  row.appendChild(input);
  const preview = document.createElement("div");
  preview.className =
    "mt-1 w-full min-w-0 break-words text-left text-[10px] leading-tight text-slate-400 opacity-0 pointer-events-none pl-3";
  preview.setAttribute("data-test-skedpal", "task-add-conversion-preview");
  row.appendChild(preview);
  return row;
}
