import { saveTask } from "../../data/db.js";
import { domRefs, TASK_DURATION_STEP_MIN, TASK_STATUS_UNSCHEDULED } from "../constants.js";
import { showNotificationBanner } from "../notifications.js";
import { state } from "../state/page-state.js";
import { parseLocalDateInput } from "../utils.js";
import { collectSelectedValues, renderTimeMapOptions } from "../time-maps.js";
import { getSelectedTaskCards } from "./task-selection-utils.js";

const TIME_MAP_MODE_KEEP = "keep";
const TIME_MAP_MODE_REPLACE = "replace";
const PRIORITY_MIN = 1;
const PRIORITY_MAX = 5;

let bulkEditFallbackId = "";

function getBulkEditNodes() {
  return {
    banner: domRefs.taskBulkEditBanner,
    count: domRefs.taskBulkEditCount,
    applyBtn: domRefs.taskBulkEditApplyBtn,
    cancelBtn: domRefs.taskBulkEditCancelBtn,
    priorityInput: domRefs.taskBulkEditPriorityInput,
    deadlineInput: domRefs.taskBulkEditDeadlineInput,
    startFromInput: domRefs.taskBulkEditStartFromInput,
    durationInput: domRefs.taskBulkEditDurationInput,
    minBlockInput: domRefs.taskBulkEditMinBlockInput,
    timeMapMode: domRefs.taskBulkEditTimeMapMode,
    timeMapOptions: domRefs.taskBulkEditTimeMapOptions
  };
}

function getSelectedTaskIds() {
  const cards = getSelectedTaskCards();
  return cards.map((card) => card.dataset.taskId).filter(Boolean);
}

function resolveBulkEditTargetIds() {
  if (Array.isArray(state.bulkEditSelectionIds) && state.bulkEditSelectionIds.length) {
    return state.bulkEditSelectionIds;
  }
  const selectedIds = getSelectedTaskIds();
  if (selectedIds.length) {return selectedIds;}
  return bulkEditFallbackId ? [bulkEditFallbackId] : [];
}

function setTimeMapOptionsEnabled(container, enabled) {
  if (!container) {return;}
  const wrap = container.closest?.('[data-test-skedpal="task-bulk-edit-timemap-wrap"]');
  if (wrap) {
    wrap.classList.toggle("hidden", !enabled);
  }
  const inputs = container.querySelectorAll("input[type='checkbox']");
  inputs.forEach((input) => {
    input.disabled = !enabled;
  });
}

function setTaskSortablesEnabled(enabled) {
  state.sortableInstances.forEach((instance) => {
    if (!instance) {return;}
    if (typeof instance.option === "function") {
      instance.option("disabled", !enabled);
      return;
    }
    instance.disabled = !enabled;
  });
}

function updateTimeMapMode(nodes) {
  if (!nodes?.timeMapMode || !nodes.timeMapOptions) {return;}
  const mode = nodes.timeMapMode.value || TIME_MAP_MODE_KEEP;
  setTimeMapOptionsEnabled(nodes.timeMapOptions, mode === TIME_MAP_MODE_REPLACE);
}

function resetBulkEditForm(nodes) {
  if (!nodes) {return;}
  if (nodes.priorityInput) {nodes.priorityInput.value = "";}
  if (nodes.deadlineInput) {nodes.deadlineInput.value = "";}
  if (nodes.startFromInput) {nodes.startFromInput.value = "";}
  if (nodes.durationInput) {nodes.durationInput.value = "";}
  if (nodes.minBlockInput) {nodes.minBlockInput.value = "";}
  if (nodes.timeMapMode) {nodes.timeMapMode.value = TIME_MAP_MODE_KEEP;}
  if (nodes.timeMapOptions) {
    renderTimeMapOptions(nodes.timeMapOptions, [], state.tasksTimeMapsCache || []);
  }
  updateTimeMapMode(nodes);
}

function updateBulkEditCount(nodes, targetIds) {
  if (!nodes?.count) {return 0;}
  const count = targetIds.length;
  nodes.count.textContent = `${count} selected`;
  return count;
}

function arraysHaveSameValues(a = [], b = []) {
  if (a.length !== b.length) {return false;}
  return a.every((value) => b.includes(value));
}

function applyScalarUpdate(next, task, key, value) {
  if (value === undefined) {return false;}
  if (value === task[key]) {return false;}
  next[key] = value;
  return true;
}

