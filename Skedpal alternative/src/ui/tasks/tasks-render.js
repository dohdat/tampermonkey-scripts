import {
  TASK_PLACEHOLDER_CLASS,
  TASK_ZONE_CLASS,
  caretDownIconSvg,
  caretRightIconSvg,
  editIconSvg,
  favoriteIconSvg,
  zoomInIconSvg,
  plusIconSvg,
  subtaskIconSvg,
  removeIconSvg,
  domRefs
} from "../constants.js";
import { renderTaskCard } from "./task-card.js";
import {
  sortTasksByOrder,
  normalizeTimeMap,
  getSubsectionDescendantIds,
  renderInBatches
} from "../utils.js";
import { state } from "../state/page-state.js";
import { getSubsectionsFor, getSectionName } from "../sections-data.js";
import { destroyTaskSortables, setupTaskSortables } from "./tasks-sortable.js";
import { themeColors } from "../theme.js";
import {
  buildParentMap,
  buildTaskDepthGetter,
  buildCollapsedAncestorChecker,
  buildChildrenByParent,
  buildDurationCalculator,
  buildFirstOccurrenceOutOfRangeMap,
  buildFirstOccurrenceUnscheduledMap,
  buildSubsectionActionButtons
} from "./tasks-render-helpers.js";
const { taskList } = domRefs;
let taskRenderToken = 0;

function buildZoomTaskIds(baseTasks) {
  if (state.zoomFilter?.type !== "task") {
    return null;
  }
  const ids = new Set([state.zoomFilter.taskId]);
  const stack = [state.zoomFilter.taskId];
  const childrenByParent = baseTasks.reduce((map, task) => {
    if (!task.subtaskParentId) {return map;}
    if (!map.has(task.subtaskParentId)) {map.set(task.subtaskParentId, []);}
    map.get(task.subtaskParentId).push(task.id);
    return map;
  }, new Map());
  while (stack.length) {
    const current = stack.pop();
    const children = childrenByParent.get(current) || [];
    children.forEach((childId) => {
      if (ids.has(childId)) {return;}
      ids.add(childId);
      stack.push(childId);
    });
  }
  return ids;
}

function filterTasksByZoom(baseTasks, hasCollapsedAncestor) {
  const visible = baseTasks.filter((t) => !hasCollapsedAncestor(t.id));
  if (state.zoomFilter?.type === "section") {
    return visible.filter((t) => (t.section || "") === (state.zoomFilter.sectionId || ""));
  }
  if (state.zoomFilter?.type === "subsection") {
    const sectionId = state.zoomFilter.sectionId || "";
    const subsectionId = state.zoomFilter.subsectionId || "";
    const subs = state.settingsCache.subsections?.[sectionId] || [];
    const allowedSubsections = getSubsectionDescendantIds(subs, subsectionId);
    if (allowedSubsections.size === 0) {
      return visible.filter(
        (t) => (t.section || "") === sectionId && (t.subsection || "") === subsectionId
      );
    }
    return visible.filter(
      (t) =>
        (t.section || "") === sectionId &&
        (t.subsection || "") &&
        allowedSubsections.has(t.subsection || "")
    );
  }
  if (state.zoomFilter?.type === "task") {
    const zoomTaskIds = buildZoomTaskIds(baseTasks);
    return visible.filter((t) => zoomTaskIds?.has(t.id));
  }
  return visible;
}

function getSubsectionName(sectionId, subsectionId) {
  const subs = getSubsectionsFor(sectionId);
  return subs.find((s) => s.id === subsectionId)?.name || "";
}

function buildTaskCardContext(baseTasks, timeMapById, computeTotalDuration, getTaskDepthById) {
  return {
    tasks: baseTasks,
    timeMapById,
    collapsedTasks: state.collapsedTasks,
    expandedTaskDetails: state.expandedTaskDetails,
    computeTotalDuration,
    getTaskDepthById,
    firstOccurrenceOutOfRangeByTaskId: buildFirstOccurrenceOutOfRangeMap(
      baseTasks,
      state.settingsCache
    ),
    firstOccurrenceUnscheduledByTaskId: buildFirstOccurrenceUnscheduledMap(
      baseTasks,
      state.settingsCache
    ),
    getSectionName,
    getSubsectionName
  };
}

