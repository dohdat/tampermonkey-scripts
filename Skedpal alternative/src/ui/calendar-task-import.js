import {
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  GOOGLE_CALENDAR_TASK_ID_PREFIX,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_UNSCHEDULED
} from "./constants.js";
import { getNextOrder, normalizeSubtaskScheduleMode } from "./utils.js";

function getCalendarTaskSettingsMap(settings) {
  const source = settings?.googleCalendarTaskSettings;
  return source && typeof source === "object" ? source : {};
}

export function getCalendarTaskSettings(settings, calendarId) {
  if (!calendarId) {
    return { treatAsTasks: false, sectionId: "", subsectionId: "" };
  }
  const map = getCalendarTaskSettingsMap(settings);
  const entry = map[calendarId];
  if (!entry || typeof entry !== "object") {
    return { treatAsTasks: false, sectionId: "", subsectionId: "" };
  }
  return {
    treatAsTasks: Boolean(entry.treatAsTasks),
    sectionId: entry.sectionId || "",
    subsectionId: entry.subsectionId || ""
  };
}

export function getCalendarTaskCalendarIds(settings) {
  const ids = new Set();
  const map = getCalendarTaskSettingsMap(settings);
  Object.entries(map).forEach(([calendarId, entry]) => {
    if (calendarId && entry?.treatAsTasks) {
      ids.add(calendarId);
    }
  });
  return ids;
}

export function buildGoogleCalendarTaskId(calendarId, eventId) {
  if (!calendarId || !eventId) {return "";}
  return `${GOOGLE_CALENDAR_TASK_ID_PREFIX}${calendarId}:${eventId}`;
}

function resolveSubsectionTemplate(settings, sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return null;}
  const list = settings?.subsections?.[sectionId] || [];
  const match = list.find((sub) => sub.id === subsectionId);
  return match?.template || null;
}

function resolveTemplateTimeMapIds(settings, template) {
  if (Array.isArray(template?.timeMapIds) && template.timeMapIds.length) {
    return [...template.timeMapIds];
  }
  const defaultId = settings?.defaultTimeMapId;
  return defaultId ? [defaultId] : [];
}

function resolveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveScheduleFields(existingTask) {
  if (existingTask?.completed) {
    return {
      scheduleStatus: existingTask.scheduleStatus || TASK_STATUS_COMPLETED,
      scheduledStart: existingTask.scheduledStart || null,
      scheduledEnd: existingTask.scheduledEnd || null,
      scheduledTimeMapId: existingTask.scheduledTimeMapId || null,
      scheduledInstances: Array.isArray(existingTask.scheduledInstances)
        ? existingTask.scheduledInstances
        : []
    };
  }
  return {
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  };
}

function buildCalendarTaskDefaults(settings, sectionId, subsectionId) {
  const template = resolveSubsectionTemplate(settings, sectionId, subsectionId);
  return {
    durationMin: resolveNumber(template?.durationMin, null),
    priority: resolveNumber(template?.priority, DEFAULT_TASK_PRIORITY),
    minBlockMin: resolveNumber(template?.minBlockMin, null),
    timeMapIds: resolveTemplateTimeMapIds(settings, template),
    repeat: template?.repeat ? { ...template.repeat } : { ...DEFAULT_TASK_REPEAT },
    subtaskScheduleMode: normalizeSubtaskScheduleMode(
      template?.subtaskScheduleMode
    )
  };
}

function resolveEffectiveSection(existingTask, sectionId, subsectionId) {
  const fallbackSection = sectionId || "";
  const fallbackSubsection = fallbackSection ? subsectionId || "" : "";
  const effectiveSection = existingTask?.section || fallbackSection;
  const effectiveSubsection = effectiveSection
    ? existingTask?.subsection || fallbackSubsection
    : "";
  return { effectiveSection, effectiveSubsection };
}

function resolveExistingTimeMapIds(existingTask, defaults) {
  if (Array.isArray(existingTask?.timeMapIds) && existingTask.timeMapIds.length) {
    return [...existingTask.timeMapIds];
  }
  return defaults.timeMapIds;
}

function resolvePriority(existingTask, defaults) {
  return resolveNumber(existingTask?.priority, defaults.priority);
}

function resolveRepeat(existingTask, defaults) {
  return existingTask?.repeat ? { ...existingTask.repeat } : defaults.repeat;
}

function resolveSubtaskScheduleMode(existingTask, defaults) {
  return normalizeSubtaskScheduleMode(
    existingTask?.subtaskScheduleMode || defaults.subtaskScheduleMode
  );
}

function resolveCalendarTaskTitle(existingTask, eventTitle) {
  const resolvedEventTitle = eventTitle || "Calendar task";
  if (!existingTask) {
    return { title: resolvedEventTitle, externalTitle: resolvedEventTitle };
  }
  const hasStoredExternalTitle = typeof existingTask.externalTitle === "string";
  const isOverride = hasStoredExternalTitle
    ? existingTask.title !== existingTask.externalTitle
    : existingTask.title !== resolvedEventTitle;
  return {
    title: isOverride ? existingTask.title || resolvedEventTitle : resolvedEventTitle,
    externalTitle: resolvedEventTitle
  };
}

function isValidCalendarEvent(event) {
  return Boolean(event?.id && event?.calendarId && event?.start && event?.end);
}

function resolveReminders(existingTask) {
  return Array.isArray(existingTask?.reminders) ? existingTask.reminders : [];
}

