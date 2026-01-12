import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import { addDays, endOfDay } from "../../core/scheduler/date-utils.js";
import { TASK_REPEAT_NONE } from "../constants.js";
import { getLocalDateKey } from "../utils.js";

const UPCOMING_OCCURRENCE_LOOKAHEAD_DAYS = 365;

export function buildParentMap(tasks) {
  return tasks.reduce((map, task) => {
    if (task.subtaskParentId) {
      map.set(task.id, task.subtaskParentId);
    }
    return map;
  }, new Map());
}

export function buildTaskDepthGetter(parentById) {
  const depthMemo = new Map();
  const getTaskDepthById = (taskId) => {
    if (!taskId) {return 0;}
    if (depthMemo.has(taskId)) {return depthMemo.get(taskId);}
    const parentId = parentById.get(taskId);
    if (!parentId) {
      depthMemo.set(taskId, 0);
      return 0;
    }
    const depth = getTaskDepthById(parentId) + 1;
    depthMemo.set(taskId, depth);
    return depth;
  };
  return getTaskDepthById;
}

export function buildCollapsedAncestorChecker(parentById, collapsedTasks) {
  const collapsedAncestorMemo = new Map();
  const hasCollapsedAncestor = (taskId) => {
    if (!taskId) {return false;}
    if (collapsedAncestorMemo.has(taskId)) {return collapsedAncestorMemo.get(taskId);}
    const parentId = parentById.get(taskId);
    if (!parentId) {
      collapsedAncestorMemo.set(taskId, false);
      return false;
    }
    if (collapsedTasks.has(parentId)) {
      collapsedAncestorMemo.set(taskId, true);
      return true;
    }
    const result = hasCollapsedAncestor(parentId);
    collapsedAncestorMemo.set(taskId, result);
    return result;
  };
  return hasCollapsedAncestor;
}

export function buildChildrenByParent(tasks) {
  return tasks.reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!pid) {return map;}
    if (!map.has(pid)) {map.set(pid, []);}
    map.get(pid).push(task);
    return map;
  }, new Map());
}

export function buildDurationCalculator(childrenByParent) {
  const durationMemo = new Map();
  const computeTotalDuration = (task) => {
    if (!task?.id) {return 0;}
    if (durationMemo.has(task.id)) {return durationMemo.get(task.id);}
    const children = childrenByParent.get(task.id) || [];
    if (children.length === 0) {
      const own = Number(task.durationMin) || 0;
      durationMemo.set(task.id, own);
      return own;
    }
    const total = children.reduce((sum, child) => sum + computeTotalDuration(child), 0);
    durationMemo.set(task.id, total);
    return total;
  };
  return computeTotalDuration;
}

export function buildFirstOccurrenceOutOfRangeMap(tasks, settings) {
  const now = new Date();
  const horizonDays =
    Number(settings?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const horizonEnd = endOfDay(addDays(now, horizonDays));
  const outOfRangeById = new Map();
  tasks.forEach((task) => {
    if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return;}
    const occurrences = getUpcomingOccurrences(
      task,
      now,
      1,
      UPCOMING_OCCURRENCE_LOOKAHEAD_DAYS
    );
    if (!occurrences.length) {return;}
    if (occurrences[0].date > horizonEnd) {
      outOfRangeById.set(task.id, true);
    }
  });
  return outOfRangeById;
}

export function buildFirstOccurrenceUnscheduledMap(tasks, settings) {
  const now = new Date();
  const horizonDays =
    Number(settings?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const horizonEnd = endOfDay(addDays(now, horizonDays));
  const unscheduledById = new Map();
  tasks.forEach((task) => {
    if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return;}
    const occurrences = getUpcomingOccurrences(
      task,
      now,
      1,
      UPCOMING_OCCURRENCE_LOOKAHEAD_DAYS
    );
    if (!occurrences.length) {return;}
    const first = occurrences[0];
    if (first.date > horizonEnd) {return;}
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    let matches = instances.filter((instance) => instance.occurrenceId === first.occurrenceId);
    if (!matches.length) {
      const targetKey = getLocalDateKey(first.date);
      matches = instances.filter((instance) => getLocalDateKey(instance.start) === targetKey);
    }
    if (!matches.length) {
      unscheduledById.set(task.id, true);
    }
  });
  return unscheduledById;
}

