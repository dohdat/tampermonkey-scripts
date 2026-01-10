import Sortable, { MultiDrag } from "../../../vendor/sortable.esm.js";
import { domRefs } from "../constants.js";
import {
  TASK_PLACEHOLDER_CLASS,
  TASK_SORTABLE_STYLE_ID,
  TASK_SORT_GROUP,
  TASK_ZONE_CLASS,
  sortableHighlightClasses
} from "../constants.js";
import {
  getContainerKey,
  getNextSubtaskOrder,
  getTaskAndDescendants,
  getTaskDepth,
  buildInheritedSubtaskUpdate,
  sortTasksByOrder
} from "../utils.js";
import { state } from "../state/page-state.js";
import { saveTask } from "../../data/db.js";
import { computeTaskReorderUpdates, computeTaskReorderUpdatesForMultiple } from "./tasks.js";
import { scheduleTaskVirtualizationUpdate } from "./task-virtualization.js";
const { taskList } = domRefs;
let multiDragMounted = false;
export function toggleZoneHighlight(zone, shouldHighlight) {
  if (!zone) {return;}
  sortableHighlightClasses.forEach((cls) =>
    zone.classList[shouldHighlight ? "add" : "remove"](cls)
  );
}

export function destroyTaskSortables() {
  state.sortableInstances.forEach((instance) => instance?.destroy?.());
  state.sortableInstances = [];
}

export function ensureSortableStyles() {
  if (document.getElementById(TASK_SORTABLE_STYLE_ID)) {return;}
  const style = document.createElement("style");
  style.id = TASK_SORTABLE_STYLE_ID;
  style.setAttribute("data-test-skedpal", "task-sortable-styles");
  style.textContent = `
.sortable-ghost { opacity: 0.6; }
.sortable-drag { opacity: 0.8; }
.sortable-selected {
  box-shadow: 0 0 0 1px rgba(var(--color-lime-400-rgb), 0.6);
  outline: 2px solid rgba(var(--color-lime-400-rgb), 0.35);
  outline-offset: 2px;
}
.sortable-chosen {
  box-shadow: 0 10px 25px rgba(74, 222, 128, 0.45);
  outline: 2px solid rgba(74, 222, 128, 0.7);
  outline-offset: 2px;
}
.task-drag-hidden { display: none !important; }
`;
  document.head.appendChild(style);
}

export function getDropBeforeId(element) {
  const nextTask = element?.nextElementSibling?.closest?.("[data-task-id]");
  return nextTask ? nextTask.dataset.taskId : null;
}
function findAdjacentTaskIdExcluding(card, direction, excludedIds) {
  if (!card) {return "";}
  let node = direction > 0 ? card.nextElementSibling : card.previousElementSibling;
  while (node) {
    const taskId = node.dataset?.taskId;
    if (taskId && !excludedIds.has(taskId)) {
      return taskId;
    }
    node = direction > 0 ? node.nextElementSibling : node.previousElementSibling;
  }
  return "";
}

export function findPreviousTaskId(card) {
  if (!card) {return "";}
  let prev = card.previousElementSibling;
  while (prev) {
    const prevId = prev.dataset?.taskId;
    if (prevId) {return prevId;}
    prev = prev.previousElementSibling;
  }
  return "";
}

function findTaskById(id) {
  if (!id) {return null;}
  return state.tasksCache.find((task) => task.id === id) || null;
}

function getMovedTaskIdsFromEvent(evt) {
  const items = Array.isArray(evt.items) && evt.items.length ? evt.items : [evt.item];
  return items
    .map((item) => item?.dataset?.taskId)
    .filter((taskId) => Boolean(taskId));
}

function getRootTaskIds(taskIds, tasks) {
  const selectedIds = new Set(taskIds.filter(Boolean));
  const byId = new Map((tasks || []).map((task) => [task.id, task]));
  return taskIds.filter((taskId) => {
    const task = byId.get(taskId);
    if (!task) {return false;}
    let parentId = task.subtaskParentId || "";
    while (parentId) {
      if (selectedIds.has(parentId)) {return false;}
      parentId = byId.get(parentId)?.subtaskParentId || "";
    }
    return true;
  });
}

function buildSortContext(evt) {
  const movedTaskId = evt.item?.dataset?.taskId;
  const targetZone = evt.to?.closest?.("[data-drop-section]");
  if (!movedTaskId || !targetZone) {return null;}
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) {return null;}
  const targetSection = (targetZone.dataset.dropSection || "").trim();
  const targetSubsection = (targetZone.dataset.dropSubsection || "").trim();
  const dropBeforeId = getDropBeforeId(evt.item);
  const prevTaskId = findPreviousTaskId(evt.item);
  return {
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId,
    prevTaskId
  };
}

