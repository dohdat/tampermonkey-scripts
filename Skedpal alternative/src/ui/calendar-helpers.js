import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  INDEX_NOT_FOUND,
  TASK_STATUS_SCHEDULED
} from "./constants.js";
import { getLocalDateKey } from "./utils.js";

function buildCompletedOccurrenceSet(values) {
  const completed = new Set();
  (values || []).forEach((value) => {
    if (!value) {return;}
    if (typeof value === "string" && value.trim()) {
      completed.add(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {return;}
    completed.add(date.toISOString());
    const localKey = getLocalDateKey(date);
    if (localKey) {completed.add(localKey);}
  });
  return completed;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return d;
}

export function parseInstanceDates(instance) {
  if (!instance?.start || !instance?.end) {return null;}
  const start = new Date(instance.start);
  const end = new Date(instance.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
  return { start, end };
}

export function isCompletedOccurrence(start, completedOccurrences) {
  if (!completedOccurrences?.size) {return false;}
  const localKey = getLocalDateKey(start);
  if (localKey && completedOccurrences.has(localKey)) {return true;}
  const occurrenceIso = endOfDay(start).toISOString();
  return completedOccurrences.has(occurrenceIso);
}

export function buildScheduledEvent(task, instance, index, completedOccurrences) {
  const dates = parseInstanceDates(instance);
  if (!dates) {return null;}
  if (isCompletedOccurrence(dates.start, completedOccurrences)) {return null;}
  return {
    taskId: task.id,
    title: task.title || "Untitled task",
    link: task.link || "",
    priority: Number(task.priority) || 0,
    start: dates.start,
    end: dates.end,
    timeMapId: instance.timeMapId || "",
    occurrenceId: instance.occurrenceId || "",
    instanceIndex: index,
    source: "task"
  };
}

export function resolveInstanceIndex(instances, eventMeta) {
  if (eventMeta.occurrenceId) {
    return instances.findIndex((instance) => instance.occurrenceId === eventMeta.occurrenceId);
  }
  if (Number.isFinite(eventMeta.instanceIndex)) {
    return eventMeta.instanceIndex;
  }
  if (eventMeta.start instanceof Date && eventMeta.end instanceof Date) {
    const originalStart = eventMeta.start.getTime();
    const originalEnd = eventMeta.end.getTime();
    return instances.findIndex((instance) => {
      const dates = parseInstanceDates(instance);
      if (!dates) {return false;}
      return dates.start.getTime() === originalStart && dates.end.getTime() === originalEnd;
    });
  }
  return INDEX_NOT_FOUND;
}

export function buildScheduleBounds(instances) {
  const sorted = instances
    .map((instance) => ({
      ...instance,
      startDate: new Date(instance.start),
      endDate: new Date(instance.end)
    }))
    .filter(
      (instance) =>
        !Number.isNaN(instance.startDate.getTime()) &&
        !Number.isNaN(instance.endDate.getTime())
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (!sorted.length) {
    return { scheduledStart: null, scheduledEnd: null, scheduledTimeMapId: null };
  }
  return {
    scheduledStart: sorted[0]?.startDate?.toISOString() || null,
    scheduledEnd: sorted[sorted.length - 1]?.endDate?.toISOString() || null,
    scheduledTimeMapId: sorted[0]?.timeMapId || null
  };
}

export function getScheduledEvents(tasks) {
  const events = [];
  (tasks || []).forEach((task) => {
    if (task.scheduleStatus !== TASK_STATUS_SCHEDULED) {return;}
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    if (!instances.length) {return;}
    const completedOccurrences = buildCompletedOccurrenceSet(task.completedOccurrences);
    instances.forEach((instance, index) => {
      const event = buildScheduledEvent(task, instance, index, completedOccurrences);
      if (event) {
        events.push(event);
      }
    });
  });
  return events;
}

export function buildUpdatedTaskForDrag(task, eventMeta, newStart, newEnd) {
  if (!task || !eventMeta || !(newStart instanceof Date) || !(newEnd instanceof Date)) {
    return null;
  }
  const instances = Array.isArray(task.scheduledInstances)
    ? task.scheduledInstances.map((instance) => ({ ...instance }))
    : [];
  if (!instances.length) {return null;}
  const targetIndex = resolveInstanceIndex(instances, eventMeta);
  if (targetIndex < 0 || !instances[targetIndex]) {return null;}
  instances[targetIndex] = {
    ...instances[targetIndex],
    start: newStart.toISOString(),
    end: newEnd.toISOString()
  };
  const { scheduledStart, scheduledEnd, scheduledTimeMapId } = buildScheduleBounds(instances);
  return {
    ...task,
    scheduledInstances: instances,
    scheduledStart,
    scheduledEnd,
    scheduledTimeMapId,
    scheduleStatus: task.scheduleStatus || TASK_STATUS_SCHEDULED
  };
}

export function formatRescheduledMessage(startDate) {
  if (!(startDate instanceof Date)) {return "Event rescheduled.";}
  const dateLabel = startDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
  const timeLabel = startDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  return `Event rescheduled to ${dateLabel}, ${timeLabel}`;
}

export function parseEventMetaDates(dataset) {
  const startIso = safeDatasetString(dataset.eventStart);
  const endIso = safeDatasetString(dataset.eventEnd);
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: null, end: null };
  }
  return { start, end };
}

function safeDatasetString(value) {
  return typeof value === "string" ? value : "";
}

export function buildEventMetaFromDataset(dataset) {
  if (!dataset) {return null;}
  const source = safeDatasetString(dataset.eventSource);
  if (source && source !== "task") {return null;}
  const taskId = safeDatasetString(dataset.eventTaskId);
  if (!taskId) {return null;}
  const { start, end } = parseEventMetaDates(dataset);
  if (!start || !end) {return null;}
  const instanceIndex = Number(dataset.eventInstanceIndex);
  const resolvedInstanceIndex = Number.isFinite(instanceIndex) ? instanceIndex : null;
  return {
    taskId,
    occurrenceId: safeDatasetString(dataset.eventOccurrenceId),
    instanceIndex: resolvedInstanceIndex,
    timeMapId: safeDatasetString(dataset.eventTimeMapId),
    start,
    end
  };
}
