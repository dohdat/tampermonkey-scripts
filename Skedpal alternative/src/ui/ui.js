import { FIFTY, domRefs } from "./constants.js";
import { resetTaskModalSections } from "./task-modal-sections.js";

function getTaskFormRefs() {
  return {
    taskFormWrap: domRefs.taskFormWrap,
    taskToggle: domRefs.taskToggle
  };
}

export function openTaskForm() {
  const { taskFormWrap, taskToggle } = getTaskFormRefs();
  if (!taskFormWrap) {return;}
  taskFormWrap.classList.remove("hidden");
  resetTaskModalSections();
  if (taskToggle) {
    taskToggle.textContent = "Add task";
  }
  document.body.classList.add("modal-open");
  setTimeout(() => {
    document.getElementById("task-title")?.focus();
  }, FIFTY);
}

export function closeTaskForm() {
  const { taskFormWrap, taskToggle } = getTaskFormRefs();
  if (!taskFormWrap) {return;}
  taskFormWrap.classList.add("hidden");
  if (taskToggle) {
    taskToggle.textContent = "Add task";
  }
  document.body.classList.remove("modal-open");
}
