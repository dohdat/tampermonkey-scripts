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
      durationMin: 30,
      minBlockMin: 30,
      priority: 3,
      deadline: "",
      startFrom: "",
      repeat: { type: "none" },
      timeMapIds: [],
      subtaskScheduleMode: "parallel",
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
