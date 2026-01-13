import { saveSettings, saveTask, deleteTask } from "../../data/db.js";
import {
  TASK_REPEAT_NONE,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_UNSCHEDULED
} from "../constants.js";
import { state } from "../state/page-state.js";
import { getTaskAndDescendants } from "../utils.js";
import { showUndoBanner } from "../notifications.js";
import { computeSubsectionPrioritySortUpdates } from "./tasks.js";
import {
  openSubsectionModal,
  handleAddSubsection,
  handleToggleSectionFavorite,
  handleToggleSubsectionFavorite,
  handleRenameSection,
  handleRemoveSection,
  handleRemoveSubsection
} from "../sections.js";
import { setZoomFilter, switchView } from "../navigation.js";
import {
  openRepeatCompleteModal,
  loadTasks,
  renderTimeMapsAndTasks,
  startTaskInSection,
  startSubtaskFromTask,
  openTaskEditById,
  duplicateTaskWithChildren,
  viewTaskOnCalendar
} from "./tasks-actions.js";
import { openTaskReminderModal, dismissOverdueTaskReminders } from "./task-reminders.js";
import { handleAddTaskRowClick } from "./task-add-row.js";
import { computeSingleExpandedCollapsedSet } from "./task-collapse-utils.js";
import { openBulkEditBanner } from "./task-bulk-edit.js";
export { handleTaskTitleClick, handleTaskTitleDoubleClick } from "./task-inline-edit.js";

function runTaskDetailCleanup(taskId) {
  if (!taskId) {return;}
  const cleanup = state.taskDetailCleanup.get(taskId);
  if (typeof cleanup === "function") {cleanup();}
  state.taskDetailCleanup.delete(taskId);
}

function isInteractiveTarget(target) {
  if (!(target instanceof HTMLElement)) {return false;}
  if (target.isContentEditable) {return true;}
  return Boolean(target.closest("button, a, input, textarea, select"));
}

function getZoomFilterForTaskCard(card) {
  const taskId = card?.dataset?.taskId || "";
  if (!taskId) {return null;}
  return {
    type: "task",
    taskId,
    sectionId: card.dataset.sectionId || "",
    subsectionId: card.dataset.subsectionId || ""
  };
}

function shouldIgnoreContainerZoom(target) {
  if (!(target instanceof HTMLElement)) {return true;}
  if (target.closest?.('[data-test-skedpal="task-title"]')) {return true;}
  return isInteractiveTarget(target);
}

function tryZoomTaskContainer(target) {
  const taskCard = target.closest?.('[data-test-skedpal="task-card"]');
  if (!taskCard) {return false;}
  const filter = getZoomFilterForTaskCard(taskCard);
  if (filter) {setZoomFilter(filter);}
  return true;
}

function tryZoomSubsectionContainer(target) {
  const subsectionCard = target.closest?.("[data-subsection-card]");
  if (!subsectionCard) {return false;}
  const subsectionId = subsectionCard.dataset.subsectionCard || "";
  if (!subsectionId) {return true;}
  const sectionId =
    subsectionCard.closest?.("[data-section-card]")?.dataset?.sectionCard || "";
  setZoomFilter({ type: "subsection", sectionId, subsectionId });
  return true;
}

function tryZoomSectionContainer(target) {
  const sectionCard = target.closest?.("[data-section-card]");
  if (!sectionCard) {return false;}
  const sectionId = sectionCard.dataset.sectionCard ?? "";
  setZoomFilter({ type: "section", sectionId });
  return true;
}

export function handleTaskContainerDoubleClick(event) {
  const target = event.target;
  if (shouldIgnoreContainerZoom(target)) {return;}
  if (tryZoomTaskContainer(target)) {return;}
  if (tryZoomSubsectionContainer(target)) {return;}
  tryZoomSectionContainer(target);
}

function collapseTaskDetails(taskId) {
  if (!taskId) {return;}
  if (!state.expandedTaskDetails.has(taskId)) {return;}
  runTaskDetailCleanup(taskId);
  state.expandedTaskDetails.delete(taskId);
}

function collapseOtherTaskDetails(taskId) {
  Array.from(state.expandedTaskDetails).forEach((id) => {
    if (id !== taskId) {
      collapseTaskDetails(id);
    }
  });
}

