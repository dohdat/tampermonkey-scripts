import { domRefs } from "../constants.js";
import { state } from "../state/page-state.js";

export function getSelectedTaskCards() {
  if (!domRefs.taskList) {return [];}
  return [...domRefs.taskList.querySelectorAll(".sortable-selected[data-task-id]")];
}

export function getSelectedRootTaskIds(cards, tasks = state.tasksCache) {
  const selectedIds = new Set(cards.map((card) => card.dataset.taskId).filter(Boolean));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return cards
    .map((card) => card.dataset.taskId)
    .filter(Boolean)
    .filter((taskId) => {
      const task = byId.get(taskId);
      let parentId = task?.subtaskParentId || "";
      while (parentId) {
        if (selectedIds.has(parentId)) {return false;}
        parentId = byId.get(parentId)?.subtaskParentId || "";
      }
      return true;
    });
}
