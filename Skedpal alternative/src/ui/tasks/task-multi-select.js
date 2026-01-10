import { domRefs } from "../constants.js";
import { state } from "../state/page-state.js";
import { getNextSubtaskOrder, getTaskDepth, buildInheritedSubtaskUpdate } from "../utils.js";
import { saveTask } from "../../data/db.js";
import {
  findIndentParentId,
  getOutdentContextByTaskId,
  buildOutdentUpdates
} from "./tasks-sortable.js";

const { taskList } = domRefs;

function getSelectedTaskCards() {
  if (!taskList) {return [];}
  return [...taskList.querySelectorAll(".sortable-selected[data-task-id]")];
}

function getSelectedRootTaskIds(cards) {
  const selectedIds = new Set(cards.map((card) => card.dataset.taskId).filter(Boolean));
  const byId = new Map(state.tasksCache.map((task) => [task.id, task]));
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

function areRootTasksInSameContainer(rootTaskIds) {
  if (rootTaskIds.length <= 1) {return true;}
  const byId = new Map(state.tasksCache.map((task) => [task.id, task]));
  const first = byId.get(rootTaskIds[0]);
  if (!first) {return false;}
  const baseKey = `${first.section || ""}::${first.subsection || ""}`;
  return rootTaskIds.every((taskId) => {
    const task = byId.get(taskId);
    const taskKey = task ? `${task.section || ""}::${task.subsection || ""}` : "";
    return taskKey === baseKey;
  });
}

export async function indentSelectedTasks() {
  const cards = getSelectedTaskCards();
  if (!cards.length) {return false;}
  const rootTaskIds = getSelectedRootTaskIds(cards);
  if (!rootTaskIds.length || !areRootTasksInSameContainer(rootTaskIds)) {return false;}
  const firstCard = cards.find((card) => card.dataset.taskId === rootTaskIds[0]) || cards[0];
  const childDepth = getTaskDepth(rootTaskIds[0], state.tasksCache);
  const parentId = findIndentParentId(firstCard, childDepth);
  if (!parentId) {return false;}
  const parentTask = state.tasksCache.find((task) => task.id === parentId);
  if (!parentTask) {return false;}
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const tasksWithNew = [...state.tasksCache];
  const updates = [];
  rootTaskIds.forEach((taskId) => {
    const childTask = state.tasksCache.find((task) => task.id === taskId);
    if (!childTask) {return;}
    const nextOrder = getNextSubtaskOrder(parentTask, section, subsection, tasksWithNew);
    const updated = buildInheritedSubtaskUpdate(
      { ...childTask, section, subsection, subtaskParentId: parentTask.id, order: nextOrder },
      parentTask
    ) || { ...childTask, section, subsection, subtaskParentId: parentTask.id, order: nextOrder };
    updates.push(updated);
    tasksWithNew.push(updated);
  });
  if (!updates.length) {return false;}
  await Promise.all(updates.map((task) => saveTask(task)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
  return true;
}

export async function outdentSelectedTasks() {
  const cards = getSelectedTaskCards();
  if (!cards.length) {return false;}
  const rootTaskIds = getSelectedRootTaskIds(cards);
  if (!rootTaskIds.length || !areRootTasksInSameContainer(rootTaskIds)) {return false;}
  let workingTasks = state.tasksCache.map((task) => ({ ...task }));
  const updatesById = new Map();
  rootTaskIds.forEach((taskId) => {
    const context = getOutdentContextByTaskId(taskId, workingTasks);
    if (!context) {return;}
    const updates = buildOutdentUpdates(context, workingTasks);
    if (!updates.length) {return;}
    updates.forEach((task) => {
      updatesById.set(task.id, task);
    });
    const updatedById = new Map(workingTasks.map((task) => [task.id, task]));
    updates.forEach((task) => {
      updatedById.set(task.id, task);
    });
    workingTasks = [...updatedById.values()];
  });
  const updates = [...updatesById.values()];
  if (!updates.length) {return false;}
  await Promise.all(updates.map((task) => saveTask(task)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
  return true;
}