function resolveParentId(task, movedSubtreeIds, targetKey) {
  if (!task) {return { found: false, parentId: null };}
  let candidateId = task.subtaskParentId || null;
  while (candidateId && movedSubtreeIds.has(candidateId)) {
    const ancestor = findTaskById(candidateId);
    candidateId = ancestor?.subtaskParentId || null;
  }
  if (!candidateId) {return { found: true, parentId: null };}
  const candidateTask = findTaskById(candidateId);
  if (!candidateTask) {return { found: true, parentId: null };}
  const candidateKey = getContainerKey(candidateTask.section, candidateTask.subsection);
  if (candidateKey !== targetKey) {return { found: true, parentId: null };}
  return { found: true, parentId: candidateId };
}

function getDesiredParentId(dropBeforeTask, prevTask, movedSubtreeIds, targetKey) {
  const parentFromDropBefore = resolveParentId(dropBeforeTask, movedSubtreeIds, targetKey);
  const parentFromPrev = resolveParentId(prevTask, movedSubtreeIds, targetKey);
  return parentFromDropBefore.found ? parentFromDropBefore.parentId : parentFromPrev.parentId;
}

function mergeParentUpdate(updates, movedTaskId, movedTask, desiredParentId, desiredParentTask) {
  const existingIndex = updates.findIndex((u) => u.id === movedTaskId);
  if (!movedTask || desiredParentId === movedTask.subtaskParentId) {
    return updates;
  }
  const base = existingIndex >= 0 ? updates[existingIndex] : movedTask;
  let updated = { ...base, subtaskParentId: desiredParentId };
  if (desiredParentTask) {
    updated = buildInheritedSubtaskUpdate(updated, desiredParentTask) || updated;
  }
  if (existingIndex >= 0) {
    updates[existingIndex] = updated;
  } else {
    updates.push(updated);
  }
  return updates;
}

function resolveDropTargets({
  evt,
  movedSubtreeIds,
  dropBeforeId,
  prevTaskId,
  isMultiDrag
}) {
  const adjustedDropBeforeId = isMultiDrag
    ? findAdjacentTaskIdExcluding(evt.item, 1, movedSubtreeIds) || null
    : dropBeforeId;
  const adjustedPrevTaskId = isMultiDrag
    ? findAdjacentTaskIdExcluding(evt.item, -1, movedSubtreeIds)
    : prevTaskId || "";
  const adjustedDropBeforeTask = adjustedDropBeforeId
    ? state.tasksCache.find((task) => task.id === adjustedDropBeforeId)
    : null;
  const adjustedPrevTask = adjustedPrevTaskId
    ? state.tasksCache.find((task) => task.id === adjustedPrevTaskId)
    : null;
  return {
    adjustedDropBeforeId,
    adjustedDropBeforeTask,
    adjustedPrevTask
  };
}

function computeReorderResult({
  effectiveRootIds,
  movedTaskId,
  targetSection,
  targetSubsection,
  dropBeforeId
}) {
  if (effectiveRootIds.length > 1) {
    return computeTaskReorderUpdatesForMultiple(
      state.tasksCache,
      effectiveRootIds,
      targetSection,
      targetSubsection,
      dropBeforeId
    );
  }
  return computeTaskReorderUpdates(
    state.tasksCache,
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId
  );
}

function applyParentUpdatesForRoots(updates, rootIds, parentId, parentTask) {
  let next = updates;
  rootIds.forEach((taskId) => {
    const movedTask = state.tasksCache.find((task) => task.id === taskId);
    next = mergeParentUpdate(next, taskId, movedTask, parentId, parentTask);
  });
  return next;
}

