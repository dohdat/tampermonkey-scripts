import Sortable from "./sortable.esm.js";
import { domRefs } from "./constants.js";
import {
  TASK_PLACEHOLDER_CLASS,
  TASK_SORTABLE_STYLE_ID,
  TASK_SORT_GROUP,
  TASK_ZONE_CLASS,
  sortableHighlightClasses
} from "./constants.js";
import {
  getContainerKey,
  getNextSubtaskOrder,
  getTaskAndDescendants,
  getTaskDepth,
  sortTasksByOrder
} from "./utils.js";
import { state } from "./page-state.js";
import { saveTask } from "./db.js";
import { computeTaskReorderUpdates } from "./tasks.js";
const { taskList } = domRefs;

export function toggleZoneHighlight(zone, shouldHighlight) {
  if (!zone) return;
  sortableHighlightClasses.forEach((cls) =>
    zone.classList[shouldHighlight ? "add" : "remove"](cls)
  );
}

export function destroyTaskSortables() {
  state.sortableInstances.forEach((instance) => instance?.destroy?.());
  state.sortableInstances = [];
}

export function ensureSortableStyles() {
  if (document.getElementById(TASK_SORTABLE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TASK_SORTABLE_STYLE_ID;
  style.textContent = `
.sortable-ghost { opacity: 0.6; }
.sortable-drag { opacity: 0.8; }
.sortable-chosen {
  box-shadow: 0 10px 25px rgba(74, 222, 128, 0.45);
  outline: 2px solid rgba(74, 222, 128, 0.7);
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

export function getDropBeforeId(element) {
  const nextTask = element?.nextElementSibling?.closest?.("[data-task-id]");
  return nextTask ? nextTask.dataset.taskId : null;
}

export function findPreviousTaskId(card) {
  if (!card) return "";
  let prev = card.previousElementSibling;
  while (prev) {
    const prevId = prev.dataset?.taskId;
    if (prevId) return prevId;
    prev = prev.previousElementSibling;
  }
  return "";
}

export async function handleTaskSortEnd(evt) {
  const movedTaskId = evt.item?.dataset?.taskId;
  const targetZone = evt.to?.closest?.("[data-drop-section]");
  if (!movedTaskId || !targetZone) return;
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
  const targetSection = (targetZone.dataset.dropSection || "").trim();
  const targetSubsection = (targetZone.dataset.dropSubsection || "").trim();
  const dropBeforeId = getDropBeforeId(evt.item);
  const prevTaskId = findPreviousTaskId(evt.item);
  const movedTask = state.tasksCache.find((t) => t.id === movedTaskId);
  const dropBeforeTask = dropBeforeId ? state.tasksCache.find((t) => t.id === dropBeforeId) : null;
  const prevTask = prevTaskId ? state.tasksCache.find((t) => t.id === prevTaskId) : null;
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const movedSubtreeIds = new Set(getTaskAndDescendants(movedTaskId, state.tasksCache).map((t) => t.id));
  const resolveParent = (task) => {
    if (!task) return { found: false, parentId: null };
    let candidateId = task.subtaskParentId || null;
    while (candidateId && movedSubtreeIds.has(candidateId)) {
      const ancestor = state.tasksCache.find((t) => t.id === candidateId);
      candidateId = ancestor?.subtaskParentId || null;
    }
    if (!candidateId) return { found: true, parentId: null };
    const candidateTask = state.tasksCache.find((t) => t.id === candidateId);
    if (!candidateTask) return { found: true, parentId: null };
    const candidateKey = getContainerKey(candidateTask.section, candidateTask.subsection);
    if (candidateKey !== targetKey) return { found: true, parentId: null };
    return { found: true, parentId: candidateId };
  };
  const parentFromDropBefore = resolveParent(dropBeforeTask);
  const parentFromPrev = resolveParent(prevTask);
  const desiredParentId = parentFromDropBefore.found
    ? parentFromDropBefore.parentId
    : parentFromPrev.parentId;
  const reorderResult = computeTaskReorderUpdates(
    state.tasksCache,
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId
  );
  const updates = reorderResult.updates || [];
  const existingIndex = updates.findIndex((u) => u.id === movedTaskId);
  if (movedTask && desiredParentId !== movedTask.subtaskParentId) {
    const base = existingIndex >= 0 ? updates[existingIndex] : movedTask;
    const updated = { ...base, subtaskParentId: desiredParentId };
    if (existingIndex >= 0) {
      updates[existingIndex] = updated;
    } else {
      updates.push(updated);
    }
  }
  const changed = updates.length > 0 || reorderResult.changed;
  if (!changed) return;
  await Promise.all(updates.map((t) => saveTask(t)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
}

export function setupTaskSortables() {
  destroyTaskSortables();
  ensureSortableStyles();
  const zones = [...taskList.querySelectorAll(`.${TASK_ZONE_CLASS}`)];
  zones.forEach((zone) => {
    const sortable = new Sortable(zone, {
      group: { name: TASK_SORT_GROUP, pull: true, put: true },
      animation: 150,
      draggable: "[data-task-id]",
      handle: undefined,
      filter: `.${TASK_PLACEHOLDER_CLASS}, button, a, input, textarea, select, label`,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      swapThreshold: 0.65,
      fallbackOnBody: true,
      onStart: (event) => {
        toggleZoneHighlight(event.from, true);
      },
      onEnd: (event) => {
        toggleZoneHighlight(event.from, false);
        toggleZoneHighlight(event.to, false);
        handleTaskSortEnd(event).catch((error) => console.error("Task sort failed", error));
      }
    });
    state.sortableInstances.push(sortable);
  });
}

export async function indentTaskUnderPrevious(card) {
  if (!card) return;
  const childId = card.dataset.taskId;
  const childDepth = getTaskDepth(childId, state.tasksCache);
  let parentId = "";
  let prev = card.previousElementSibling;
  while (prev) {
    const pid = prev.dataset?.taskId;
    if (pid) {
      const prevDepth = getTaskDepth(pid, state.tasksCache);
      if (prevDepth <= childDepth) {
        parentId = pid;
        break;
      }
    }
    prev = prev.previousElementSibling;
  }
  if (!childId || !parentId) return;
  const childTask = state.tasksCache.find((t) => t.id === childId);
  const parentTask = state.tasksCache.find((t) => t.id === parentId);
  if (!childTask || !parentTask) return;
  const childDescendants = new Set(getTaskAndDescendants(childId, state.tasksCache).map((t) => t.id));
  if (childDescendants.has(parentTask.id)) return;
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const nextOrder = getNextSubtaskOrder(parentTask, section, subsection, state.tasksCache);
  const updatedChild = {
    ...childTask,
    section,
    subsection,
    subtaskParentId: parentTask.id,
    order: nextOrder
  };
  await saveTask(updatedChild);
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
}

export async function outdentTask(card) {
  if (!card) return;
  const childId = card.dataset.taskId;
  const childTask = state.tasksCache.find((t) => t.id === childId);
  if (!childTask || !childTask.subtaskParentId) return;
  const parentTask = state.tasksCache.find((t) => t.id === childTask.subtaskParentId);
  if (!parentTask) return;
  const subtree = getTaskAndDescendants(childId, state.tasksCache);
  const descendantIds = new Set(subtree.filter((t) => t.id !== childId).map((t) => t.id));
  const oldSection = childTask.section || "";
  const oldSubsection = childTask.subsection || "";
  const newParentId = parentTask.subtaskParentId || null;
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const sourceKey = getContainerKey(oldSection, oldSubsection);
  const updates = [];
  const originalById = new Map(state.tasksCache.map((t) => [t.id, t]));

  const adjustedContainerTasks = sortTasksByOrder(
    state.tasksCache
      .filter((t) => getContainerKey(t.section, t.subsection) === sourceKey)
      .filter((t) => t.id !== childId)
      .map((t) => {
        if (descendantIds.has(t.id)) {
          return { ...t, subtaskParentId: parentTask.id, section, subsection };
        }
        return t;
      })
  );

  const adoptedIds = new Set(
    adjustedContainerTasks.filter((t) => t.subtaskParentId === parentTask.id).map((t) => t.id)
  );
  const finalList = [
    ...adjustedContainerTasks,
    { ...childTask, section, subsection, subtaskParentId: newParentId }
  ];

  finalList.forEach((task, idx) => {
    const desiredOrder = idx + 1;
    const desiredSection = task.section || "";
    const desiredSubsection = task.subsection || "";
    const desiredParentId =
      task.id === childId
        ? newParentId
        : descendantIds.has(task.id) || adoptedIds.has(task.id)
          ? parentTask.id
          : task.subtaskParentId;
    const original = originalById.get(task.id);
    const needsUpdate =
      !original ||
      original.order !== desiredOrder ||
      (original.section || "") !== desiredSection ||
      (original.subsection || "") !== desiredSubsection ||
      (original.subtaskParentId || "") !== (desiredParentId || "");
    if (needsUpdate) {
      updates.push({
        ...task,
        section: desiredSection,
        subsection: desiredSubsection,
        order: desiredOrder,
        subtaskParentId: desiredParentId
      });
    }
  });
  if (updates.length === 0) return;
  await Promise.all(updates.map((t) => saveTask(t)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
}
