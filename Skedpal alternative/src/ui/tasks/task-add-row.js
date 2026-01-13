import {
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
import { parseTitleDates } from "../title-date-utils.js";

const ADD_TASK_ROW_TEST_ID = "task-add-row";
const ADD_TASK_BUTTON_TEST_ID = "task-add-button";
const ADD_TASK_INPUT_TEST_ID = "task-add-input";
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
  row?.removeAttribute("data-add-task-active");
  if (input) {
    input.classList.add("hidden");
    if (clear) {input.value = "";}
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
  const order = resolveQuickAddOrder(parentTask, inheritedSection, inheritedSubsection, tasks);
  const basePayload = {
    id,
    title,
    durationMin: defaults.durationMin,
    minBlockMin: defaults.minBlockMin,
    priority: defaults.priority,
    deadline: parsedDeadline ?? defaults.deadline,
    startFrom: parsedStartFrom ?? defaults.startFrom,
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
  settings = state.settingsCache
} = {}) {
  const parsed = parseTitleDates(title);
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
  const payload = buildQuickAddTaskPayload({
    title: rawTitle,
    sectionId,
    subsectionId,
    tasks: state.tasksCache,
    parentTask
  });
  await saveTask(payload);
  collapseAddTaskRowForInput(input);
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
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
  return row;
}