function parseTaskListClick(btn) {
  return {
    taskMenuToggleId: btn.dataset.taskMenuToggle,
    completeTaskId: btn.dataset.completeTask,
    addSection: btn.dataset.addSection,
    addSubsectionFor: btn.dataset.addSubsection,
    toggleSubsectionFor: btn.dataset.toggleSubsection,
    addSubsectionTaskTarget: btn.dataset.addSubsectionTarget,
    zoomSectionId: btn.dataset.zoomSection,
    zoomSubsectionId: btn.dataset.zoomSubsection,
    zoomTaskId: btn.dataset.zoomTask,
    hasZoomSubAttr: btn.getAttribute("data-zoom-subsection") !== null,
    viewCalendarTaskId: btn.dataset.viewCalendarTask,
    addChildSubsectionId: btn.dataset.addChildSubsection,
    addChildSectionId: btn.dataset.sectionId,
    submitChildSubsectionId: btn.dataset.submitChildSubsection,
    editSectionId: btn.dataset.editSection,
    favoriteSectionId: btn.dataset.favoriteSection,
    removeSectionId: btn.dataset.removeSection,
    editSubsectionId: btn.dataset.editSubsection,
    favoriteSubsectionId: btn.dataset.favoriteSubsection,
    removeSubsectionId: btn.dataset.removeSubsection,
    parentSectionId: btn.dataset.parentSection,
    sortSubsectionPriorityId: btn.dataset.sortSubsectionPriority,
    editId: btn.dataset.edit,
    bulkEditId: btn.dataset.bulkEdit,
    deleteId: btn.dataset.delete,
    duplicateTaskId: btn.dataset.duplicateTask,
    remindTaskId: btn.dataset.remindTask,
    dismissReminderTaskId: btn.dataset.dismissReminder,
    addSubtaskId: btn.dataset.addSubtask,
    toggleTaskDetailsId: btn.dataset.toggleTaskDetails,
    toggleTaskCollapseId: btn.dataset.toggleTaskCollapse,
    addTaskRow: btn.dataset.addTaskRow
  };
}

function closeTaskActionMenus(exceptTaskId = "") {
  const menus = document.querySelectorAll?.("[data-task-menu]") || [];
  menus.forEach((menu) => {
    if (exceptTaskId && menu.dataset.taskMenu === exceptTaskId) {return;}
    menu.classList.add("hidden");
    menu.closest?.(".task-actions-wrap")?.classList.remove("task-actions-menu-open");
  });
  if (!exceptTaskId || state.taskMenuOpenId !== exceptTaskId) {
    cleanupTaskMenuListeners();
  }
}

function cleanupTaskMenuListeners() {
  if (typeof state.taskMenuCleanup !== "function") {return;}
  state.taskMenuCleanup();
  state.taskMenuCleanup = null;
  state.taskMenuOpenId = "";
}

function createTaskMenuHandlers(taskId, options = {}) {
  const scopedMenu = options.menu || null;
  const scopedToggle = options.toggleBtn || null;
  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {return false;}
    if (target.isContentEditable) {return true;}
    const tag = target.tagName?.toLowerCase?.();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function getMenuActionButton(menu, key) {
    const keyMap = {
      e: "task-menu-edit",
      b: "task-menu-bulk-edit",
      d: "task-menu-duplicate",
      r: "task-menu-remind",
      a: "task-menu-add-subtask",
      x: "task-menu-delete"
    };
    const testAttr = keyMap[key];
    if (!testAttr) {return null;}
    return menu.querySelector?.(`[data-test-skedpal="${testAttr}"]`) || null;
  }

  function onTaskMenuPointerDown(event) {
    const menu = scopedMenu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
    const toggleBtn =
      scopedToggle || document.querySelector?.(`[data-task-menu-toggle="${taskId}"]`);
    const target = event.target;
    if (!menu || !toggleBtn) {
      closeTaskActionMenus();
      return;
    }
    if (menu.contains(target) || toggleBtn.contains(target)) {return;}
    closeTaskActionMenus();
  }

  function onTaskMenuKeyDown(event) {
    if (isEditableTarget(event.target)) {return;}
    const key = event.key.toLowerCase();
    const menu = scopedMenu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
    if (!menu || menu.classList.contains("hidden")) {return;}
    if (key === "escape") {
      closeTaskActionMenus();
      return;
    }
    const actionButton = getMenuActionButton(menu, key);
    if (!actionButton) {return;}
    event.preventDefault();
    actionButton.click();
  }

  return { onTaskMenuPointerDown, onTaskMenuKeyDown };
}

function setupTaskMenuListeners(taskId, options = {}) {
  if (!taskId) {return;}
  cleanupTaskMenuListeners();
  const { onTaskMenuPointerDown, onTaskMenuKeyDown } = createTaskMenuHandlers(taskId, options);
  document.addEventListener("pointerdown", onTaskMenuPointerDown, true);
  document.addEventListener("keydown", onTaskMenuKeyDown);
  state.taskMenuCleanup = () => {
    document.removeEventListener("pointerdown", onTaskMenuPointerDown, true);
    document.removeEventListener("keydown", onTaskMenuKeyDown);
  };
  state.taskMenuOpenId = taskId;
}