function renderTaskCards(container, tasks, context, options = {}) {
  const sorted = sortTasksByOrder(tasks);
  if (!sorted.length) {return;}
  const { renderToken, batchSize = 40 } = options;
  const shouldCancel = Number.isFinite(renderToken)
    ? () => renderToken !== taskRenderToken
    : null;
  if (sorted.length <= batchSize) {
    sorted.forEach((task) => {
      container.appendChild(renderTaskCard(task, context));
    });
    return;
  }
  renderInBatches({
    items: sorted,
    batchSize,
    shouldCancel,
    renderBatch: (batch) => {
      const fragment = document.createDocumentFragment();
      batch.forEach((task) => fragment.appendChild(renderTaskCard(task, context)));
      container.appendChild(fragment);
    }
  });
}

function renderZoomTasks(filteredTasks, context, renderToken) {
  const zoomWrap = document.createElement("div");
  zoomWrap.className = "space-y-2";
  zoomWrap.setAttribute("data-test-skedpal", "task-zoom-list");
  renderTaskCards(zoomWrap, filteredTasks, context, { renderToken, batchSize: 30 });
  taskList.appendChild(zoomWrap);
}

function buildSectionsList(sections, filteredTasks) {
  const seenSectionIds = new Set(sections.map((s) => s.id));
  const missingSections = [];
  filteredTasks.forEach((t) => {
    if (t.section && !seenSectionIds.has(t.section)) {
      seenSectionIds.add(t.section);
      missingSections.push({ id: t.section, name: "Untitled section", favorite: false });
    }
  });
  const hasUnsectioned = filteredTasks.some((t) => !t.section);
  const relevantSectionIds = new Set(
    filteredTasks.map((t) => (t.section === undefined ? "" : t.section || ""))
  );
  if (state.zoomFilter?.type === "section") {relevantSectionIds.add(state.zoomFilter.sectionId || "");}
  if (state.zoomFilter?.type === "subsection") {relevantSectionIds.add(state.zoomFilter.sectionId || "");}
  if (state.zoomFilter?.type === "task") {relevantSectionIds.add(state.zoomFilter.sectionId || "");}
  return [
    ...sections,
    ...missingSections,
    ...(hasUnsectioned || sections.length === 0 ? [{ id: "", name: "No section" }] : [])
  ].filter((s) => (state.zoomFilter ? relevantSectionIds.has(s.id || "") : true));
}

