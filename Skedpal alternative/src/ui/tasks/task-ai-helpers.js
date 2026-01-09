import { SUBTASK_ORDER_OFFSET } from "../constants.js";
import {
  getInheritedSubtaskFields,
  getNextSubtaskOrder,
  normalizeSubtaskScheduleMode,
  uuid
} from "../utils.js";

function resolveParentDefaults(parentTask) {
  const safeTask = parentTask || {};
  const {
    durationMin = 30,
    minBlockMin = 30,
    priority = 3,
    deadline = null,
    startFrom = null,
    timeMapIds = [],
    repeat = { type: "none" },
    subtaskScheduleMode
  } = safeTask;
  return {
    durationMin: Number(durationMin),
    minBlockMin: Number(minBlockMin),
    priority: Number(priority),
    deadline,
    startFrom,
    timeMapIds: Array.isArray(timeMapIds) ? [...timeMapIds] : [],
    repeat,
    subtaskScheduleMode
  };
}

function buildAiTaskPayload({
  title,
  parentTask,
  parentId,
  order
}) {
  const inherited = getInheritedSubtaskFields(parentTask);
  const defaults = resolveParentDefaults(parentTask);
  return {
    id: uuid(),
    title,
    durationMin: defaults.durationMin,
    minBlockMin: defaults.minBlockMin,
    priority: defaults.priority,
    deadline: defaults.deadline,
    startFrom: defaults.startFrom,
    subtaskParentId: parentId || null,
    link: "",
    timeMapIds: defaults.timeMapIds,
    section: inherited.section || "",
    subsection: inherited.subsection || "",
    order,
    subtaskScheduleMode: normalizeSubtaskScheduleMode(defaults.subtaskScheduleMode),
    repeat: defaults.repeat,
    completed: false,
    completedAt: null,
    completedOccurrences: [],
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
}

export function buildTasksFromAiList(list = [], parentTask, tasksCache = []) {
  if (!parentTask) {return [];}
  const tasks = Array.isArray(list) ? list : [];
  if (!tasks.length) {return [];}
  const working = [...tasksCache];
  const output = [];
  const section = parentTask.section || "";
  const subsection = parentTask.subsection || "";
  const slotStep = SUBTASK_ORDER_OFFSET * 10;
  const childStep = SUBTASK_ORDER_OFFSET / 10;
  const baseOrder = getNextSubtaskOrder(parentTask, section, subsection, working);
  let parentIndex = 0;

  tasks.forEach((entry) => {
    const title = typeof entry?.title === "string" ? entry.title.trim() : "";
    if (!title) {return;}
    const order = baseOrder + slotStep * parentIndex;
    const task = buildAiTaskPayload({
      title,
      parentTask,
      parentId: parentTask.id,
      order
    });
    output.push(task);
    working.push(task);
    parentIndex += 1;
    const subtasks = Array.isArray(entry.subtasks) ? entry.subtasks : [];
    let childIndex = 0;
    subtasks.forEach((subtaskTitle) => {
      const cleaned = typeof subtaskTitle === "string" ? subtaskTitle.trim() : "";
      if (!cleaned) {return;}
      const childOrder = order + childStep * (childIndex + 1);
      const child = buildAiTaskPayload({
        title: cleaned,
        parentTask,
        parentId: task.id,
        order: childOrder
      });
      output.push(child);
      working.push(child);
      childIndex += 1;
    });
  });
  return output;
}