function toggleTaskActionMenu(taskId, options = {}) {
  if (!taskId) {return;}
  const menu = options.menu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
  if (!menu) {return;}
  const actionsWrap = menu.closest?.(".task-actions-wrap");
  const willShow = menu.classList.contains("hidden");
  closeTaskActionMenus(taskId);
  menu.classList.toggle("hidden", !willShow);
  actionsWrap?.classList.toggle("task-actions-menu-open", willShow);
  if (willShow) {
    setupTaskMenuListeners(taskId, options);
  } else {
    cleanupTaskMenuListeners();
  }
}

async function handleTaskComplete(completeTaskId) {
  const affected = getTaskAndDescendants(completeTaskId, state.tasksCache);
  const target = affected[0];
  if (!target) {return;}
  if (target.repeat && target.repeat.type !== TASK_REPEAT_NONE && !target.completed) {
    openRepeatCompleteModal(target);
    return;
  }
  const snapshots = affected.map((t) => JSON.parse(JSON.stringify(t)));
  const completed = !target.completed;
  const timestamp = completed ? new Date().toISOString() : null;
  const updates = snapshots.map((t) => {
    let updatedStatus = t.scheduleStatus || TASK_STATUS_UNSCHEDULED;
    if (completed && t.scheduleStatus !== TASK_STATUS_COMPLETED) {
      updatedStatus = TASK_STATUS_COMPLETED;
    } else if (!completed && t.scheduleStatus === TASK_STATUS_COMPLETED) {
      updatedStatus = TASK_STATUS_UNSCHEDULED;
    }
    return {
      ...t,
      completed,
      completedAt: timestamp,
      scheduleStatus: updatedStatus
    };
  });
  await Promise.all(updates.map((t) => saveTask(t)));
  await loadTasks();
  const name = target.title || "Untitled task";
  const extra = updates.length > 1 ? ` and ${updates.length - 1} subtasks` : "";
  showUndoBanner(
    `${completed ? "Completed" : "Marked incomplete"} "${name}"${extra}.`,
    async () => {
      await Promise.all(snapshots.map((snap) => saveTask(snap)));
      await loadTasks();
    }
  );
}
function handleZoomAction(action) {
  const handlers = [
    {
      when: action.zoomTaskId !== undefined,
      run: () =>
        setZoomFilter({
          type: "task",
          taskId: action.zoomTaskId,
          sectionId: action.zoomSectionId || "",
          subsectionId: action.zoomSubsectionId || ""
        })
    },
    {
      when: action.hasZoomSubAttr && action.zoomSubsectionId !== "",
      run: () =>
        setZoomFilter({
          type: "subsection",
          sectionId: action.zoomSectionId || "",
          subsectionId: action.zoomSubsectionId || ""
        })
    },
    {
      when: action.zoomSectionId !== undefined && action.hasZoomSubAttr,
      run: () => setZoomFilter({ type: "section", sectionId: action.zoomSectionId || "" })
    }
  ];
  const match = handlers.find((handler) => handler.when);
  if (!match) {return false;}
  switchView("tasks");
  match.run();
  return true;
}

async function handleChildSubsectionSubmit(btn, submitChildSubsectionId) {
  const card = btn.closest(`[data-subsection-card="${submitChildSubsectionId}"]`);
  const form = card?.querySelector(`[data-child-subsection-form="${submitChildSubsectionId}"]`);
  const input = card?.querySelector(`[data-child-subsection-input="${submitChildSubsectionId}"]`);
  const value = input?.value?.trim();
  if (!value) {return;}
  const parentSection = btn.dataset.parentSection || "";
  await handleAddSubsection(parentSection, value, submitChildSubsectionId);
  input.value = "";
  form?.classList.add("hidden");
}

async function handleSectionActions(action) {
  if (action.favoriteSectionId !== undefined) {
    await handleToggleSectionFavorite(action.favoriteSectionId);
    return true;
  }
  if (action.editSectionId !== undefined) {
    await handleRenameSection(action.editSectionId);
    return true;
  }
  if (action.removeSectionId !== undefined) {
    await handleRemoveSection(action.removeSectionId);
    return true;
  }
  return false;
}

