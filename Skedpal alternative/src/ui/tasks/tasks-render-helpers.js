import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../../data/db.js";
import { getUpcomingOccurrences } from "../../core/scheduler.js";
import { addDays, endOfDay } from "../../core/scheduler/date-utils.js";
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
    if (!task?.repeat || task.repeat.type === "none") {return;}
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
    if (!task?.repeat || task.repeat.type === "none") {return;}
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

export function buildSubsectionActionButtons({
  sub,
  sectionId,
  isNoSection,
  themeColors,
  icons
}) {
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
  addSubTaskBtn.className =
    "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
  addSubTaskBtn.textContent = "Add task";
  addSubTaskBtn.setAttribute("data-test-skedpal", "subsection-add-task");

  const addChildSubBtn = document.createElement("button");
  addChildSubBtn.type = "button";
  addChildSubBtn.dataset.addChildSubsection = sub.id;
  addChildSubBtn.dataset.sectionId = isNoSection ? "" : sectionId;
  addChildSubBtn.className =
    "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
  addChildSubBtn.textContent = "Add subsection";
  addChildSubBtn.setAttribute("data-test-skedpal", "subsection-add-child");

  return {
    editSubBtn,
    zoomSubBtn,
    favoriteSubBtn,
    removeSubBtn,
    addSubTaskBtn,
    addChildSubBtn
  };
}