function applyTimeMapUpdate(next, task, values) {
  if (values.timeMapMode !== TIME_MAP_MODE_REPLACE || !Array.isArray(values.timeMapIds)) {
    return false;
  }
  const current = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
  if (arraysHaveSameValues(current, values.timeMapIds)) {return false;}
  next.timeMapIds = [...values.timeMapIds];
  return true;
}

function buildBulkEditUpdateForTask(task, values) {
  if (!task) {return null;}
  let changed = false;
  const next = { ...task };
  changed = applyScalarUpdate(next, task, "priority", values.priority) || changed;
  changed = applyScalarUpdate(next, task, "deadline", values.deadline) || changed;
  changed = applyScalarUpdate(next, task, "startFrom", values.startFrom) || changed;
  changed = applyScalarUpdate(next, task, "durationMin", values.durationMin) || changed;
  changed = applyScalarUpdate(next, task, "minBlockMin", values.minBlockMin) || changed;
  changed = applyTimeMapUpdate(next, task, values) || changed;
  if (!changed) {return null;}
  return {
    ...next,
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
}

export function buildBulkEditUpdates(tasks, taskIds, values) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { updates: [], changed: false };
  }
  const byId = new Map((tasks || []).map((task) => [task.id, task]));
  const updates = taskIds
    .map((taskId) => buildBulkEditUpdateForTask(byId.get(taskId), values))
    .filter(Boolean);
  return { updates, changed: updates.length > 0 };
}

function parseOptionalNumber(value) {
  if (value === "") {return undefined;}
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {return null;}
  return parsed;
}

function parseOptionalDate(value) {
  if (!value) {return undefined;}
  return parseLocalDateInput(value);
}

function validatePriority(values) {
  if (values.priority === undefined) {return "";}
  if (!Number.isFinite(values.priority)) {
    return "Priority must be a number between 1 and 5.";
  }
  if (values.priority < PRIORITY_MIN || values.priority > PRIORITY_MAX) {
    return "Priority must be a number between 1 and 5.";
  }
  return "";
}

function validateDuration(values) {
  if (values.durationMin === undefined) {return "";}
  if (!Number.isFinite(values.durationMin)) {
    return "Duration must be a number.";
  }
  if (
    values.durationMin < TASK_DURATION_STEP_MIN ||
    values.durationMin % TASK_DURATION_STEP_MIN !== 0
  ) {
    return `Duration must be at least ${TASK_DURATION_STEP_MIN} minutes and in ${TASK_DURATION_STEP_MIN} minute steps.`;
  }
  return "";
}

function validateMinBlock(values) {
  if (values.minBlockMin === undefined) {return "";}
  if (!Number.isFinite(values.minBlockMin)) {
    return "Min block length must be a number.";
  }
  return "";
}

function validateDates(values) {
  if (values.deadline === null || values.startFrom === null) {
    return "Enter a valid date or leave the field blank.";
  }
  if (
    values.deadline &&
    values.startFrom &&
    new Date(values.startFrom) > new Date(values.deadline)
  ) {
    return "Start from cannot be after deadline.";
  }
  return "";
}

function validateBulkEditValues(values) {
  const priorityError = validatePriority(values);
  if (priorityError) {return priorityError;}
  const durationError = validateDuration(values);
  if (durationError) {return durationError;}
  const minBlockError = validateMinBlock(values);
  if (minBlockError) {return minBlockError;}
  return validateDates(values);
}

function getBulkEditValues(nodes) {
  const priority = nodes?.priorityInput?.value || "";
  const duration = nodes?.durationInput?.value || "";
  const minBlock = nodes?.minBlockInput?.value || "";
  const timeMapMode = nodes?.timeMapMode?.value || TIME_MAP_MODE_KEEP;
  const timeMapIds =
    timeMapMode === TIME_MAP_MODE_REPLACE && nodes?.timeMapOptions
      ? collectSelectedValues(nodes.timeMapOptions)
      : [];
  const values = {
    priority: parseOptionalNumber(priority),
    deadline: parseOptionalDate(nodes?.deadlineInput?.value || ""),
    startFrom: parseOptionalDate(nodes?.startFromInput?.value || ""),
    durationMin: parseOptionalNumber(duration),
    minBlockMin: parseOptionalNumber(minBlock),
    timeMapMode,
    timeMapIds
  };
  return values;
}

