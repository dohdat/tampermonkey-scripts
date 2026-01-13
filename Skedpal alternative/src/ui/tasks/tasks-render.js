import {
  TASK_ZONE_CLASS,
  caretDownIconSvg,
  caretRightIconSvg,
  editIconSvg,
  favoriteIconSvg,
  sortIconSvg,
  zoomInIconSvg,
  subtaskIconSvg,
  removeIconSvg,
  domRefs
} from "../constants.js";
import { renderTaskCards } from "./task-cards-render.js";
import { sortTasksByOrder, normalizeTimeMap, getSubsectionDescendantIds, renderInBatches } from "../utils.js";
import { state } from "../state/page-state.js";
import { getSubsectionsFor, getSectionName } from "../sections-data.js";
import { destroyTaskSortables, setupTaskSortables } from "./tasks-sortable.js";
import { destroySectionSortables, setupSectionSortables } from "../sections-sortable.js";
import { themeColors } from "../theme.js";
import { destroyTaskVirtualizers, initializeTaskVirtualizers } from "./task-virtualization.js";
import { buildChildSubsectionInput, buildSubsectionZone } from "./task-subsection-zone.js";
import { buildZoomTaskZone } from "./tasks-zoom-zone.js";
import {
  buildParentMap,
  buildTaskDepthGetter,
  buildCollapsedAncestorChecker,
  buildChildrenByParent,
  buildDurationCalculator,
  buildFirstOccurrenceOutOfRangeMap,
  buildFirstOccurrenceUnscheduledMap,
  buildSubsectionActionButtons,
  buildDragHandleButton,
  buildSectionActionButtons
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

function buildShouldCancel(renderToken) {
  if (!Number.isFinite(renderToken)) {return null;}
  return () => renderToken !== taskRenderToken;
}

function renderZoomTasks(filteredTasks, context, renderToken, zoomMeta) {
  const zone = buildZoomTaskZone(
    filteredTasks,
    context,
    renderToken,
    zoomMeta,
    buildShouldCancel(renderToken)
  );
  taskList.appendChild(zone);
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
  header.className = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-1";
  const title = document.createElement("div");
  title.className =
    "title-hover-group flex items-center gap-2 text-base font-semibold text-slate-100";
  const titleText = document.createElement("span");
  titleText.setAttribute("data-test-skedpal", "section-title-text");
  titleText.textContent = getSectionName(section.id) || section.name || "Untitled section";
  title.appendChild(titleText);
  if (isNoSection) {
    header.appendChild(title);
    return header;
  }
  const titleActions = document.createElement("div");
  titleActions.className = "title-actions";
  const {
    addSubsectionToggle,
    collapseBtn,
    dragHandle,
    editSectionBtn,
    favoriteSectionBtn,
    removeSectionBtn,
    zoomSectionBtn
  } = buildSectionActionButtons({
    section,
    isCollapsed,
    themeColors,
    icons: {
      caretDownIconSvg,
      caretRightIconSvg,
      editIconSvg,
      favoriteIconSvg,
      zoomInIconSvg,
      removeIconSvg,
      subtaskIconSvg
    }
  });
  titleActions.appendChild(collapseBtn);
  titleActions.appendChild(favoriteSectionBtn);
  titleActions.appendChild(editSectionBtn);
  titleActions.appendChild(zoomSectionBtn);
  titleActions.appendChild(addSubsectionToggle);
  titleActions.appendChild(removeSectionBtn);
  titleActions.appendChild(dragHandle);
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
        <input data-subsection-input="${sectionId}" placeholder="Add subsection" class="w-full rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${sectionId}" class="rounded-lg border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
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
    "space-y-2 rounded-xl border-dashed border-slate-700 bg-slate-900/50 px-3 py-3";
  ungroupedZone.classList.add(TASK_ZONE_CLASS);
  renderTaskCards(ungroupedZone, options.ungroupedTasks, context, {
    renderToken,
    batchSize: 30,
    shouldCancel: buildShouldCancel(renderToken)
  });
  return ungroupedZone;
}

function buildSubsectionHeader(sub, section, isNoSection) {
  const subHeader = document.createElement("div");
  subHeader.className =
    "flex items-center justify-between border-b border-slate-800/60 pb-1 text-base font-semibold text-slate-200";
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
  const dragHandle = buildDragHandleButton({
    label: "Drag subsection",
    datasetKey: "subsectionDragHandle",
    datasetValue: sub.id,
    testId: "subsection-drag-handle"
  });
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
    favoriteSubBtn,
    removeSubBtn,
    addChildSubBtn,
    sortSubBtn
  } = buildSubsectionActionButtons({
    sub,
    sectionId: section.id,
    isNoSection,
    themeColors,
    icons: {
      editIconSvg,
      favoriteIconSvg,
      removeIconSvg,
      subtaskIconSvg,
      sortIconSvg
    }
  });
  subTitle.appendChild(collapseSubBtn);
  subTitleActions.appendChild(favoriteSubBtn);
  subTitleActions.appendChild(addChildSubBtn);
  subTitleActions.appendChild(sortSubBtn);
  subTitleActions.appendChild(editSubBtn);
  subTitleActions.appendChild(removeSubBtn);
  subTitleActions.appendChild(dragHandle);
  subTitle.appendChild(subTitleText);
  subTitle.appendChild(subTitleActions);
  subHeader.appendChild(subTitle);
  return { subHeader, subCollapsed };
}