function buildSubsectionSortButton({ subsectionId, sectionId, themeColors, icons }) {
  const sortSubBtn = document.createElement("button");
  sortSubBtn.type = "button";
  sortSubBtn.dataset.sortSubsectionPriority = subsectionId;
  sortSubBtn.dataset.parentSection = sectionId;
  sortSubBtn.className = "title-icon-btn";
  sortSubBtn.title = "Sort tasks by priority";
  sortSubBtn.innerHTML = icons.sortIconSvg;
  sortSubBtn.style.borderColor = themeColors.sky400;
  sortSubBtn.style.color = themeColors.sky400;
  sortSubBtn.setAttribute("data-test-skedpal", "subsection-sort-priority-btn");
  return sortSubBtn;
}

export function buildSubsectionActionButtons({
  sub,
  sectionId,
  isNoSection,
  themeColors,
  icons
}) {
  const sortSubBtn = buildSubsectionSortButton({
    subsectionId: sub.id,
    sectionId,
    themeColors,
    icons
  });
  const editSubBtn = document.createElement("button");
  editSubBtn.type = "button";
  editSubBtn.dataset.editSubsection = sub.id;
  editSubBtn.dataset.parentSection = sectionId;
  editSubBtn.className = "title-icon-btn";
  editSubBtn.title = "Edit subsection";
  editSubBtn.innerHTML = icons.editIconSvg;
  editSubBtn.style.borderColor = themeColors.green500;
  editSubBtn.style.color = themeColors.green500;
  editSubBtn.setAttribute("data-test-skedpal", "subsection-edit-btn");

  const zoomSubBtn = document.createElement("button");
  zoomSubBtn.type = "button";
  zoomSubBtn.dataset.zoomSubsection = sub.id;
  zoomSubBtn.dataset.zoomSection = sectionId;
  zoomSubBtn.className = "title-icon-btn";
  zoomSubBtn.title = "Zoom into subsection";
  zoomSubBtn.innerHTML = icons.zoomInIconSvg;
  zoomSubBtn.setAttribute("data-test-skedpal", "subsection-zoom-btn");

  const favoriteSubBtn = document.createElement("button");
  favoriteSubBtn.type = "button";
  favoriteSubBtn.dataset.favoriteSubsection = sub.id;
  favoriteSubBtn.dataset.parentSection = sectionId;
  favoriteSubBtn.className = `title-icon-btn${sub.favorite ? " favorite-active" : ""}`;
  favoriteSubBtn.title = sub.favorite ? "Unfavorite subsection" : "Favorite subsection";
  favoriteSubBtn.innerHTML = icons.favoriteIconSvg;
  favoriteSubBtn.setAttribute("data-test-skedpal", "subsection-favorite-btn");

  const removeSubBtn = document.createElement("button");
  removeSubBtn.type = "button";
  removeSubBtn.dataset.removeSubsection = sub.id;
  removeSubBtn.dataset.parentSection = sectionId;
  removeSubBtn.className = "title-icon-btn";
  removeSubBtn.title = "Remove subsection";
  removeSubBtn.innerHTML = icons.removeIconSvg;
  removeSubBtn.style.borderColor = themeColors.orange500;
  removeSubBtn.style.color = themeColors.orange500;
  removeSubBtn.setAttribute("data-test-skedpal", "subsection-remove-btn");

  const addSubTaskBtn = document.createElement("button");
  addSubTaskBtn.type = "button";
  addSubTaskBtn.dataset.addSection = isNoSection ? "" : sectionId;
  addSubTaskBtn.dataset.addSubsectionTarget = sub.id;
  addSubTaskBtn.className = "title-icon-btn";
  addSubTaskBtn.title = "Add task";
  addSubTaskBtn.innerHTML = icons.plusIconSvg;
  addSubTaskBtn.style.borderColor = themeColors.lime400;
  addSubTaskBtn.style.color = themeColors.lime400;
  addSubTaskBtn.setAttribute("data-test-skedpal", "subsection-add-task");

  const addChildSubBtn = document.createElement("button");
  addChildSubBtn.type = "button";
  addChildSubBtn.dataset.addChildSubsection = sub.id;
  addChildSubBtn.dataset.sectionId = isNoSection ? "" : sectionId;
  addChildSubBtn.className = "title-icon-btn";
  addChildSubBtn.title = "Add subsection";
  addChildSubBtn.innerHTML = icons.subtaskIconSvg;
  addChildSubBtn.style.borderColor = themeColors.lime400;
  addChildSubBtn.style.color = themeColors.lime400;
  addChildSubBtn.setAttribute("data-test-skedpal", "subsection-add-child");

  return {
    sortSubBtn,
    editSubBtn,
    zoomSubBtn,
    favoriteSubBtn,
    removeSubBtn,
    addSubTaskBtn,
    addChildSubBtn
  };
}

