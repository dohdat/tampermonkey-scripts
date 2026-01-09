import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  SUBTASK_SCHEDULE_PARALLEL
} from "./constants.js";
import { normalizeSubtaskScheduleMode } from "./utils.js";
import { state } from "./state/page-state.js";

export function getSectionById(id) {
  return (state.settingsCache.sections || []).find((s) => s.id === id);
}

export function getSectionName(id) {
  if (!id) {return "";}
  const section = getSectionById(id);
  if (section?.name) {return section.name;}
  if (id === "section-work-default") {return "Work";}
  if (id === "section-personal-default") {return "Personal";}
  return "";
}

export function getSubsectionsFor(sectionId) {
  return ((state.settingsCache.subsections || {})[sectionId] || []).map((s) => {
    const template = {
      title: "",
      link: "",
      durationMin: DEFAULT_TASK_DURATION_MIN,
      minBlockMin: DEFAULT_TASK_MIN_BLOCK_MIN,
      priority: DEFAULT_TASK_PRIORITY,
      deadline: "",
      startFrom: "",
      repeat: { ...DEFAULT_TASK_REPEAT },
      timeMapIds: [],
      subtaskScheduleMode: SUBTASK_SCHEDULE_PARALLEL,
      ...(s.template || {})
    };
    return {
      favorite: false,
      parentId: "",
      ...s,
      template: {
        ...template,
        subtaskScheduleMode: normalizeSubtaskScheduleMode(template.subtaskScheduleMode)
      }
    };
  });
}
