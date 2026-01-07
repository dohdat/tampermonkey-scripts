import {
  TASK_PLACEHOLDER_CLASS,
  TASK_ZONE_CLASS,
  caretDownIconSvg,
  caretRightIconSvg,
  editIconSvg,
  favoriteIconSvg,
  zoomInIconSvg,
  removeIconSvg,
  domRefs
} from "../constants.js";
import { renderTaskCard } from "./task-card.js";
import { sortTasksByOrder, normalizeTimeMap, getSubsectionDescendantIds } from "../utils.js";
import { state } from "../state/page-state.js";
import { getSubsectionsFor, getSectionName } from "../sections.js";
import { destroyTaskSortables, setupTaskSortables } from "./tasks-sortable.js";
const { taskList } = domRefs;

export function renderTasks(tasks, timeMaps) {
  destroyTaskSortables();
  taskList.innerHTML = "";
  const timeMapById = new Map(timeMaps.map((tm) => [tm.id, normalizeTimeMap(tm)]));
  const baseTasks = tasks.filter((t) => !t.completed);
  const parentById = tasks.reduce((map, task) => {
    if (task.subtaskParentId) {
      map.set(task.id, task.subtaskParentId);
    }
    return map;
  }, new Map());
  const depthMemo = new Map();
  const getTaskDepthById = (taskId) => {
    if (!taskId) return 0;
    if (depthMemo.has(taskId)) return depthMemo.get(taskId);
    const parentId = parentById.get(taskId);
    if (!parentId) {
      depthMemo.set(taskId, 0);
      return 0;
    }
    const depth = getTaskDepthById(parentId) + 1;
    depthMemo.set(taskId, depth);
    return depth;
  };
  const collapsedAncestorMemo = new Map();
  const hasCollapsedAncestor = (taskId) => {
    if (!taskId) return false;
    if (collapsedAncestorMemo.has(taskId)) return collapsedAncestorMemo.get(taskId);
    const parentId = parentById.get(taskId);
    if (!parentId) {
      collapsedAncestorMemo.set(taskId, false);
      return false;
    }
    if (state.collapsedTasks.has(parentId)) {
      collapsedAncestorMemo.set(taskId, true);
      return true;
    }
    const result = hasCollapsedAncestor(parentId);
    collapsedAncestorMemo.set(taskId, result);
    return result;
  };
  const childrenByParent = tasks.reduce((map, task) => {
    const pid = task.subtaskParentId || "";
    if (!pid) return map;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(task);
    return map;
  }, new Map());
  const durationMemo = new Map();
  const computeTotalDuration = (task) => {
    if (!task?.id) return 0;
    if (durationMemo.has(task.id)) return durationMemo.get(task.id);
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
  const filteredTasks = (() => {
    const zoomTaskIds =
      state.zoomFilter?.type === "task"
        ? (() => {
            const ids = new Set([state.zoomFilter.taskId]);
            const stack = [state.zoomFilter.taskId];
            const childrenByParent = baseTasks.reduce((map, task) => {
              if (!task.subtaskParentId) return map;
              if (!map.has(task.subtaskParentId)) map.set(task.subtaskParentId, []);
              map.get(task.subtaskParentId).push(task.id);
              return map;
            }, new Map());
            while (stack.length) {
              const current = stack.pop();
              const children = childrenByParent.get(current) || [];
              children.forEach((childId) => {
                if (ids.has(childId)) return;
                ids.add(childId);
                stack.push(childId);
              });
            }
            return ids;
          })()
        : null;
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
          (t) =>
            (t.section || "") === sectionId && (t.subsection || "") === subsectionId
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
      return visible.filter((t) => zoomTaskIds?.has(t.id));
    }
    return visible;
  })();
  const isTaskZoom = state.zoomFilter?.type === "task";
  if (isTaskZoom) {
    const zoomWrap = document.createElement("div");
    zoomWrap.className = "space-y-2";
    zoomWrap.setAttribute("data-test-skedpal", "task-zoom-list");
    sortTasksByOrder(filteredTasks).forEach((task) => {
      zoomWrap.appendChild(
        renderTaskCard(task, {
          tasks: baseTasks,
          timeMapById,
          collapsedTasks: state.collapsedTasks,
          expandedTaskDetails: state.expandedTaskDetails,
          computeTotalDuration,
          getTaskDepthById,
          getSectionName,
          getSubsectionName: (sectionId, subsectionId) => {
            const subs = getSubsectionsFor(sectionId);
            return subs.find((s) => s.id === subsectionId)?.name || "";
          }
        })
      );
    });
    taskList.appendChild(zoomWrap);
    return;
  }
  const suppressPlaceholders = Boolean(state.zoomFilter);
  const sections = [...(state.settingsCache.sections || [])];
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
  if (state.zoomFilter?.type === "section") relevantSectionIds.add(state.zoomFilter.sectionId || "");
  if (state.zoomFilter?.type === "subsection") relevantSectionIds.add(state.zoomFilter.sectionId || "");
  if (state.zoomFilter?.type === "task") relevantSectionIds.add(state.zoomFilter.sectionId || "");
  const allSections = [
    ...sections,
    ...missingSections,
    ...(hasUnsectioned || sections.length === 0 ? [{ id: "", name: "No section" }] : [])
  ].filter((s) => (state.zoomFilter ? relevantSectionIds.has(s.id || "") : true));

  const getSubsectionName = (sectionId, subsectionId) => {
    const subs = getSubsectionsFor(sectionId);
    return subs.find((s) => s.id === subsectionId)?.name || "";
  };

  const renderSectionCard = (section) => {
    const isNoSection = !section.id;
    const sectionTasks = filteredTasks.filter((t) =>
      isNoSection ? !t.section : t.section === section.id
    );
    const isSubsectionZoom =
      state.zoomFilter?.type === "subsection" && state.zoomFilter.sectionId === section.id;
    const card = document.createElement("div");
    card.className = isSubsectionZoom
      ? "space-y-3"
      : "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
    card.dataset.sectionCard = section.id;
    const isCollapsed = state.collapsedSections.has(section.id);
    if (!isSubsectionZoom) {
      const header = document.createElement("div");
      header.className = "flex flex-wrap items-center justify-between gap-2";
      const title = document.createElement("div");
      title.className =
        "title-hover-group flex items-center gap-2 text-base font-semibold text-slate-100";
      const titleText = document.createElement("span");
      titleText.textContent = getSectionName(section.id) || section.name || "Untitled section";
      title.appendChild(titleText);
      if (!isNoSection) {
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
        editSectionBtn.style.borderColor = "#22c55e";
        editSectionBtn.style.color = "#22c55e";
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
        removeSectionBtn.style.borderColor = "#f97316";
        removeSectionBtn.style.color = "#f97316";
        if (isDefaultSection) {
          removeSectionBtn.disabled = true;
          removeSectionBtn.classList.add("opacity-50", "cursor-not-allowed");
        }
        const addSubsectionToggle = document.createElement("button");
        addSubsectionToggle.type = "button";
        addSubsectionToggle.dataset.toggleSubsection = section.id;
        addSubsectionToggle.className =
          "rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
        addSubsectionToggle.textContent = "Add subsection";
        titleActions.appendChild(collapseBtn);
        titleActions.appendChild(editSectionBtn);
        titleActions.appendChild(zoomSectionBtn);
        titleActions.appendChild(favoriteSectionBtn);
        titleActions.appendChild(addSubsectionToggle);
        titleActions.appendChild(removeSectionBtn);
        title.appendChild(titleActions);
      }
      header.appendChild(title);
      card.appendChild(header);
    }

    const sectionBody = document.createElement("div");
    sectionBody.dataset.sectionBody = section.id;
    sectionBody.style.display = isCollapsed ? "none" : "";

    if (!isNoSection) {
      const subsectionInputWrap = document.createElement("div");
      subsectionInputWrap.className = "flex flex-col gap-2 md:flex-row md:items-center";
      subsectionInputWrap.style.display = "none";
      subsectionInputWrap.dataset.subsectionForm = section.id;
      subsectionInputWrap.innerHTML = `
        <input data-subsection-input="${section.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-add-subsection="${section.id}" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add subsection</button>
      `;
      sectionBody.appendChild(subsectionInputWrap);
    }

    const subsectionMap = state.settingsCache.subsections || {};
    const subsections = !isNoSection
      ? [...(subsectionMap[section.id] || [])].map((s) => ({ favorite: false, parentId: "", ...s }))
      : [];
    const taskSubsections = Array.from(new Set(sectionTasks.map((t) => t.subsection).filter(Boolean)));
    taskSubsections.forEach((subId) => {
      if (subsections.find((s) => s.id === subId)) return;
      if (subId) {
        subsections.push({
          id: subId,
          name: getSubsectionName(section.id, subId) || "Unnamed subsection",
          favorite: false
        });
      }
    });
    if (state.zoomFilter?.type === "task" || state.zoomFilter?.type === "subsection") {
      const subsectionsById = new Map(subsections.map((s) => [s.id, s]));
      const childrenByParent = subsections.reduce((map, sub) => {
        const pid = sub.parentId || "";
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push(sub.id);
        return map;
      }, new Map());
      const allowedSubsections = new Set();
      const markWithAncestors = (subsectionId) => {
        let current = subsectionsById.get(subsectionId);
        while (current) {
          if (allowedSubsections.has(current.id)) break;
          allowedSubsections.add(current.id);
          const parentId = current.parentId || "";
          current = parentId ? subsectionsById.get(parentId) : null;
        }
      };
      const markDescendants = (subsectionId) => {
        (childrenByParent.get(subsectionId) || []).forEach((childId) => {
          if (allowedSubsections.has(childId)) return;
          allowedSubsections.add(childId);
          markDescendants(childId);
        });
      };
      if (state.zoomFilter?.type === "task") {
        taskSubsections.filter(Boolean).forEach((id) => markWithAncestors(id));
      }
      if (state.zoomFilter?.type === "subsection" && state.zoomFilter.sectionId === section.id) {
        const targetId = state.zoomFilter.subsectionId || "";
        const descendants = getSubsectionDescendantIds(subsections, targetId);
        descendants.forEach((id) => allowedSubsections.add(id));
      }
      if (allowedSubsections.size > 0) {
        const filtered = subsections.filter((s) => allowedSubsections.has(s.id));
        subsections.splice(0, subsections.length, ...filtered);
      }
    }

    const ungroupedTasks = sortTasksByOrder(sectionTasks.filter((t) => !t.subsection));
    if (isNoSection) {
      const ungroupedZone = document.createElement("div");
      ungroupedZone.dataset.dropSection = "";
      ungroupedZone.dataset.dropSubsection = "";
      ungroupedZone.className =
        "space-y-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-3 py-3";
      ungroupedZone.classList.add(TASK_ZONE_CLASS);
      if (ungroupedTasks.length > 0) {
        ungroupedTasks.forEach((task) => {
          ungroupedZone.appendChild(
            renderTaskCard(task, {
              tasks: baseTasks,
              timeMapById,
              collapsedTasks: state.collapsedTasks,
              expandedTaskDetails: state.expandedTaskDetails,
              computeTotalDuration,
              getTaskDepthById,
              getSectionName,
              getSubsectionName
            })
          );
        });
      }
      sectionBody.appendChild(ungroupedZone);
    } else if (ungroupedTasks.length > 0) {
      ungroupedTasks.forEach((task) => {
        sectionBody.appendChild(
          renderTaskCard(task, {
            tasks: baseTasks,
            timeMapById,
            collapsedTasks: state.collapsedTasks,
            expandedTaskDetails: state.expandedTaskDetails,
            computeTotalDuration,
            getTaskDepthById,
            getSectionName,
            getSubsectionName
          })
        );
      });
    }

    const buildChildren = (parentId = "") =>
      subsections.filter((s) => (s.parentId || "") === (parentId || ""));

    const renderSubsection = (sub) => {
      const subWrap = document.createElement("div");
      subWrap.className =
        "space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 pl-4 md:pl-6";
      subWrap.dataset.subsectionCard = sub.id;
      const subHeader = document.createElement("div");
      subHeader.className = "flex items-center justify-between text-sm font-semibold text-slate-200";
      const subTitle = document.createElement("div");
      subTitle.className = "title-hover-group flex items-center gap-2";
      const subTitleText = document.createElement("span");
      subTitleText.textContent = sub.name;
      const subTitleActions = document.createElement("div");
      subTitleActions.className = "title-actions";
      const collapseSubBtn = document.createElement("button");
      collapseSubBtn.type = "button";
      collapseSubBtn.dataset.toggleSubsectionCollapse = sub.id;
      collapseSubBtn.dataset.parentSection = section.id;
      collapseSubBtn.className = "title-icon-btn";
      const subCollapsed = state.collapsedSubsections.has(sub.id);
      collapseSubBtn.title = "Expand/collapse subsection";
      collapseSubBtn.innerHTML = subCollapsed ? caretRightIconSvg : caretDownIconSvg;
      const editSubBtn = document.createElement("button");
      editSubBtn.type = "button";
      editSubBtn.dataset.editSubsection = sub.id;
      editSubBtn.dataset.parentSection = section.id;
      editSubBtn.className = "title-icon-btn";
      editSubBtn.title = "Edit subsection";
      editSubBtn.innerHTML = editIconSvg;
      editSubBtn.style.borderColor = "#22c55e";
      editSubBtn.style.color = "#22c55e";
      const zoomSubBtn = document.createElement("button");
      zoomSubBtn.type = "button";
      zoomSubBtn.dataset.zoomSubsection = sub.id;
      zoomSubBtn.dataset.zoomSection = section.id;
      zoomSubBtn.className = "title-icon-btn";
      zoomSubBtn.title = "Zoom into subsection";
      zoomSubBtn.innerHTML = zoomInIconSvg;
      const favoriteSubBtn = document.createElement("button");
      favoriteSubBtn.type = "button";
      favoriteSubBtn.dataset.favoriteSubsection = sub.id;
      favoriteSubBtn.dataset.parentSection = section.id;
      favoriteSubBtn.className = `title-icon-btn${sub.favorite ? " favorite-active" : ""}`;
      favoriteSubBtn.title = sub.favorite ? "Unfavorite subsection" : "Favorite subsection";
      favoriteSubBtn.innerHTML = favoriteIconSvg;
      const removeSubBtn = document.createElement("button");
      removeSubBtn.type = "button";
      removeSubBtn.dataset.removeSubsection = sub.id;
      removeSubBtn.dataset.parentSection = section.id;
      removeSubBtn.className = "title-icon-btn";
      removeSubBtn.title = "Remove subsection";
      removeSubBtn.innerHTML = removeIconSvg;
      removeSubBtn.style.borderColor = "#f97316";
      removeSubBtn.style.color = "#f97316";
      const addSubTaskBtn = document.createElement("button");
      addSubTaskBtn.type = "button";
      addSubTaskBtn.dataset.addSection = isNoSection ? "" : section.id;
      addSubTaskBtn.dataset.addSubsectionTarget = sub.id;
      addSubTaskBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
      addSubTaskBtn.textContent = "Add task";
      const addChildSubBtn = document.createElement("button");
      addChildSubBtn.type = "button";
      addChildSubBtn.dataset.addChildSubsection = sub.id;
      addChildSubBtn.dataset.sectionId = isNoSection ? "" : section.id;
      addChildSubBtn.className =
        "rounded-lg border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-lime-400";
      addChildSubBtn.textContent = "Add subsection";
      subTitleActions.appendChild(collapseSubBtn);
      subTitleActions.appendChild(editSubBtn);
      subTitleActions.appendChild(zoomSubBtn);
      subTitleActions.appendChild(favoriteSubBtn);
      subTitleActions.appendChild(addChildSubBtn);
      subTitleActions.appendChild(addSubTaskBtn);
      subTitleActions.appendChild(removeSubBtn);
      subTitle.appendChild(subTitleText);
      subTitle.appendChild(subTitleActions);
      subHeader.appendChild(subTitle);
      subWrap.appendChild(subHeader);

      const subBody = document.createElement("div");
      subBody.dataset.subsectionBody = sub.id;
      subBody.style.display = subCollapsed ? "none" : "";

      const childSubsectionInputWrap = document.createElement("div");
      childSubsectionInputWrap.className =
        "hidden flex flex-col gap-2 md:flex-row md:items-center";
      childSubsectionInputWrap.dataset.childSubsectionForm = sub.id;
      childSubsectionInputWrap.innerHTML = `
        <input data-child-subsection-input="${sub.id}" placeholder="Add subsection" class="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-submit-child-subsection="${sub.id}" data-parent-section="${
          isNoSection ? "" : section.id
        }" class="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add</button>
      `;
      subBody.appendChild(childSubsectionInputWrap);

      const subZone = document.createElement("div");
      subZone.dataset.dropSection = isNoSection ? "" : section.id;
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
        subTasks.forEach((task) => {
          subZone.appendChild(
            renderTaskCard(task, {
              tasks: baseTasks,
              timeMapById,
              collapsedTasks: state.collapsedTasks,
              expandedTaskDetails: state.expandedTaskDetails,
              computeTotalDuration,
              getTaskDepthById,
              getSectionName,
              getSubsectionName
            })
          );
        });
      }
      subBody.appendChild(subZone);

      const children = buildChildren(sub.id);
      if (children.length) {
        const childWrap = document.createElement("div");
        childWrap.className =
          "space-y-2 border-l border-slate-800/60 pl-4 md:pl-6 border-lime-500/10";
        children.forEach((child) => childWrap.appendChild(renderSubsection(child)));
        subBody.appendChild(childWrap);
      }
      subWrap.appendChild(subBody);
      return subWrap;
    };

    if (isSubsectionZoom) {
      const targetId = state.zoomFilter.subsectionId || "";
      const targetSub = subsections.find((sub) => sub.id === targetId);
      if (targetSub) {
        sectionBody.appendChild(renderSubsection(targetSub));
      }
    } else {
      buildChildren().forEach((sub) => {
        sectionBody.appendChild(renderSubsection(sub));
      });
    }

    card.appendChild(sectionBody);
    return card;
  };

  if (allSections.length === 0) {
    taskList.innerHTML =
      '<div class="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">No sections yet. Add a section to begin.</div>';
    return;
  }

  allSections.forEach((section) => {
    taskList.appendChild(renderSectionCard(section));
  });
  setupTaskSortables();
}
