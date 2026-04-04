import {
  GRAMMAR_FIX_SUCCESS_FEEDBACK_MS,
  REPORT_TIMEMAP_SEARCH_DEBOUNCE_MS,
  TASK_TITLE_MAX_LENGTH,
  domRefs,
  grammarSuccessIconSvg,
  sparklesIconSvg
} from "./constants.js";
import {
  handleTaskTitleConversionPreviewClick,
  updateTaskTitleConversionPreview,
  updateTaskTitleHelper
} from "./tasks/task-form-ui.js";
import {
  handleTaskContainerDoubleClick,
  handleTaskListClick,
  handleTaskTitleClick,
  handleTaskTitleDoubleClick
} from "./tasks/task-list-actions.js";
import {
  handleAddTaskInputConversion,
  handleAddTaskLiteralClick
} from "./tasks/task-add-row.js";
import { initTaskTemplateSelect } from "./tasks/task-template-select.js";
import { fixTaskTitleGrammar, initTaskListAssistant } from "./tasks/task-ai.js";
import {
  handleTaskSubmit,
  handleReschedule,
  syncTaskDurationHelper,
  startTaskInSection
} from "./tasks/tasks-actions.js";
import { setZoomFilter } from "./navigation.js";
import {
  applyPrioritySelectColor,
  parseLocalDateInput,
  toggleClearButtonVisibility
} from "./utils.js";
import { toDateInputValue } from "./date-picker-utils.js";
import { updateTaskDetailField } from "./tasks/task-detail-updates.js";
import { state } from "./state/page-state.js";
import { renderReport } from "./report.js";

const {
  taskToggle,
  taskLinkInput,
  taskLinkClearBtn,
  taskDurationInput,
  taskPriorityInput,
  taskList,
  todayList,
  reportList,
  reportDelayInput,
  taskTitleGrammarBtn,
  rescheduleButtons
} = domRefs;
let reportTimeMapSearchDebounceTimer = null;
const taskTitleGrammarSuccessTimers = new WeakMap();
const TASK_TITLE_GRAMMAR_DEFAULT_LABEL = "Fix grammar";
const TASK_TITLE_GRAMMAR_SUCCESS_LABEL = "Grammar fixed";

function clearReportTimeMapSearchDebounceTimer() {
  if (!reportTimeMapSearchDebounceTimer) {return;}
  clearTimeout(reportTimeMapSearchDebounceTimer);
  reportTimeMapSearchDebounceTimer = null;
}

function resolveReportTimeMapSearchInput() {
  if (!reportList?.querySelector) {return null;}
  const input = reportList.querySelector("[data-report-timemap-search='true']");
  if (!input || input.tagName !== "INPUT") {return null;}
  return input;
}

function restoreReportTimeMapSearchInputFocus(selectionStart, selectionEnd) {
  const searchInput = resolveReportTimeMapSearchInput();
  if (!searchInput) {return;}
  if (typeof searchInput.focus === "function") {
    searchInput.focus({ preventScroll: true });
  }
  if (
    Number.isInteger(selectionStart) &&
    Number.isInteger(selectionEnd) &&
    typeof searchInput.setSelectionRange === "function"
  ) {
    searchInput.setSelectionRange(selectionStart, selectionEnd);
  }
}

function handleTaskLinkClearClick() {
  taskLinkInput.value = "";
  taskLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
  taskLinkInput.focus();
}

function handleTaskStartFromClearClick() {
  const input = domRefs.taskStartFromInput;
  if (!input) {return;}
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
}

function handleTaskDeadlineClearClick() {
  const input = domRefs.taskDeadlineInput;
  if (!input) {return;}
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
}

function handleTaskToggleClick() {
  startTaskInSection();
}