async function handleSubsectionActions(action) {
  if (action.favoriteSubsectionId !== undefined) {
    await handleToggleSubsectionFavorite(action.parentSectionId, action.favoriteSubsectionId);
    return true;
  }
  if (action.editSubsectionId !== undefined) {
    openSubsectionModal(action.parentSectionId || "", "", action.editSubsectionId);
    return true;
  }
  if (action.removeSubsectionId !== undefined) {
    await handleRemoveSubsection(action.parentSectionId, action.removeSubsectionId);
    return true;
  }
  return false;
}

async function sortSubsectionTasksByPriority(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return false;}
  const { updates, changed } = computeSubsectionPrioritySortUpdates(
    state.tasksCache,
    sectionId,
    subsectionId
  );
  if (!changed) {return false;}
  await Promise.all(updates.map((task) => saveTask(task)));
  await loadTasks();
  return true;
}

async function handleSubsectionSortAction(action) {
  if (action.sortSubsectionPriorityId === undefined) {return false;}
  return sortSubsectionTasksByPriority(
    action.parentSectionId || "",
    action.sortSubsectionPriorityId || ""
  );
}

function handleCollapseActions(btn, action) {
  const toggleSetEntry = (set, value) => {
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
  };
  const persistCollapsedState = (key, set) => {
    state.settingsCache = {
      ...state.settingsCache,
      [key]: Array.from(set)
    };
    const promise = saveSettings(state.settingsCache);
    state.pendingSettingsSave = promise;
    promise.finally(() => {
      if (state.pendingSettingsSave === promise) {
        state.pendingSettingsSave = null;
      }
    });
  };
  const handlers = [
    {
      when: btn.dataset.toggleSectionCollapse !== undefined,
      run: () => {
        toggleSetEntry(state.collapsedSections, btn.dataset.toggleSectionCollapse || "");
        persistCollapsedState("collapsedSections", state.collapsedSections);
      }
    },
    {
      when: btn.dataset.toggleSubsectionCollapse !== undefined,
      run: () => {
        toggleSetEntry(state.collapsedSubsections, btn.dataset.toggleSubsectionCollapse || "");
        persistCollapsedState("collapsedSubsections", state.collapsedSubsections);
      }
    },
    {
      when: action.toggleTaskDetailsId !== undefined,
      run: () => {
        const taskId = action.toggleTaskDetailsId;
        if (!taskId) {return;}
        if (state.expandedTaskDetails.has(taskId)) {
          collapseTaskDetails(taskId);
          return;
        }
        collapseOtherTaskDetails(taskId);
        state.expandedTaskDetails.add(taskId);
      }
    },
    {
      when: action.toggleTaskCollapseId !== undefined,
      run: () => {
        state.collapsedTasks = computeSingleExpandedCollapsedSet(
          state.collapsedTasks,
          action.toggleTaskCollapseId,
          state.tasksCache
        );
        persistCollapsedState("collapsedTasks", state.collapsedTasks);
      }
    }
  ];
  const match = handlers.find((handler) => handler.when);
  if (!match) {return false;}
  match.run();
  renderTimeMapsAndTasks(state.tasksTimeMapsCache);
  return true;
}
async function handleTaskActions(action, options = {}) {
  const handlers = [
    {
      when: action.addSection !== undefined,
      run: () => startTaskInSection(action.addSection, action.addSubsectionTaskTarget || "")
    },
    {
      when: action.toggleSubsectionFor !== undefined || action.addSubsectionFor !== undefined,
      run: () => openSubsectionModal(action.toggleSubsectionFor || action.addSubsectionFor, "")
    },
    {
      when: Boolean(action.editId),
      run: () => openTaskEditById(action.editId, { switchView: options.switchView !== false })
    },
    {
      when: Boolean(action.bulkEditId),
      run: () => openBulkEditBanner(action.bulkEditId)
    },
    {
      when: Boolean(action.viewCalendarTaskId),
      run: () => viewTaskOnCalendar(action.viewCalendarTaskId)
    },
    {
      when: Boolean(action.duplicateTaskId),
      run: () => duplicateTaskWithChildren(action.duplicateTaskId)
    },
    {
      when: Boolean(action.remindTaskId),
      run: () => openTaskReminderModal(action.remindTaskId, { event: options.event })
    },
    {
      when: Boolean(action.dismissReminderTaskId),
      run: () => dismissOverdueTaskReminders(action.dismissReminderTaskId)
    },
    {
      when: action.addSubtaskId !== undefined,
      run: () => handleAddSubtaskAction(action.addSubtaskId, options)
    },
    {
      when: Boolean(action.deleteId),
      run: () => deleteTaskWithUndo(action.deleteId)
    }
  ];
  const match = handlers.find((handler) => handler.when);
  if (!match) {return false;}
  await match.run();
  return true;
}

