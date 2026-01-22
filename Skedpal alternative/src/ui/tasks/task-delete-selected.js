import { getSelectedTaskCards, getSelectedRootTaskIds } from "./task-selection-utils.js";

export async function deleteSelectedTasks(options = {}) {
  const cards = getSelectedTaskCards();
  if (!cards.length) {return false;}
  const rootTaskIds = getSelectedRootTaskIds(cards);
  if (!rootTaskIds.length) {return false;}
  if (typeof options.deleteTasks === "function") {
    await options.deleteTasks(rootTaskIds);
    return true;
  }
  const deleteTasksWithUndo =
    options.deleteTasksWithUndo ||
    (await import("./task-list-actions.js")).deleteTasksWithUndo;
  await deleteTasksWithUndo(rootTaskIds);
  return true;
}
