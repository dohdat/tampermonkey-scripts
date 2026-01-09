import { saveSettings, saveTask, deleteTask } from "../../data/db.js";
import { state } from "../state/page-state.js";
import { getTaskAndDescendants } from "../utils.js";
import { showUndoBanner } from "../notifications.js";
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

function parseTaskListClick(btn) {
  return {
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
    editId: btn.dataset.edit,
    deleteId: btn.dataset.delete,
    duplicateTaskId: btn.dataset.duplicateTask,
    addSubtaskId: btn.dataset.addSubtask,
    toggleTaskDetailsId: btn.dataset.toggleTaskDetails,
    toggleTaskCollapseId: btn.dataset.toggleTaskCollapse
  };
}

async function handleTaskComplete(completeTaskId) {
  const affected = getTaskAndDescendants(completeTaskId, state.tasksCache);
  const target = affected[0];
  if (!target) {return;}
  if (target.repeat && target.repeat.type !== "none" && !target.completed) {
    openRepeatCompleteModal(target);
    return;
  }
  const snapshots = affected.map((t) => JSON.parse(JSON.stringify(t)));
  const completed = !target.completed;
  const timestamp = completed ? new Date().toISOString() : null;
  const updates = snapshots.map((t) => {
    let updatedStatus = t.scheduleStatus || "unscheduled";
    if (completed && t.scheduleStatus !== "completed") {
      updatedStatus = "completed";
    } else if (!completed && t.scheduleStatus === "completed") {
      updatedStatus = "unscheduled";
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
      run: () => toggleSetEntry(state.expandedTaskDetails, action.toggleTaskDetailsId)
    },
    {
      when: action.toggleTaskCollapseId !== undefined,
      run: () => {
        toggleSetEntry(state.collapsedTasks, action.toggleTaskCollapseId);
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
      when: Boolean(action.viewCalendarTaskId),
      run: () => viewTaskOnCalendar(action.viewCalendarTaskId)
    },
    {
      when: Boolean(action.duplicateTaskId),
      run: () => duplicateTaskWithChildren(action.duplicateTaskId)
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

export async function handleTaskListClick(event, options = {}) {
  const btn = event.target.closest("button");
  if (!btn) {return;}
  const action = parseTaskListClick(btn);
  if (action.completeTaskId !== undefined) {
    await handleTaskComplete(action.completeTaskId);
    return;
  }
  if (handleZoomAction(action)) {return;}
  if (action.addChildSubsectionId !== undefined) {
    const sectionId = action.addChildSectionId || "";
    openSubsectionModal(sectionId, action.addChildSubsectionId);
    return;
  }
  if (action.submitChildSubsectionId !== undefined) {
    await handleChildSubsectionSubmit(btn, action.submitChildSubsectionId);
    return;
  }
  if (await handleSectionActions(action)) {return;}
  if (await handleSubsectionActions(action)) {return;}
  if (handleCollapseActions(btn, action)) {return;}
  await handleTaskActions(action, options);
}
