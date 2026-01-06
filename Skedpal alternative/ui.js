import { domRefs } from "./constants.js";

const { taskFormWrap, taskToggle } = domRefs;

export function openTaskForm() {
  taskFormWrap.classList.remove("hidden");
  taskToggle.textContent = "Add task";
  document.body.classList.add("modal-open");
  setTimeout(() => {
    document.getElementById("task-title")?.focus();
  }, 50);
}

export function closeTaskForm() {
  taskFormWrap.classList.add("hidden");
  taskToggle.textContent = "Add task";
  document.body.classList.remove("modal-open");
}