function buildSectionHeader(section, options) {
  const { isNoSection, isCollapsed } = options;
  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-2";
  const title = document.createElement("div");
  title.className =
    "title-hover-group flex items-center gap-2 text-base font-semibold text-slate-100";
  const titleText = document.createElement("span");
  titleText.textContent = getSectionName(section.id) || section.name || "Untitled section";
  title.appendChild(titleText);
  if (isNoSection) {
    header.appendChild(title);
    return header;
  }
  const titleActions = document.createElement("div");
  titleActions.className = "title-actions";
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.dataset.toggleSectionCollapse = section.id;
  collapseBtn.className = "title-icon-btn";
  collapseBtn.title = "Expand/collapse section";
  collapseBtn.innerHTML = isCollapsed ? caretRightIconSvg : caretDownIconSvg;
  const isDefaultSection =
    section.id === "section-work-default" || section.id === "section-personal-default";
  const editSectionBtn = document.createElement("button");
  editSectionBtn.type = "button";
  editSectionBtn.dataset.editSection = section.id;
  editSectionBtn.className = "title-icon-btn";
  editSectionBtn.title = "Edit section";
  editSectionBtn.innerHTML = editIconSvg;
  editSectionBtn.style.borderColor = themeColors.green500;
  editSectionBtn.style.color = themeColors.green500;
  const zoomSectionBtn = document.createElement("button");
  zoomSectionBtn.type = "button";
  zoomSectionBtn.dataset.zoomSection = section.id;
  zoomSectionBtn.dataset.zoomSubsection = "";
  zoomSectionBtn.className = "title-icon-btn";
  zoomSectionBtn.title = "Zoom into section";
  zoomSectionBtn.innerHTML = zoomInIconSvg;
  const favoriteSectionBtn = document.createElement("button");
  favoriteSectionBtn.type = "button";
  favoriteSectionBtn.dataset.favoriteSection = section.id;
  favoriteSectionBtn.className = `title-icon-btn${section.favorite ? " favorite-active" : ""}`;
  favoriteSectionBtn.title = section.favorite ? "Unfavorite section" : "Favorite section";
  favoriteSectionBtn.innerHTML = favoriteIconSvg;
  const removeSectionBtn = document.createElement("button");
  removeSectionBtn.type = "button";
  removeSectionBtn.dataset.removeSection = section.id;
  removeSectionBtn.className = "title-icon-btn";
  removeSectionBtn.title = "Remove section";
  removeSectionBtn.innerHTML = removeIconSvg;
  removeSectionBtn.style.borderColor = themeColors.orange500;
  removeSectionBtn.style.color = themeColors.orange500;
  if (isDefaultSection) {
    removeSectionBtn.disabled = true;
    removeSectionBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
  const addSubsectionToggle = document.createElement("button");
  addSubsectionToggle.type = "button";
  addSubsectionToggle.dataset.toggleSubsection = section.id;
  addSubsectionToggle.className = "title-icon-btn";
  addSubsectionToggle.title = "Add subsection";
  addSubsectionToggle.innerHTML = subtaskIconSvg;
  addSubsectionToggle.style.borderColor = themeColors.lime400;
  addSubsectionToggle.style.color = themeColors.lime400;
  addSubsectionToggle.setAttribute("data-test-skedpal", "section-add-subsection-btn");
  titleActions.appendChild(collapseBtn);
  titleActions.appendChild(favoriteSectionBtn);
  titleActions.appendChild(editSectionBtn);
  titleActions.appendChild(zoomSectionBtn);
  titleActions.appendChild(addSubsectionToggle);
  titleActions.appendChild(removeSectionBtn);
  title.appendChild(titleActions);
  header.appendChild(title);
  return header;
}

function buildSectionSubsectionInput(sectionId) {
  const subsectionInputWrap = document.createElement("div");
  subsectionInputWrap.className = "flex flex-col gap-2 md:flex-row md:items-center";
  subsectionInputWrap.style.display = "none";
  subsectionInputWrap.dataset.subsectionForm = sectionId;
  subsectionInputWrap.innerHTML = `
        <input data-subsection-input="${sectionId}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${sectionId}" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
      `;
  return subsectionInputWrap;
}

function buildSubsections(section, sectionTasks) {
  const isNoSection = !section.id;
  const subsectionMap = state.settingsCache.subsections || {};
  const subsections = !isNoSection
    ? [...(subsectionMap[section.id] || [])].map((s) => ({ favorite: false, parentId: "", ...s }))
    : [];
  const taskSubsections = Array.from(new Set(sectionTasks.map((t) => t.subsection).filter(Boolean)));
  taskSubsections.forEach((subId) => {
    if (subsections.find((s) => s.id === subId)) {return;}
    if (subId) {
      subsections.push({
        id: subId,
        name: getSubsectionName(section.id, subId) || "Unnamed subsection",
        favorite: false
      });
    }
  });
  return { subsections, taskSubsections };
}

function filterSubsectionsForZoom(subsections, taskSubsections, sectionId) {
  if (state.zoomFilter?.type !== "task" && state.zoomFilter?.type !== "subsection") {
    return subsections;
  }
  const subsectionsById = new Map(subsections.map((s) => [s.id, s]));
  const allowedSubsections = new Set();
  const markWithAncestors = (subsectionId) => {
    let current = subsectionsById.get(subsectionId);
    while (current) {
      if (allowedSubsections.has(current.id)) {break;}
      allowedSubsections.add(current.id);
      const parentId = current.parentId || "";
      current = parentId ? subsectionsById.get(parentId) : null;
    }
  };
  if (state.zoomFilter?.type === "task") {
    taskSubsections.filter(Boolean).forEach((id) => markWithAncestors(id));
  }
  if (state.zoomFilter?.type === "subsection" && state.zoomFilter.sectionId === sectionId) {
    const targetId = state.zoomFilter.subsectionId || "";
    const descendants = getSubsectionDescendantIds(subsections, targetId);
    descendants.forEach((id) => allowedSubsections.add(id));
  }
  if (allowedSubsections.size === 0) {
    return subsections;
  }
  return subsections.filter((s) => allowedSubsections.has(s.id));
}

function buildUngroupedZone(context, options, renderToken) {
  const ungroupedZone = document.createElement("div");
  ungroupedZone.dataset.dropSection = options.dropSection;
  ungroupedZone.dataset.dropSubsection = options.dropSubsection;
  ungroupedZone.className =
    "space-y-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-3 py-3";
  ungroupedZone.classList.add(TASK_ZONE_CLASS);
  renderTaskCards(ungroupedZone, options.ungroupedTasks, context, { renderToken, batchSize: 30 });
  return ungroupedZone;
}

function buildSubsectionHeader(sub, section, isNoSection) {
  const subHeader = document.createElement("div");
  subHeader.className = "flex items-center justify-between text-base font-semibold text-slate-200";
  subHeader.setAttribute("data-test-skedpal", "subsection-header");
  const subTitle = document.createElement("div");
  subTitle.className = "title-hover-group flex items-center gap-2";
  subTitle.setAttribute("data-test-skedpal", "subsection-title");
  const subTitleText = document.createElement("span");
  subTitleText.textContent = sub.name;
  subTitleText.setAttribute("data-test-skedpal", "subsection-title-text");
  const subTitleActions = document.createElement("div");
  subTitleActions.className = "title-actions";
  subTitleActions.setAttribute("data-test-skedpal", "subsection-title-actions");
  const collapseSubBtn = document.createElement("button");
  collapseSubBtn.type = "button";
  collapseSubBtn.dataset.toggleSubsectionCollapse = sub.id;
  collapseSubBtn.dataset.parentSection = section.id;
  collapseSubBtn.className = "title-icon-btn";
  collapseSubBtn.setAttribute("data-test-skedpal", "subsection-collapse-btn");
  const subCollapsed = state.collapsedSubsections.has(sub.id);
  collapseSubBtn.title = "Expand/collapse subsection";
  collapseSubBtn.innerHTML = subCollapsed ? caretRightIconSvg : caretDownIconSvg;
  const {
    editSubBtn,
    zoomSubBtn,
    favoriteSubBtn,
    removeSubBtn,
    addSubTaskBtn,
    addChildSubBtn
  } = buildSubsectionActionButtons({
    sub,
    sectionId: section.id,
    isNoSection,
    themeColors,
    icons: {
      editIconSvg,
      zoomInIconSvg,
      favoriteIconSvg,
      removeIconSvg,
      plusIconSvg,
      subtaskIconSvg
    }
  });
  subTitle.appendChild(collapseSubBtn);
  subTitleActions.appendChild(favoriteSubBtn);
  subTitleActions.appendChild(zoomSubBtn);
  subTitleActions.appendChild(addChildSubBtn);
  subTitleActions.appendChild(addSubTaskBtn);
  subTitleActions.appendChild(editSubBtn);
  subTitleActions.appendChild(removeSubBtn);
  subTitle.appendChild(subTitleText);
  subTitle.appendChild(subTitleActions);
  subHeader.appendChild(subTitle);
  return { subHeader, subCollapsed };
}

function buildChildSubsectionInput(sub, sectionId, isNoSection) {
  const childSubsectionInputWrap = document.createElement("div");
  childSubsectionInputWrap.className =
    "hidden flex flex-col gap-2 md:flex-row md:items-center";
  childSubsectionInputWrap.dataset.childSubsectionForm = sub.id;
  childSubsectionInputWrap.innerHTML = `
        <input data-child-subsection-input="${sub.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-submit-child-subsection="${sub.id}" data-parent-section="${
          isNoSection ? "" : sectionId
        }" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add</button>
      `;
  return childSubsectionInputWrap;
}

function buildSubsectionZone(
  sub,
  sectionId,
  isNoSection,
  sectionTasks,
  context,
  suppressPlaceholders,
  renderToken
) {
  const subZone = document.createElement("div");
  subZone.dataset.dropSection = isNoSection ? "" : sectionId;
  subZone.dataset.dropSubsection = sub.id;
  subZone.className =
    "space-y-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-2 py-2";
  subZone.classList.add(TASK_ZONE_CLASS);
  const subTasks = sortTasksByOrder(sectionTasks.filter((t) => t.subsection === sub.id));
  if (subTasks.length === 0 && !suppressPlaceholders) {
    const empty = document.createElement("div");
    empty.className = `text-xs text-slate-500 ${TASK_PLACEHOLDER_CLASS}`;
    empty.textContent = "Drag tasks here or add new.";
    subZone.appendChild(empty);
  } else {
    renderTaskCards(subZone, subTasks, context, { renderToken, batchSize: 30 });
  }
  return subZone;
}

function renderSubsection(sub, section, sectionTasks, context, options) {
  const { isNoSection, suppressPlaceholders, buildChildren, renderToken } = options;
  const subWrap = document.createElement("div");
  subWrap.className =
    "space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 pl-4 md:pl-6";
  subWrap.dataset.subsectionCard = sub.id;
  const { subHeader, subCollapsed } = buildSubsectionHeader(sub, section, isNoSection);
  subWrap.appendChild(subHeader);
  const subBody = document.createElement("div");
  subBody.dataset.subsectionBody = sub.id;
  subBody.style.display = subCollapsed ? "none" : "";
  subBody.appendChild(buildChildSubsectionInput(sub, section.id, isNoSection));
  subBody.appendChild(
    buildSubsectionZone(
      sub,
      section.id,
      isNoSection,
      sectionTasks,
      context,
      suppressPlaceholders,
      renderToken
    )
  );
  const children = buildChildren(sub.id);
  if (children.length) {
    const childWrap = document.createElement("div");
    childWrap.className =
      "space-y-2 border-l border-slate-800/60 pl-4 md:pl-6 border-lime-500/10";
    children.forEach((child) =>
      childWrap.appendChild(renderSubsection(child, section, sectionTasks, context, options))
    );
    subBody.appendChild(childWrap);
  }
  subWrap.appendChild(subBody);
  return subWrap;
}

function renderSectionCard(section, context, options) {
  const { filteredTasks, suppressPlaceholders, renderToken } = options;
  const isNoSection = !section.id;
  const sectionTasks = getSectionTasks(filteredTasks, section, isNoSection);
  const isSubsectionZoom = isSubsectionZoomed(section.id);
  const card = buildSectionCardContainer(section, isSubsectionZoom);
  const isCollapsed = state.collapsedSections.has(section.id);
  if (!isSubsectionZoom) {
    card.appendChild(buildSectionHeader(section, { isNoSection, isCollapsed }));
  }
  const sectionBody = document.createElement("div");
  sectionBody.dataset.sectionBody = section.id;
  sectionBody.style.display = isCollapsed ? "none" : "";
  if (!isNoSection) {
    sectionBody.appendChild(buildSectionSubsectionInput(section.id));
  }
  const { subsections, taskSubsections } = buildSubsections(section, sectionTasks);
  const filteredSubs = filterSubsectionsForZoom(subsections, taskSubsections, section.id);
  appendUngroupedTasks(sectionBody, sectionTasks, isNoSection, context, renderToken);
  appendSubsections(sectionBody, filteredSubs, section, sectionTasks, context, {
    isNoSection,
    suppressPlaceholders,
    isSubsectionZoom,
    renderToken
  });
  card.appendChild(sectionBody);
  return card;
}

function getSectionTasks(filteredTasks, section, isNoSection) {
  return filteredTasks.filter((t) => (isNoSection ? !t.section : t.section === section.id));
}

function isSubsectionZoomed(sectionId) {
  return state.zoomFilter?.type === "subsection" && state.zoomFilter.sectionId === sectionId;
}

function buildSectionCardContainer(section, isSubsectionZoom) {
  const card = document.createElement("div");
  card.className = isSubsectionZoom
    ? "space-y-3"
    : "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
  card.dataset.sectionCard = section.id;
  return card;
}

function appendUngroupedTasks(sectionBody, sectionTasks, isNoSection, context, renderToken) {
  const ungroupedTasks = sortTasksByOrder(sectionTasks.filter((t) => !t.subsection));
  if (isNoSection) {
    const ungroupedZone = buildUngroupedZone(context, {
      dropSection: "",
      dropSubsection: "",
      ungroupedTasks
    }, renderToken);
    sectionBody.appendChild(ungroupedZone);
    return;
  }
  if (ungroupedTasks.length > 0) {
    renderTaskCards(sectionBody, ungroupedTasks, context, { renderToken, batchSize: 30 });
  }
}

function appendSubsections(sectionBody, filteredSubs, section, sectionTasks, context, options) {
  const { isNoSection, suppressPlaceholders, isSubsectionZoom, renderToken } = options;
  const buildChildren = (parentId = "") =>
    filteredSubs.filter((s) => (s.parentId || "") === (parentId || ""));
  if (isSubsectionZoom) {
    const targetId = state.zoomFilter.subsectionId || "";
    const targetSub = filteredSubs.find((sub) => sub.id === targetId);
    if (targetSub) {
      sectionBody.appendChild(
        renderSubsection(targetSub, section, sectionTasks, context, {
          isNoSection,
          suppressPlaceholders,
          buildChildren,
          renderToken
        })
      );
    }
    return;
  }
  buildChildren().forEach((sub) => {
    sectionBody.appendChild(
      renderSubsection(sub, section, sectionTasks, context, {
        isNoSection,
        suppressPlaceholders,
        buildChildren,
        renderToken
      })
    );
  });
}
export function renderTasks(tasks, timeMaps) {
  destroyTaskSortables();
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const baseTasks = tasks.filter((t) => !t.completed);
  const renderToken = ++taskRenderToken;
  const parentById = buildParentMap(tasks);
  const getTaskDepthById = buildTaskDepthGetter(parentById);
  const hasCollapsedAncestor = buildCollapsedAncestorChecker(parentById, state.collapsedTasks);
  const childrenByParent = buildChildrenByParent(tasks);
  const computeTotalDuration = buildDurationCalculator(childrenByParent);
  const filteredTasks = filterTasksByZoom(baseTasks, hasCollapsedAncestor);
  const context = buildTaskCardContext(baseTasks, timeMapById, computeTotalDuration, getTaskDepthById);
  if (state.zoomFilter?.type === "task") {
    renderZoomTasks(filteredTasks, context, renderToken);
    return;
  }
  const suppressPlaceholders = Boolean(state.zoomFilter);
  const sections = [...(state.settingsCache.sections || [])];
  const allSections = buildSectionsList(sections, filteredTasks);
  if (allSections.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No sections yet. Add a section to begin.</div>';
    return;
  }
  renderInBatches({
    items: allSections,
    batchSize: 3,
    shouldCancel: () => renderToken !== taskRenderToken,
    renderBatch: (batch) => {
      const fragment = document.createDocumentFragment();
      batch.forEach((section) => {
        fragment.appendChild(
          renderSectionCard(section, context, {
            filteredTasks,
            suppressPlaceholders,
            renderToken
          })
        );
      });
      taskList.appendChild(fragment);
    },
    onComplete: () => {
      if (renderToken !== taskRenderToken) {return;}
      setupTaskSortables();
    }
  });
}
