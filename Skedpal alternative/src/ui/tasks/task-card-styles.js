import { themeColors } from "../theme.js";
import { state } from "../state/page-state.js";
import { isExternalCalendarTimeMapId } from "../utils.js";

const PRIORITY_COLORS = {
  1: themeColors.slate400,
  2: themeColors.blue400,
  3: themeColors.sky400,
  4: themeColors.amber400,
  5: themeColors.orange500
};

function resolveTaskBackgroundMode() {
  const mode = state.settingsCache?.taskBackgroundMode || "priority";
  if (mode === "priority" || mode === "timemap" || mode === "none") {
    return mode;
  }
  return "priority";
}

function resolvePriorityBackgroundColor(priorityValue) {
  const color = PRIORITY_COLORS[priorityValue];
  return color ? `${color}1a` : "";
}

export function applyTaskBackgroundStyle(taskCard, task, timeMapById) {
  if (!taskCard || !task) {return;}
  const backgroundMode = resolveTaskBackgroundMode();
  if (backgroundMode === "timemap") {
    const timeMapIds = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
    const primaryTimeMapId = timeMapIds.find((id) => !isExternalCalendarTimeMapId(id));
    const color = timeMapById.get(primaryTimeMapId)?.color;
    if (color) {
      taskCard.style.backgroundColor = `${color}1a`;
    }
    return;
  }
  if (backgroundMode === "priority") {
    const priorityValue = Number(task.priority) || 0;
    const color = resolvePriorityBackgroundColor(priorityValue);
    if (color) {
      taskCard.style.backgroundColor = color;
    }
    return;
  }
  if (backgroundMode === "none") {
    taskCard.style.backgroundColor = `${themeColors.slate400}1a`;
  }
}
