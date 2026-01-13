import { domRefs } from "./constants.js";
import {
  handleTaskTitleConversionPreviewClick,
  updateTaskTitleConversionPreview,
  updateTaskTitleHelper
} from "./tasks/task-form-ui.js";
import {
  handleTaskContainerDoubleClick,
  handleTaskListClick,
  handleTaskTitleDoubleClick
} from "./tasks/task-list-actions.js";
import {
  handleAddTaskInputConversion,
  handleAddTaskLiteralClick
} from "./tasks/task-add-row.js";
import { initTaskTemplateSelect } from "./tasks/task-template-select.js";
import { initTaskListAssistant } from "./tasks/task-ai.js";
import {
  handleTaskSubmit,
  handleReschedule,
  syncTaskDurationHelper,
  startTaskInSection
} from "./tasks/tasks-actions.js";
import { setZoomFilter } from "./navigation.js";
import { applyPrioritySelectColor, toggleClearButtonVisibility } from "./utils.js";

const {
  taskToggle,
  taskLinkInput,
  taskLinkClearBtn,
  taskDurationInput,
  taskPriorityInput,
  taskList,
  todayList,
  reportList,
  rescheduleButtons
} = domRefs;

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

async function handleTaskListClickEvent(event) {
  if (handleAddTaskLiteralClick(event)) {return;}
  await handleTaskListClick(event);
}

function handleTaskListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleTodayListClickEvent(event) {
  await handleTaskListClick(event);
}

function handleTodayListDoubleClickEvent(event) {
  handleTaskTitleDoubleClick(event);
  handleTaskContainerDoubleClick(event);
}

async function handleReportListClickEvent(event) {
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
    cleanupFns.push(() => taskList.removeEventListener("click", handleTaskListClickEvent));
    cleanupFns.push(() =>
      taskList.removeEventListener("dblclick", handleTaskListDoubleClickEvent)
    );
    cleanupFns.push(() => taskList.removeEventListener("input", handleAddTaskInputConversion));
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
    cleanupFns.push(() => reportList.removeEventListener("click", handleReportListClickEvent));
    cleanupFns.push(() =>
      reportList.removeEventListener("dblclick", handleReportListDoubleClickEvent)
    );
  }
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
  setupRescheduleButtons(cleanupFns);
  setupTaskHelpers(cleanupFns);
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