function handleTaskDetailsChange(event) {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) {return;}
  const testId = select.getAttribute("data-test-skedpal") || "";
  if (
    testId !== "task-detail-priority-select" &&
    testId !== "task-detail-duration-select" &&
    testId !== "task-detail-timemap-select"
  ) {
    return;
  }
  const card = select.closest?.('[data-test-skedpal="task-card"]');
  const taskId = card?.dataset?.taskId || "";
  if (!taskId) {return;}
  const task = state.tasksCache.find((t) => t.id === taskId);
  if (!task) {return;}

  const handlers = {
    "task-detail-priority-select": () => {
      const nextPriority = Number(select.value);
      if (Number.isFinite(nextPriority) && nextPriority !== Number(task.priority)) {
        updateTaskDetailField(task, { priority: nextPriority });
      }
    },
    "task-detail-duration-select": () => {
      const nextDuration = Number(select.value);
      if (Number.isFinite(nextDuration) && nextDuration !== Number(task.durationMin)) {
        updateTaskDetailField(task, { durationMin: nextDuration });
      }
    },
    "task-detail-timemap-select": () => {
      if (select.value === "__multiple__") {return;}
      const nextIds = select.value ? [select.value] : [];
      const current = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
      if (current.length !== nextIds.length || current[0] !== nextIds[0]) {
        updateTaskDetailField(task, { timeMapIds: nextIds });
      }
    }
  };

  handlers[testId]?.();
}

async function handleTaskListClickEvent(event) {
  if (handleTaskTitleClick(event)) {return;}
  if (handleAddTaskLiteralClick(event)) {return;}
  await handleTaskListClick(event);
}

function handleTaskListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleTodayListClickEvent(event) {
  if (handleTaskTitleClick(event)) {return;}
  await handleTaskListClick(event);
}

function handleTodayListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleReportListClickEvent(event) {
  if (handleReportDelayClick(event)) {return;}
  if (handleReportTimeMapMoreToggleClick(event)) {return;}
  if (handleReportTimeMapTaskClick(event)) {return;}
  if (handleTaskTitleClick(event)) {return;}
  await handleTaskListClick(event, { switchView: false });
}

function handleReportListDoubleClickEvent(event) {
  const card = event.target.closest?.('[data-test-skedpal="task-card"]');
  if (!card) {return;}
  const taskId = card.dataset.taskId || "";
  if (!taskId) {return;}
  setZoomFilter({
    type: "task",
    taskId,
    sectionId: card.dataset.sectionId || "",
    subsectionId: card.dataset.subsectionId || ""
  });
}

function resolveReportDelayAnchor(task) {
  if (!task) {return new Date();}
  const anchorValue = task.repeatAnchor || task.startFrom || task.deadline || null;
  const anchorDate = anchorValue ? new Date(anchorValue) : null;
  return anchorDate && !Number.isNaN(anchorDate.getTime()) ? anchorDate : new Date();
}

function handleReportDelayClick(event) {
  const btn = event.target.closest?.("[data-report-delay]");
  if (!btn) {return false;}
  if (!reportDelayInput) {return true;}
  const taskId = btn.dataset.reportDelay || "";
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return true;}
  const anchorDate = resolveReportDelayAnchor(task);
  reportDelayInput.dataset.reportDelayTask = taskId;
  reportDelayInput.value = toDateInputValue(anchorDate);
  reportDelayInput.click();
  return true;
}

function handleReportTimeMapTaskClick(event) {
  const btn = event.target.closest?.("[data-report-timemap-task]");
  if (!btn) {return false;}
  const taskId = btn.dataset.reportTimemapTask || "";
  if (!taskId) {return true;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return true;}
  setZoomFilter({
    type: "task",
    taskId,
    sectionId: task.section || "",
    subsectionId: task.subsection || ""
  });
  return true;
}

function handleReportTimeMapMoreToggleClick(event) {
  const btn = event.target.closest?.("[data-report-timemap-more-toggle]");
  if (!btn) {return false;}
  const wrap = btn.closest?.('[data-test-skedpal="report-timemap-assigned-more"]');
  const moreList = wrap?.querySelector?.('[data-test-skedpal="report-timemap-assigned-more-list"]');
  if (!moreList) {return true;}
  const hiddenCount = Number(btn.dataset.hiddenCount) || 0;
  const isExpanded = btn.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;
  btn.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
  btn.textContent = nextExpanded ? "Show less" : `+${hiddenCount} more`;
  moreList.classList.toggle("hidden", !nextExpanded);
  return true;
}