const dragHandleIconSvg = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M7 4.5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 4.5ZM7 10a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 10Zm-1.25 6.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM15.5 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM14.25 11.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm1.25 4a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"></path></svg>`;

export function buildDragHandleButton({ label, datasetKey, datasetValue, testId }) {
  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "title-icon-btn cursor-grab";
  dragHandle.dataset[datasetKey] = datasetValue;
  dragHandle.title = label;
  dragHandle.setAttribute("aria-label", label);
  dragHandle.innerHTML = dragHandleIconSvg;
  dragHandle.setAttribute("data-test-skedpal", testId);
  return dragHandle;
}

export function buildSectionActionButtons({ section, isCollapsed, themeColors, icons }) {
  const dragHandle = buildDragHandleButton({
    label: "Drag section",
    datasetKey: "sectionDragHandle",
    datasetValue: section.id,
    testId: "section-drag-handle"
  });
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.dataset.toggleSectionCollapse = section.id;
  collapseBtn.className = "title-icon-btn";
  collapseBtn.title = "Expand/collapse section";
  collapseBtn.innerHTML = isCollapsed ? icons.caretRightIconSvg : icons.caretDownIconSvg;
  collapseBtn.setAttribute("data-test-skedpal", "section-collapse-btn");
  const isDefaultSection =
    section.id === "section-work-default" || section.id === "section-personal-default";
  const editSectionBtn = document.createElement("button");
  editSectionBtn.type = "button";
  editSectionBtn.dataset.editSection = section.id;
  editSectionBtn.className = "title-icon-btn";
  editSectionBtn.title = "Edit section";
  editSectionBtn.innerHTML = icons.editIconSvg;
  editSectionBtn.style.borderColor = themeColors.green500;
  editSectionBtn.style.color = themeColors.green500;
  editSectionBtn.setAttribute("data-test-skedpal", "section-edit-btn");
  const zoomSectionBtn = document.createElement("button");
  zoomSectionBtn.type = "button";
  zoomSectionBtn.dataset.zoomSection = section.id;
  zoomSectionBtn.dataset.zoomSubsection = "";
  zoomSectionBtn.className = "title-icon-btn";
  zoomSectionBtn.title = "Zoom into section";
  zoomSectionBtn.innerHTML = icons.zoomInIconSvg;
  zoomSectionBtn.setAttribute("data-test-skedpal", "section-zoom-btn");
  const favoriteSectionBtn = document.createElement("button");
  favoriteSectionBtn.type = "button";
  favoriteSectionBtn.dataset.favoriteSection = section.id;
  favoriteSectionBtn.className = `title-icon-btn${section.favorite ? " favorite-active" : ""}`;
  favoriteSectionBtn.title = section.favorite ? "Unfavorite section" : "Favorite section";
  favoriteSectionBtn.innerHTML = icons.favoriteIconSvg;
  favoriteSectionBtn.setAttribute("data-test-skedpal", "section-favorite-btn");
  const removeSectionBtn = document.createElement("button");
  removeSectionBtn.type = "button";
  removeSectionBtn.dataset.removeSection = section.id;
  removeSectionBtn.className = "title-icon-btn";
  removeSectionBtn.title = "Remove section";
  removeSectionBtn.innerHTML = icons.removeIconSvg;
  removeSectionBtn.style.borderColor = themeColors.orange500;
  removeSectionBtn.style.color = themeColors.orange500;
  removeSectionBtn.setAttribute("data-test-skedpal", "section-remove-btn");
  if (isDefaultSection) {
    removeSectionBtn.disabled = true;
    removeSectionBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
  const addSubsectionToggle = document.createElement("button");
  addSubsectionToggle.type = "button";
  addSubsectionToggle.dataset.toggleSubsection = section.id;
  addSubsectionToggle.className = "title-icon-btn";
  addSubsectionToggle.title = "Add subsection";
  addSubsectionToggle.innerHTML = icons.subtaskIconSvg;
  addSubsectionToggle.style.borderColor = themeColors.lime400;
  addSubsectionToggle.style.color = themeColors.lime400;
  addSubsectionToggle.setAttribute("data-test-skedpal", "section-add-subsection-btn");
  return {
    addSubsectionToggle,
    collapseBtn,
    dragHandle,
    editSectionBtn,
    favoriteSectionBtn,
    removeSectionBtn,
    zoomSectionBtn
  };
}