function closeBulkEditBanner() {
  const nodes = getBulkEditNodes();
  if (nodes.banner) {
    nodes.banner.classList.add("hidden");
  }
  setTaskSortablesEnabled(true);
  state.bulkEditActive = false;
  bulkEditFallbackId = "";
  state.bulkEditSelectionIds = [];
  if (typeof state.bulkEditCleanup === "function") {
    state.bulkEditCleanup();
  }
  state.bulkEditCleanup = null;
}

function handleBulkEditCancelClick() {
  closeBulkEditBanner();
}

async function handleBulkEditApplyClick() {
  const nodes = getBulkEditNodes();
  const targetIds = resolveBulkEditTargetIds();
  if (!targetIds.length) {
    closeBulkEditBanner();
    return;
  }
  const values = getBulkEditValues(nodes);
  const error = validateBulkEditValues(values);
  if (error) {
    showNotificationBanner(error, { autoHideMs: 3500 });
    return;
  }
  const { updates, changed } = buildBulkEditUpdates(state.tasksCache, targetIds, values);
  if (!changed) {
    showNotificationBanner("No changes to apply.", { autoHideMs: 2500 });
    return;
  }
  await Promise.all(updates.map((task) => saveTask(task)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
  closeBulkEditBanner();
  showNotificationBanner(`Updated ${updates.length} task${updates.length === 1 ? "" : "s"}.`, {
    autoHideMs: 2500
  });
}

function handleBulkEditSelectionUpdate() {
  const nodes = getBulkEditNodes();
  const selectedIds = getSelectedTaskIds();
  let targetIds = [];
  if (selectedIds.length) {
    targetIds = selectedIds;
  } else if (bulkEditFallbackId) {
    targetIds = [bulkEditFallbackId];
  }
  state.bulkEditSelectionIds = targetIds;
  const count = updateBulkEditCount(nodes, targetIds);
  if (count === 0) {
    closeBulkEditBanner();
  }
}

function handleBulkEditTimeMapModeChange() {
  const nodes = getBulkEditNodes();
  updateTimeMapMode(nodes);
}

function handleBulkEditPageHide() {
  closeBulkEditBanner();
}

function setupBulkEditListeners(nodes) {
  const cleanupFns = [];
  if (nodes.cancelBtn) {
    nodes.cancelBtn.addEventListener("click", handleBulkEditCancelClick);
    cleanupFns.push(() => nodes.cancelBtn.removeEventListener("click", handleBulkEditCancelClick));
  }
  if (nodes.applyBtn) {
    nodes.applyBtn.addEventListener("click", handleBulkEditApplyClick);
    cleanupFns.push(() => nodes.applyBtn.removeEventListener("click", handleBulkEditApplyClick));
  }
  if (nodes.timeMapMode) {
    nodes.timeMapMode.addEventListener("change", handleBulkEditTimeMapModeChange);
    cleanupFns.push(() =>
      nodes.timeMapMode.removeEventListener("change", handleBulkEditTimeMapModeChange)
    );
  }
  if (domRefs.taskList) {
    domRefs.taskList.addEventListener("click", handleBulkEditSelectionUpdate);
    domRefs.taskList.addEventListener("keyup", handleBulkEditSelectionUpdate);
    cleanupFns.push(() =>
      domRefs.taskList.removeEventListener("click", handleBulkEditSelectionUpdate)
    );
    cleanupFns.push(() =>
      domRefs.taskList.removeEventListener("keyup", handleBulkEditSelectionUpdate)
    );
  }
  window.addEventListener("pagehide", handleBulkEditPageHide);
  cleanupFns.push(() => window.removeEventListener("pagehide", handleBulkEditPageHide));
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

export function openBulkEditBanner(fallbackTaskId = "") {
  const nodes = getBulkEditNodes();
  if (!nodes.banner) {return;}
  bulkEditFallbackId = fallbackTaskId || "";
  resetBulkEditForm(nodes);
  const initialIds = getSelectedTaskIds();
  if (initialIds.length) {
    state.bulkEditSelectionIds = initialIds;
  } else if (bulkEditFallbackId) {
    state.bulkEditSelectionIds = [bulkEditFallbackId];
  } else {
    state.bulkEditSelectionIds = [];
  }
  const count = updateBulkEditCount(nodes, state.bulkEditSelectionIds);
  if (count === 0) {return;}
  nodes.banner.classList.remove("hidden");
  setTaskSortablesEnabled(false);
  state.bulkEditActive = true;
  if (typeof state.bulkEditCleanup === "function") {
    state.bulkEditCleanup();
  }
  state.bulkEditCleanup = setupBulkEditListeners(nodes);
}
