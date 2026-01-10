import { TASK_STATUS_SCHEDULED } from "../constants.js";
import { state } from "../state/page-state.js";
import { focusCalendarEvent, renderCalendar } from "../calendar.js";
import { switchView } from "../navigation.js";

function resolveFirstScheduledDate(task) {
  if (!task) {return null;}
  if (task.scheduledStart) {
    const start = new Date(task.scheduledStart);
    return Number.isNaN(start.getTime()) ? null : start;
  }
  const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
  if (!instances.length) {return null;}
  const starts = instances
    .map((instance) => new Date(instance.start))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!starts.length) {return null;}
  return new Date(Math.min(...starts.map((date) => date.getTime())));
}

export async function viewTaskOnCalendar(taskId) {
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task || task.scheduleStatus !== TASK_STATUS_SCHEDULED) {return false;}
  const targetDate = resolveFirstScheduledDate(task);
  if (!targetDate) {return false;}
  switchView("calendar", { calendarAnchorDate: targetDate, focusCalendar: false });
  renderCalendar(state.tasksCache);
  return focusCalendarEvent(taskId, { behavior: "smooth" });
}