function handleReportTimeMapSearchInputEvent(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {return false;}
  if (input.dataset.reportTimemapSearch !== "true") {return false;}
  state.reportTimeMapTaskSearch = input.value || "";
  const selectionStart = Number.isInteger(input.selectionStart) ? input.selectionStart : null;
  const selectionEnd = Number.isInteger(input.selectionEnd) ? input.selectionEnd : null;
  clearReportTimeMapSearchDebounceTimer();
  reportTimeMapSearchDebounceTimer = setTimeout(() => {
    reportTimeMapSearchDebounceTimer = null;
    renderReport(state.tasksCache);
    restoreReportTimeMapSearchInputFocus(selectionStart, selectionEnd);
  }, REPORT_TIMEMAP_SEARCH_DEBOUNCE_MS);
  return true;
}

async function handleReportDelayInputChange(event) {
  const input = event.currentTarget;
  const taskId = input?.dataset?.reportDelayTask || "";
  if (!taskId) {return;}
  const selectedIso = parseLocalDateInput(input.value);
  input.dataset.reportDelayTask = "";
  input.value = "";
  if (!selectedIso) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return;}
  await updateTaskDetailField(task, { repeatAnchor: selectedIso });
}

function setupTaskFormSubmit(cleanupFns) {
  const taskForm = document.getElementById("task-form");
  if (!taskForm) {return;}
  taskForm.addEventListener("submit", handleTaskSubmit);
  cleanupFns.push(() => taskForm.removeEventListener("submit", handleTaskSubmit));
}

function setupTaskLinkClear(cleanupFns) {
  if (!taskLinkInput || !taskLinkClearBtn) {return;}
  const syncClear = () => toggleClearButtonVisibility(taskLinkInput, taskLinkClearBtn);
  taskLinkInput.addEventListener("input", syncClear);
  taskLinkClearBtn.addEventListener("click", handleTaskLinkClearClick);
  syncClear();
  cleanupFns.push(() => taskLinkInput?.removeEventListener("input", syncClear));
  cleanupFns.push(() => taskLinkClearBtn?.removeEventListener("click", handleTaskLinkClearClick));
}

function setupTaskStartFromClear(cleanupFns) {
  const taskStartFromClearBtn = document.querySelector('[data-test-skedpal="task-start-from-clear"]');
  if (!domRefs.taskStartFromInput || !taskStartFromClearBtn) {return;}
  const syncStartFromClear = () =>
    toggleClearButtonVisibility(domRefs.taskStartFromInput, taskStartFromClearBtn);
  domRefs.taskStartFromInput.addEventListener("input", syncStartFromClear);
  taskStartFromClearBtn.addEventListener("click", handleTaskStartFromClearClick);
  syncStartFromClear();
  cleanupFns.push(() =>
    domRefs.taskStartFromInput?.removeEventListener("input", syncStartFromClear)
  );
  cleanupFns.push(() =>
    taskStartFromClearBtn?.removeEventListener("click", handleTaskStartFromClearClick)
  );
}

function setupTaskDeadlineClear(cleanupFns) {
  const taskDeadlineClearBtn = document.querySelector('[data-test-skedpal="task-deadline-clear"]');
  if (!domRefs.taskDeadlineInput || !taskDeadlineClearBtn) {return;}
  const syncDeadlineClear = () =>
    toggleClearButtonVisibility(domRefs.taskDeadlineInput, taskDeadlineClearBtn);
  domRefs.taskDeadlineInput.addEventListener("input", syncDeadlineClear);
  taskDeadlineClearBtn.addEventListener("click", handleTaskDeadlineClearClick);
  syncDeadlineClear();
  cleanupFns.push(() =>
    domRefs.taskDeadlineInput?.removeEventListener("input", syncDeadlineClear)
  );
  cleanupFns.push(() =>
    taskDeadlineClearBtn?.removeEventListener("click", handleTaskDeadlineClearClick)
  );
}

function setupTaskDuration(cleanupFns) {
  if (!taskDurationInput) {return;}
  taskDurationInput.addEventListener("input", syncTaskDurationHelper);
  syncTaskDurationHelper();
  cleanupFns.push(() =>
    taskDurationInput.removeEventListener("input", syncTaskDurationHelper)
  );
}