function handleAddSubtaskAction(taskId, options = {}) {
  const parentTask = state.tasksCache.find((t) => t.id === taskId);
  if (parentTask) {
    startSubtaskFromTask(parentTask, { switchView: options.switchView !== false });
  }
}

async function deleteTaskWithUndo(taskId) {
  const affected = getTaskAndDescendants(taskId, state.tasksCache);
  const snapshot = affected.map((t) => JSON.parse(JSON.stringify(t)));
  await Promise.all(affected.map((t) => deleteTask(t.id)));
  await loadTasks();
  if (!snapshot.length) {return;}
  const name = snapshot[0].title || "Untitled task";
  const extra = snapshot.length > 1 ? ` and ${snapshot.length - 1} subtasks` : "";
  showUndoBanner(`Deleted "${name}"${extra}.`, async () => {
    await Promise.all(snapshot.map((t) => saveTask(t)));
    await loadTasks();
  });
}

export async function deleteTasksWithUndo(taskIds = []) {
  const rootIds = [...new Set(taskIds.filter(Boolean))];
  if (!rootIds.length) {return false;}
  const affectedById = new Map();
  rootIds.forEach((taskId) => {
    getTaskAndDescendants(taskId, state.tasksCache).forEach((task) => {
      affectedById.set(task.id, task);
    });
  });
  const snapshot = [...affectedById.values()].map((t) => JSON.parse(JSON.stringify(t)));
  if (!snapshot.length) {return false;}
  await Promise.all(snapshot.map((task) => deleteTask(task.id)));
  await loadTasks();
  const headline =
    rootIds.length === 1
      ? `Deleted "${snapshot[0]?.title || "Untitled task"}".`
      : `Deleted ${rootIds.length} tasks.`;
  showUndoBanner(headline, async () => {
    await Promise.all(snapshot.map((task) => saveTask(task)));
    await loadTasks();
  });
  return true;
}

function handleMenuToggleAction(action) {
  if (action.taskMenuToggleId === undefined) {return false;} toggleTaskActionMenu(action.taskMenuToggleId);
  return true;
}
function handleTaskMenuToggle(action, btn) {
  if (action.taskMenuToggleId === undefined) {return false;}
  if (handleMenuToggleActionForButton(btn)) {return true;}
  return handleMenuToggleAction(action);
}

function handleMenuToggleActionForButton(btn) {
  const taskId = btn?.dataset?.taskMenuToggle || "";
  if (!taskId) {return false;}
  const card = btn.closest?.('[data-test-skedpal="task-card"]');
  const scopedMenu = card?.querySelector?.(`[data-task-menu="${taskId}"]`) || null;
  if (scopedMenu) {
    toggleTaskActionMenu(taskId, { menu: scopedMenu, toggleBtn: btn });
    return true;
  }
  toggleTaskActionMenu(taskId);
  return true;
}
async function handleCompleteAction(action) {
  if (action.completeTaskId === undefined) {return false;}
  await handleTaskComplete(action.completeTaskId);
  closeTaskActionMenus();
  return true;
}

function handleZoomActionWithClose(action) {
  const handled = handleZoomAction(action);
  if (handled) {
    closeTaskActionMenus();
  }
  return handled;
}

async function handleChildSubsectionActions(action, btn) {
  if (action.addChildSubsectionId !== undefined) {
    const sectionId = action.addChildSectionId || "";
    openSubsectionModal(sectionId, action.addChildSubsectionId);
    return true;
  }
  if (action.submitChildSubsectionId !== undefined) {
    await handleChildSubsectionSubmit(btn, action.submitChildSubsectionId);
    return true;
  }
  return false;
}
async function handleSectionSubsectionActions(action) {
  if (await handleSectionActions(action)) {return true;}
  if (await handleSubsectionActions(action)) {return true;}
  return false;
}

async function handleTaskActionsWithClose(action, options = {}) {
  const handled = await handleTaskActions(action, options);
  if (handled) {
    closeTaskActionMenus();
  }
  return handled;
}
export async function handleTaskListClick(event, options = {}) {
  const btn = event.target.closest("button");
  if (!btn) {return;}
  const action = parseTaskListClick(btn);
  const handlers = [
    () => handleAddTaskRowClick(btn),
    () => handleTaskMenuToggle(action, btn),
    () => handleCompleteAction(action),
    () => handleZoomActionWithClose(action),
    () => handleChildSubsectionActions(action, btn),
    () => handleSectionSubsectionActions(action),
    () => handleSubsectionSortAction(action),
    () => handleCollapseActions(btn, action),
    () => handleTaskActionsWithClose(action, { ...options, event })
  ];
  for (const handler of handlers) {
    const handled = await handler();
    if (handled) {return;}
  }
}
