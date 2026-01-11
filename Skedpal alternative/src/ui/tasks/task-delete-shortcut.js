import { domRefs } from "../constants.js";
import { deleteSelectedTasks } from "./task-delete-selected.js";

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {return false;}
  if (target.isContentEditable) {return true;}
  const tag = target.tagName?.toLowerCase?.();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function initTaskDeleteShortcut() {
  const handleDeleteKeydown = async (event) => {
    if (event.key !== "Delete") {return;}
    if (isEditableTarget(event.target)) {return;}
    if (domRefs.taskFormWrap && !domRefs.taskFormWrap.classList.contains("hidden")) {return;}
    const handled = await deleteSelectedTasks();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener("keydown", handleDeleteKeydown);
  const handlePageHide = () => {
    document.removeEventListener("keydown", handleDeleteKeydown);
    window.removeEventListener("pagehide", handlePageHide);
  };
  window.addEventListener("pagehide", handlePageHide);
  return () => {
    document.removeEventListener("keydown", handleDeleteKeydown);
    window.removeEventListener("pagehide", handlePageHide);
  };
}