function resolveCompletedOccurrences(existingTask) {
  return Array.isArray(existingTask?.completedOccurrences)
    ? existingTask.completedOccurrences
    : [];
}

function resolveDurationFromDefaults(existingTask, defaults) {
  return existingTask?.durationMin ?? defaults.durationMin ?? null;
}

function resolveMinBlockFromDefaults(existingTask, defaults) {
  return existingTask?.minBlockMin ?? defaults.minBlockMin ?? null;
}

export function buildCalendarTaskPayload({
  event,
  settings,
  sectionId,
  subsectionId,
  existingTask = null,
  order
} = {}) {
  if (!isValidCalendarEvent(event)) {return null;}
  const taskId = buildGoogleCalendarTaskId(event.calendarId, event.id);
  if (!taskId) {return null;}

  const { effectiveSection, effectiveSubsection } = resolveEffectiveSection(
    existingTask,
    sectionId,
    subsectionId
  );

  const defaults = buildCalendarTaskDefaults(settings, effectiveSection, effectiveSubsection);
  const durationMin = resolveDurationFromDefaults(existingTask, defaults);
  const minBlockMin = resolveMinBlockFromDefaults(existingTask, defaults);
  const timeMapIds = resolveExistingTimeMapIds(existingTask, defaults);
  const priority = resolvePriority(existingTask, defaults);
  const repeat = resolveRepeat(existingTask, defaults);
  const subtaskScheduleMode = resolveSubtaskScheduleMode(existingTask, defaults);
  const schedule = resolveScheduleFields(existingTask);
  const { title, externalTitle } = resolveCalendarTaskTitle(existingTask, event.title);

  return {
    id: taskId,
    title,
    externalTitle,
    durationMin,
    minBlockMin,
    priority,
    deadline: null,
    startFrom: null,
    link: "",
    timeMapIds,
    section: effectiveSection,
    subsection: effectiveSubsection,
    order: existingTask?.order ?? order ?? 0,
    subtaskParentId: existingTask?.subtaskParentId || null,
    subtaskScheduleMode,
    repeat,
    reminders: resolveReminders(existingTask),
    completed: Boolean(existingTask?.completed),
    completedAt: existingTask?.completedAt || null,
    completedOccurrences: resolveCompletedOccurrences(existingTask),
    externalSource: "google-calendar",
    externalCalendarId: event.calendarId,
    externalEventId: event.id,
    ...schedule
  };
}

function normalizeTimeMapIdList(value) {
  return Array.isArray(value) ? value : [];
}

function hasCalendarTaskChanged(existingTask, nextTask) {
  if (!existingTask || !nextTask) {return true;}
  const fields = [
    "title",
    "externalTitle",
    "durationMin",
    "minBlockMin",
    "priority",
    "deadline",
    "startFrom",
    "link",
    "section",
    "subsection"
  ];
  if (fields.some((field) => existingTask[field] !== nextTask[field])) {
    return true;
  }
  const existingTimeMaps = normalizeTimeMapIdList(existingTask.timeMapIds).join(",");
  const nextTimeMaps = normalizeTimeMapIdList(nextTask.timeMapIds).join(",");
  return existingTimeMaps !== nextTimeMaps;
}

function resolveTaskOrder(existingTask, taskSettings, tasksSnapshot) {
  const section = existingTask?.section || taskSettings.sectionId || "";
  const subsection = existingTask?.subsection || taskSettings.subsectionId || "";
  return existingTask?.order ?? getNextOrder(section, subsection, tasksSnapshot);
}

function buildCalendarTaskUpdateForEvent(event, settings, tasksSnapshot, tasksById) {
  const calendarId = event?.calendarId || "";
  if (!calendarId) {return null;}
  const taskSettings = getCalendarTaskSettings(settings, calendarId);
  if (!taskSettings.treatAsTasks) {return null;}
  const existingTask = tasksById.get(buildGoogleCalendarTaskId(calendarId, event.id));
  const order = resolveTaskOrder(existingTask, taskSettings, tasksSnapshot);
  const payload = buildCalendarTaskPayload({
    event,
    settings,
    sectionId: taskSettings.sectionId || "",
    subsectionId: taskSettings.subsectionId || "",
    existingTask,
    order
  });
  if (!payload) {return null;}
  return { payload, existingTask, calendarId };
}

export function buildCalendarTaskUpdates({
  events = [],
  settings = {},
  tasks = []
} = {}) {
  const tasksToSave = [];
  const treatedCalendarIds = new Set();
  const tasksById = new Map((tasks || []).map((task) => [task.id, task]));
  let tasksSnapshot = Array.isArray(tasks) ? [...tasks] : [];

  (events || []).forEach((event) => {
    const update = buildCalendarTaskUpdateForEvent(
      event,
      settings,
      tasksSnapshot,
      tasksById
    );
    if (!update) {return;}
    treatedCalendarIds.add(update.calendarId);
    if (!update.existingTask) {
      tasksSnapshot = [...tasksSnapshot, update.payload];
      tasksById.set(update.payload.id, update.payload);
      tasksToSave.push(update.payload);
      return;
    }
    if (hasCalendarTaskChanged(update.existingTask, update.payload)) {
      tasksToSave.push({ ...update.existingTask, ...update.payload });
    }
  });

  return { tasksToSave, treatedCalendarIds };
}