function renderSubsection(sub, section, sectionTasks, context, options) {
  const {
    isNoSection,
    suppressPlaceholders,
    buildChildren,
    renderToken,
    enableVirtualization,
    isAncestorCollapsed
  } = options;
  const subWrap = document.createElement("div");
  subWrap.className =
    "space-y-2 rounded-xl border-slate-800 bg-slate-900/60 p-3 pl-4 md:pl-6";
  subWrap.dataset.subsectionCard = sub.id;
  subWrap.dataset.sectionId = section.id || "";
  subWrap.setAttribute("data-test-skedpal", "subsection-card");
  const { subHeader, subCollapsed } = buildSubsectionHeader(sub, section, isNoSection);
  const isCollapsed = Boolean(isAncestorCollapsed || subCollapsed);
  subWrap.appendChild(subHeader);
  const subBody = document.createElement("div");
  subBody.dataset.subsectionBody = sub.id;
  subBody.style.display = subCollapsed ? "none" : "";
  subBody.appendChild(buildChildSubsectionInput(sub, section.id, isNoSection));
  const children = buildChildren(sub.id);
  const showAddTaskRow =
    children.length === 0 ||
    (state.zoomFilter?.type === "subsection" && state.zoomFilter.subsectionId === sub.id);
  subBody.appendChild(
    buildSubsectionZone(
      sub,
      section.id,
      isNoSection,
      sectionTasks,
      context,
      suppressPlaceholders,
      renderToken,
      {
        enableVirtualization,
        isCollapsed,
        shouldCancel: buildShouldCancel(renderToken),
        showAddTaskRow
      }
    )
  );
  if (children.length) {
    const childWrap = document.createElement("div");
    childWrap.className =
      "space-y-2 border-l border-slate-800/60 pl-4 md:pl-6 border-lime-500/10";
    childWrap.dataset.subsectionChildren = "true";
    childWrap.dataset.subsectionContainer = "true";
    childWrap.dataset.parentSubsectionId = sub.id || "";
    childWrap.dataset.sectionId = section.id || "";
    childWrap.setAttribute("data-test-skedpal", "subsection-children");
    const childOptions = { ...options, isAncestorCollapsed: isCollapsed };
    children.forEach((child) =>
      childWrap.appendChild(renderSubsection(child, section, sectionTasks, context, childOptions))
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
  const enableVirtualization = true;
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
    renderToken,
    enableVirtualization,
    isSectionCollapsed: isCollapsed
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
    : "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
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
    renderTaskCards(sectionBody, ungroupedTasks, context, {
      renderToken,
      batchSize: 30,
      shouldCancel: buildShouldCancel(renderToken)
    });
  }
}

function appendSubsections(sectionBody, filteredSubs, section, sectionTasks, context, options) {
  const {
    isNoSection,
    suppressPlaceholders,
    isSubsectionZoom,
    renderToken,
    enableVirtualization,
    isSectionCollapsed
  } = options;
  const buildChildren = (parentId = "") =>
    filteredSubs.filter((s) => (s.parentId || "") === (parentId || ""));
  const subsectionContainer = document.createElement("div");
  subsectionContainer.className = "space-y-2";
  subsectionContainer.dataset.subsectionContainer = "true";
  subsectionContainer.dataset.parentSubsectionId = "";
  subsectionContainer.dataset.sectionId = section.id || "";
  subsectionContainer.setAttribute("data-test-skedpal", "subsection-container");
  if (isSubsectionZoom) {
    const targetId = state.zoomFilter.subsectionId || "";
    const targetSub = filteredSubs.find((sub) => sub.id === targetId);
    if (targetSub) {
      subsectionContainer.appendChild(
        renderSubsection(targetSub, section, sectionTasks, context, {
          isNoSection,
          suppressPlaceholders,
          buildChildren,
          renderToken,
          enableVirtualization,
          isAncestorCollapsed: isSectionCollapsed
        })
      );
    }
    sectionBody.appendChild(subsectionContainer);
    return;
  }
  buildChildren().forEach((sub) => {
    subsectionContainer.appendChild(
      renderSubsection(sub, section, sectionTasks, context, {
        isNoSection,
        suppressPlaceholders,
        buildChildren,
        renderToken,
        enableVirtualization,
        isAncestorCollapsed: isSectionCollapsed
      })
    );
  });
  sectionBody.appendChild(subsectionContainer);
}
export function renderTasks(tasks, timeMaps) {
  destroyTaskSortables();
  destroySectionSortables();
  destroyTaskVirtualizers();
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const baseTasks = tasks.filter((t) => !t.completed);
  const renderToken = ++taskRenderToken;
  const parentById = buildParentMap(tasks);
  const getTaskDepthById = buildTaskDepthGetter(parentById);
  const hasCollapsedAncestor = buildCollapsedAncestorChecker(parentById, state.collapsedTasks);
  const childrenByParent = buildChildrenByParent(baseTasks);
  const computeTotalDuration = buildDurationCalculator(childrenByParent);
  const filteredTasks = filterTasksByZoom(baseTasks, hasCollapsedAncestor);
  const context = buildTaskCardContext(baseTasks, timeMapById, computeTotalDuration, getTaskDepthById);
  if (state.zoomFilter?.type === "task") {
    const zoomTask = baseTasks.find((task) => task.id === state.zoomFilter?.taskId) || null;
    renderZoomTasks(filteredTasks, context, renderToken, {
      sectionId: state.zoomFilter.sectionId || zoomTask?.section || "",
      subsectionId: state.zoomFilter.subsectionId || zoomTask?.subsection || "",
      parentId: state.zoomFilter.taskId || ""
    });
    initializeTaskVirtualizers();
    setupTaskSortables();
    return;
  }
  const suppressPlaceholders = Boolean(state.zoomFilter);
  const sections = [...(state.settingsCache.sections || [])];
  const allSections = buildSectionsList(sections, filteredTasks);
  if (allSections.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No sections yet. Add a section to begin.</div>';
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
      initializeTaskVirtualizers();
      setupTaskSortables();
      setupSectionSortables(taskList);
    }
  });
}
