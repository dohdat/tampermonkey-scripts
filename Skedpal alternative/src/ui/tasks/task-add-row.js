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
import { getNextOrder, normalizeSubtaskScheduleMode, parseLocalDateInput, uuid } from "../utils.js";

const ADD_TASK_ROW_TEST_ID = "task-add-row";
const ADD_TASK_BUTTON_TEST_ID = "task-add-button";
const ADD_TASK_INPUT_TEST_ID = "task-add-input";

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

export function buildQuickAddTaskPayload({
  title,
  sectionId = "",
  subsectionId = "",
  tasks = [],
  id = uuid(),
  template = null,
  settings = state.settingsCache
} = {}) {
  const trimmedTitle = (title || "").trim().slice(0, TASK_TITLE_MAX_LENGTH);
  const resolvedTemplate = resolveTemplateForLocation(sectionId, subsectionId, template);
  const durationMin = resolveNumber(
    resolvedTemplate?.durationMin,
    DEFAULT_TASK_DURATION_MIN
  );
  const minBlockMin = resolveNumber(
    resolvedTemplate?.minBlockMin,
    DEFAULT_TASK_MIN_BLOCK_MIN
  );
  const priority = resolveNumber(resolvedTemplate?.priority, DEFAULT_TASK_PRIORITY);
  const timeMapIds = resolveTimeMapIds(resolvedTemplate, settings);
  const repeat = resolvedTemplate?.repeat ? { ...resolvedTemplate.repeat } : { ...DEFAULT_TASK_REPEAT };
  const subtaskScheduleMode = normalizeSubtaskScheduleMode(
    resolvedTemplate?.subtaskScheduleMode || SUBTASK_SCHEDULE_PARALLEL
  );
  const deadline = parseLocalDateInput(resolvedTemplate?.deadline || "");
  const startFrom = parseLocalDateInput(resolvedTemplate?.startFrom || "");
  const order = getNextOrder(sectionId, subsectionId, tasks);
  return {
    id,
    title: trimmedTitle,
    durationMin,
    minBlockMin,
    priority,
    deadline,
    startFrom,
    link: resolvedTemplate?.link || "",
    timeMapIds,
    section: sectionId || "",
    subsection: subsectionId || "",
    order,
    subtaskParentId: null,
    subtaskScheduleMode,
    repeat,
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
  const payload = buildQuickAddTaskPayload({
    title: rawTitle,
    sectionId,
    subsectionId,
    tasks: state.tasksCache
  });
  await saveTask(payload);
  collapseAddTaskRowForInput(input);
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
  return true;
}

export function buildAddTaskRow({ sectionId = "", subsectionId = "" } = {}) {
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
  input.className =
    "hidden w-full rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none";
  input.setAttribute("data-test-skedpal", ADD_TASK_INPUT_TEST_ID);

  row.appendChild(button);
  row.appendChild(input);
  return row;
}