function setTaskTitleGrammarButtonLoading(button, isLoading) {
  if (!button) {return;}
  if (isLoading) {
    clearTaskTitleGrammarSuccessFeedback(button);
  }
  button.disabled = isLoading;
  button.dataset.loading = isLoading ? "true" : "false";
  button.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function clearTaskTitleGrammarSuccessFeedback(button) {
  if (!button) {return;}
  const timerId = taskTitleGrammarSuccessTimers.get(button);
  if (timerId) {
    clearTimeout(timerId);
    taskTitleGrammarSuccessTimers.delete(button);
  }
  button.dataset.success = "false";
  button.classList.remove("text-lime-300", "border-lime-400");
  button.innerHTML = sparklesIconSvg;
  button.title = TASK_TITLE_GRAMMAR_DEFAULT_LABEL;
  button.setAttribute("aria-label", TASK_TITLE_GRAMMAR_DEFAULT_LABEL);
}

function showTaskTitleGrammarSuccessFeedback(button) {
  if (!button) {return;}
  clearTaskTitleGrammarSuccessFeedback(button);
  button.dataset.success = "true";
  button.classList.add("text-lime-300", "border-lime-400");
  button.innerHTML = grammarSuccessIconSvg;
  button.title = TASK_TITLE_GRAMMAR_SUCCESS_LABEL;
  button.setAttribute("aria-label", TASK_TITLE_GRAMMAR_SUCCESS_LABEL);
  const timerId = setTimeout(() => {
    taskTitleGrammarSuccessTimers.delete(button);
    clearTaskTitleGrammarSuccessFeedback(button);
  }, GRAMMAR_FIX_SUCCESS_FEEDBACK_MS);
  taskTitleGrammarSuccessTimers.set(button, timerId);
}

async function handleTaskTitleGrammarButtonClick(event) {
  const button = event.currentTarget;
  if (!button || button.tagName !== "BUTTON" || !domRefs.taskTitleInput) {return;}
  event.preventDefault();
  const sourceTitle = domRefs.taskTitleInput.value || "";
  if (!sourceTitle.trim()) {
    domRefs.taskTitleInput.focus();
    return;
  }
  setTaskTitleGrammarButtonLoading(button, true);
  try {
    const fixedTitle = await fixTaskTitleGrammar(sourceTitle);
    const nextTitle = String(fixedTitle || "").trim();
    if (!nextTitle) {return;}
    domRefs.taskTitleInput.value = nextTitle.slice(0, TASK_TITLE_MAX_LENGTH);
    updateTaskTitleHelper();
    updateTaskTitleConversionPreview();
    showTaskTitleGrammarSuccessFeedback(button);
  } catch (error) {
    console.error("Failed to fix task title grammar.", error);
  } finally {
    setTaskTitleGrammarButtonLoading(button, false);
    domRefs.taskTitleInput?.focus();
  }
}

function setupTaskTitle(cleanupFns) {
  if (!domRefs.taskTitleInput) {return;}
  const handleTitleInput = () => {
    updateTaskTitleHelper();
    updateTaskTitleConversionPreview();
  };
  domRefs.taskTitleInput.addEventListener("input", handleTitleInput);
  updateTaskTitleHelper();
  updateTaskTitleConversionPreview();
  cleanupFns.push(() => domRefs.taskTitleInput?.removeEventListener("input", handleTitleInput));
  if (domRefs.taskTitleConversionPreview) {
    domRefs.taskTitleConversionPreview.addEventListener(
      "click",
      handleTaskTitleConversionPreviewClick
    );
    cleanupFns.push(() =>
      domRefs.taskTitleConversionPreview?.removeEventListener(
        "click",
        handleTaskTitleConversionPreviewClick
      )
    );
  }
  if (taskTitleGrammarBtn) {
    clearTaskTitleGrammarSuccessFeedback(taskTitleGrammarBtn);
    taskTitleGrammarBtn.addEventListener("click", handleTaskTitleGrammarButtonClick);
    cleanupFns.push(() =>
      taskTitleGrammarBtn.removeEventListener("click", handleTaskTitleGrammarButtonClick)
    );
    cleanupFns.push(() => clearTaskTitleGrammarSuccessFeedback(taskTitleGrammarBtn));
  }
}

function setupTaskPriority(cleanupFns) {
  if (!taskPriorityInput) {return;}
  const applyPriority = () => applyPrioritySelectColor(taskPriorityInput);
  taskPriorityInput.addEventListener("change", applyPriority);
  applyPriority();
  cleanupFns.push(() => taskPriorityInput.removeEventListener("change", applyPriority));
}

function setupTaskToggle(cleanupFns) {
  if (!taskToggle) {return;}
  taskToggle.addEventListener("click", handleTaskToggleClick);
  cleanupFns.push(() => taskToggle.removeEventListener("click", handleTaskToggleClick));
}

function setupTaskLists(cleanupFns) {
  if (taskList) {
    taskList.addEventListener("click", handleTaskListClickEvent);
    taskList.addEventListener("dblclick", handleTaskListDoubleClickEvent);
    taskList.addEventListener("input", handleAddTaskInputConversion);
    taskList.addEventListener("change", handleTaskDetailsChange);
    cleanupFns.push(() => taskList.removeEventListener("click", handleTaskListClickEvent));
    cleanupFns.push(() =>
      taskList.removeEventListener("dblclick", handleTaskListDoubleClickEvent)
    );
    cleanupFns.push(() => taskList.removeEventListener("input", handleAddTaskInputConversion));
    cleanupFns.push(() => taskList.removeEventListener("change", handleTaskDetailsChange));
  }
  if (todayList) {
    todayList.addEventListener("click", handleTodayListClickEvent);
    todayList.addEventListener("dblclick", handleTodayListDoubleClickEvent);
    cleanupFns.push(() => todayList.removeEventListener("click", handleTodayListClickEvent));
    cleanupFns.push(() =>
      todayList.removeEventListener("dblclick", handleTodayListDoubleClickEvent)
    );
  }
  if (reportList) {
    reportList.addEventListener("click", handleReportListClickEvent);
    reportList.addEventListener("dblclick", handleReportListDoubleClickEvent);
    reportList.addEventListener("input", handleReportTimeMapSearchInputEvent);
    cleanupFns.push(() => reportList.removeEventListener("click", handleReportListClickEvent));
    cleanupFns.push(() =>
      reportList.removeEventListener("dblclick", handleReportListDoubleClickEvent)
    );
    cleanupFns.push(() =>
      reportList.removeEventListener("input", handleReportTimeMapSearchInputEvent)
    );
    cleanupFns.push(() => clearReportTimeMapSearchDebounceTimer());
  }
}

function setupReportDelayInput(cleanupFns) {
  if (!reportDelayInput) {return;}
  reportDelayInput.addEventListener("change", handleReportDelayInputChange);
  cleanupFns.push(() =>
    reportDelayInput.removeEventListener("change", handleReportDelayInputChange)
  );
}

function setupRescheduleButtons(cleanupFns) {
  rescheduleButtons.forEach((btn) => {
    btn.addEventListener("click", handleReschedule);
    cleanupFns.push(() => btn.removeEventListener("click", handleReschedule));
  });
}

function setupTaskHelpers(cleanupFns) {
  cleanupFns.push(initTaskTemplateSelect());
  cleanupFns.push(initTaskListAssistant());
}

export function registerTaskFormHandlers() {
  const cleanupFns = [];
  setupTaskFormSubmit(cleanupFns);
  setupTaskLinkClear(cleanupFns);
  setupTaskStartFromClear(cleanupFns);
  setupTaskDeadlineClear(cleanupFns);
  setupTaskDuration(cleanupFns);
  setupTaskTitle(cleanupFns);
  setupTaskPriority(cleanupFns);
  setupTaskToggle(cleanupFns);
  setupTaskLists(cleanupFns);
  setupReportDelayInput(cleanupFns);
  setupRescheduleButtons(cleanupFns);
  setupTaskHelpers(cleanupFns);
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