export async function handleTaskSortEnd(evt) {
  const context = buildSortContext(evt);
  if (!context) {return false;}
  const {
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId,
    prevTaskId
  } = context;
  const targetKey = getContainerKey(targetSection, targetSubsection);
  const movedTaskIds = getMovedTaskIdsFromEvent(evt);
  const movedRootIds = movedTaskIds.length
    ? getRootTaskIds(movedTaskIds, state.tasksCache)
    : [movedTaskId];
  const effectiveRootIds = movedRootIds.length ? movedRootIds : [movedTaskId];
  const movedSubtreeIds = new Set(
    effectiveRootIds
      .flatMap((taskId) => getTaskAndDescendants(taskId, state.tasksCache))
      .map((task) => task.id)
  );
  const { adjustedDropBeforeId, adjustedDropBeforeTask, adjustedPrevTask } = resolveDropTargets({
    evt,
    movedSubtreeIds,
    dropBeforeId,
    prevTaskId,
    isMultiDrag: effectiveRootIds.length > 1
  });
  const effectiveDesiredParentId = getDesiredParentId(
    adjustedDropBeforeTask,
    adjustedPrevTask,
    movedSubtreeIds,
    targetKey
  );
  const desiredParentTask = effectiveDesiredParentId
    ? state.tasksCache.find((task) => task.id === effectiveDesiredParentId)
    : null;
  const reorderResult = computeReorderResult({
    effectiveRootIds,
    movedTaskId,
    targetSection,
    targetSubsection,
    dropBeforeId: adjustedDropBeforeId
  });
  let updates = reorderResult.updates || [];
  if (effectiveDesiredParentId !== undefined) {
    updates = applyParentUpdatesForRoots(
      updates,
      effectiveRootIds,
      effectiveDesiredParentId,
      desiredParentTask
    );
  }
  const changed = updates.length > 0 || reorderResult.changed;
  if (!changed) {return false;}
  await Promise.all(updates.map((t) => saveTask(t)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
  return true;
}

export function setupTaskSortables() {
  destroyTaskSortables();
  ensureSortableStyles();
  if (!multiDragMounted) {
    Sortable.mount(new MultiDrag());
    multiDragMounted = true;
  }
  const zones = [...taskList.querySelectorAll(`.${TASK_ZONE_CLASS}`)];
  zones.forEach((zone) => {
    const sortable = new Sortable(zone, {
      group: { name: TASK_SORT_GROUP, pull: true, put: true },
      animation: 150,
      draggable: "[data-task-id]",
      handle: undefined,
      filter: `.${TASK_PLACEHOLDER_CLASS}, button, a, input, textarea, select, label`,
      multiDrag: true,
      selectedClass: "sortable-selected",
      multiDragKey: "Shift",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      swapThreshold: 0.65,
      fallbackOnBody: true,
      onStart: (event) => {
        toggleZoneHighlight(event.from, true);
        const taskId = event.item?.dataset?.taskId;
        state.draggingTaskId = taskId || null;
        scheduleTaskVirtualizationUpdate();
        if (!taskId) {return;}
        const hasChildren = state.tasksCache.some((task) => task.subtaskParentId === taskId);
        if (!hasChildren || state.collapsedTasks.has(taskId)) {return;}
        state.collapsedTasks.add(taskId);
        event.item.dataset.collapsedOnDrag = "1";
        const descendants = getTaskAndDescendants(taskId, state.tasksCache).slice(1);
        descendants.forEach((task) => {
          const node = taskList.querySelector(`[data-task-id="${task.id}"]`);
          node?.classList.add("task-drag-hidden");
        });
      },
      onEnd: (event) => {
        toggleZoneHighlight(event.from, false);
        toggleZoneHighlight(event.to, false);
        state.draggingTaskId = null;
        scheduleTaskVirtualizationUpdate();
        const collapsedOnDrag = event.item?.dataset?.collapsedOnDrag === "1";
        handleTaskSortEnd(event)
          .then(async (changed) => {
            if (collapsedOnDrag && !changed) {
              const { loadTasks } = await import("./tasks-actions.js");
              await loadTasks();
            }
          })
          .catch((error) => console.error("Task sort failed", error));
      }
    });
    state.sortableInstances.push(sortable);
  });
}

export async function indentTaskUnderPrevious(card) {
  if (!card) {return;}
  const childId = card.dataset.taskId;
  const childDepth = getTaskDepth(childId, state.tasksCache);
  const parentId = findIndentParentId(card, childDepth);
  if (!childId || !parentId) {return;}
  const childTask = state.tasksCache.find((t) => t.id === childId);
  const parentTask = state.tasksCache.find((t) => t.id === parentId);
  if (!childTask || !parentTask) {return;}
  const childDescendants = new Set(getTaskAndDescendants(childId, state.tasksCache).map((t) => t.id));
  if (childDescendants.has(parentTask.id)) {return;}
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
  const inheritedChild = buildInheritedSubtaskUpdate(updatedChild, parentTask) || updatedChild;
  await saveTask(inheritedChild);
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
}

export function findIndentParentId(card, childDepth) {
  let prev = card.previousElementSibling;
  while (prev) {
    const pid = prev.dataset?.taskId;
    if (pid) {
      const prevDepth = getTaskDepth(pid, state.tasksCache);
      if (prevDepth <= childDepth) {
        return pid;
      }
    }
    prev = prev.previousElementSibling;
  }
  return "";
}

export async function outdentTask(card) {
  const taskId = card?.dataset?.taskId || "";
  const context = getOutdentContextByTaskId(taskId, state.tasksCache);
  if (!context) {return;}
  const updates = buildOutdentUpdates(context, state.tasksCache);
  if (updates.length === 0) {return;}
  await Promise.all(updates.map((t) => saveTask(t)));
  const { loadTasks } = await import("./tasks-actions.js");
  await loadTasks();
}

export function getOutdentContextByTaskId(taskId, tasks) {
  if (!taskId) {return null;}
  const childTask = (tasks || []).find((t) => t.id === taskId);
  if (!childTask || !childTask.subtaskParentId) {return null;}
  const parentTask = (tasks || []).find((t) => t.id === childTask.subtaskParentId);
  if (!parentTask) {return null;}
  const subtree = getTaskAndDescendants(childTask.id, tasks);
  const descendantIds = new Set(subtree.filter((t) => t.id !== childTask.id).map((t) => t.id));
  return {
    childId: childTask.id,
    childTask,
    parentTask,
    descendantIds,
    oldSection: childTask.section || "",
    oldSubsection: childTask.subsection || ""
  };
}

export function buildOutdentUpdates(context, tasks) {
  const data = buildOutdentData(context, tasks);
  return collectOutdentUpdates(data);
}

function buildOutdentData(context, tasks) {
  const {
    childId,
    childTask,
    parentTask,
    descendantIds,
    oldSection,
    oldSubsection
  } = context;
  const newParentId = parentTask.subtaskParentId || null;
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const sourceKey = getContainerKey(oldSection, oldSubsection);
  const originalById = new Map((tasks || []).map((t) => [t.id, t]));
  const adjustedContainerTasks = buildAdjustedContainerTasks({
    sourceKey,
    childId,
    descendantIds,
    parentId: parentTask.id,
    section,
    subsection,
    tasks
  });
  const adoptedIds = new Set(
    adjustedContainerTasks.filter((t) => t.subtaskParentId === parentTask.id).map((t) => t.id)
  );
  const finalList = [
    ...adjustedContainerTasks,
    { ...childTask, section, subsection, subtaskParentId: newParentId }
  ];
  return {
    childId,
    parentId: parentTask.id,
    newParentId,
    descendantIds,
    adoptedIds,
    finalList,
    originalById
  };
}

function buildAdjustedContainerTasks({
  sourceKey,
  childId,
  descendantIds,
  parentId,
  section,
  subsection,
  tasks
}) {
  return sortTasksByOrder(
    (tasks || [])
      .filter((t) => getContainerKey(t.section, t.subsection) === sourceKey)
      .filter((t) => t.id !== childId)
      .map((t) =>
        descendantIds.has(t.id)
          ? { ...t, subtaskParentId: parentId, section, subsection }
          : t
      )
  );
}

function computeOutdentParentId(task, childId, newParentId, parentId, descendantIds, adoptedIds) {
  if (task.id === childId) {return newParentId;}
  if (descendantIds.has(task.id) || adoptedIds.has(task.id)) {return parentId;}
  return task.subtaskParentId;
}

function collectOutdentUpdates(data) {
  const updates = [];
  data.finalList.forEach((task, idx) => {
    const update = buildOutdentUpdate(data, task, idx);
    if (update) {
      updates.push(update);
    }
  });
  return updates;
}

function buildOutdentUpdate(data, task, idx) {
  const desiredOrder = idx + 1;
  const desiredSection = task.section || "";
  const desiredSubsection = task.subsection || "";
  const desiredParentId = computeOutdentParentId(
    task,
    data.childId,
    data.newParentId,
    data.parentId,
    data.descendantIds,
    data.adoptedIds
  );
  const original = data.originalById.get(task.id);
  if (!shouldUpdateOutdent(original, desiredOrder, desiredSection, desiredSubsection, desiredParentId)) {
    return null;
  }
  return {
    ...task,
    section: desiredSection,
    subsection: desiredSubsection,
    order: desiredOrder,
    subtaskParentId: desiredParentId
  };
}

function shouldUpdateOutdent(original, order, section, subsection, parentId) {
  if (!original) {return true;}
  if (original.order !== order) {return true;}
  if ((original.section || "") !== section) {return true;}
  if ((original.subsection || "") !== subsection) {return true;}
  return (original.subtaskParentId || "") !== (parentId || "");
}
