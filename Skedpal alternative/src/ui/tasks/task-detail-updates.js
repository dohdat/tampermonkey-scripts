import { saveTask } from "../../data/db.js";
import { TASK_STATUS_UNSCHEDULED } from "../constants.js";
import { getInheritedSubtaskFields, getTaskAndDescendants } from "../utils.js";
import { state } from "../state/page-state.js";

export async function updateTaskDetailField(task, updates) {
  if (!task) {return;}
  const updatedTask = {
    ...task,
    ...updates,
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
  await saveTask(updatedTask);
  const hasChildren = Array.isArray(state.tasksCache) &&
    state.tasksCache.some((entry) => entry?.subtaskParentId === task.id);
  if (hasChildren) {
    const descendants = getTaskAndDescendants(task.id, state.tasksCache).slice(1);
    if (descendants.length) {
      const inherited = getInheritedSubtaskFields(updatedTask);
      await Promise.all(
        descendants.map((child) =>
          saveTask({
            ...child,
            ...inherited,
            scheduleStatus: TASK_STATUS_UNSCHEDULED,
            scheduledStart: null,
            scheduledEnd: null,
            scheduledTimeMapId: null,
            scheduledInstances: []
          })
        )
      );
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("skedpal:tasks-updated"));
  }
}
