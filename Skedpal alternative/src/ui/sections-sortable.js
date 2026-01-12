import Sortable from "../../vendor/sortable.esm.js";
import { saveSettings } from "../data/db.js";
import { caretRightIconSvg } from "./constants.js";
import { state } from "./state/page-state.js";
import { renderSections, renderTaskSectionOptions } from "./sections.js";
import { renderFavoriteShortcuts } from "./sections-favorites.js";
import { renderTimeMapsAndTasks } from "./tasks/tasks-actions.js";
import {
  buildSectionOrder,
  buildSubsectionListFromOrder,
  addCollapsedId
} from "./sections-sortable-helpers.js";

let sectionSortableInstances = [];

export function destroySectionSortables() {
  sectionSortableInstances.forEach((instance) => instance?.destroy?.());
  sectionSortableInstances = [];
}

export { buildSectionOrder, buildSubsectionListFromOrder };

function getSectionIdsFromDom(list) {
  return [...(list?.querySelectorAll?.("[data-section-card]") || [])]
    .map((card) => card.dataset.sectionCard)
    .filter(Boolean);
}

function buildSubsectionOrderNodes(container, parentId, nodes) {
  const cards = [...(container?.children || [])].filter(
    (node) => node?.dataset?.subsectionCard
  );
  cards.forEach((card) => {
    const id = card.dataset.subsectionCard || "";
    if (!id) {return;}
    nodes.push({ id, parentId: parentId || "" });
    const childContainer = card.querySelector(
      `[data-subsection-container][data-parent-subsection-id="${id}"]`
    );
    if (childContainer) {
      buildSubsectionOrderNodes(childContainer, id, nodes);
    }
  });
}

function getSubsectionOrderNodes(sectionCard) {
  const topContainer = sectionCard?.querySelector?.(
    '[data-subsection-container][data-parent-subsection-id=""]'
  );
  if (!topContainer) {return [];}
  const nodes = [];
  buildSubsectionOrderNodes(topContainer, "", nodes);
  return nodes;
}

function hasSectionOrderChanged(sections, orderedIds) {
  const currentIds = (sections || []).map((section) => section.id);
  if (currentIds.length !== orderedIds.length) {return true;}
  return currentIds.some((id, index) => id !== orderedIds[index]);
}

function hasSubsectionOrderChanged(list, nextList) {
  if (list.length !== nextList.length) {return true;}
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i];
    const next = nextList[i];
    if (current?.id !== next?.id) {return true;}
    if ((current?.parentId || "") !== (next?.parentId || "")) {return true;}
  }
  return false;
}

function isSubsectionMoveValid(event) {
  const dragged = event?.dragged;
  const targetContainer = event?.to;
  if (!dragged || !targetContainer) {return true;}
  return !dragged.contains(targetContainer);
}

function getSubsectionSortUpdate(event) {
  if (!event?.to) {return null;}
  if (event.from === event.to && event.oldIndex === event.newIndex) {return null;}
  const sectionCard = event.to.closest?.("[data-section-card]");
  const sectionId = sectionCard?.dataset?.sectionCard || "";
  if (!sectionId) {return null;}
  const list = (state.settingsCache.subsections || {})[sectionId] || [];
  const orderedNodes = getSubsectionOrderNodes(sectionCard);
  if (!orderedNodes.length) {return null;}
  const nextList = buildSubsectionListFromOrder(list, orderedNodes);
  if (!hasSubsectionOrderChanged(list, nextList)) {return null;}
  return { sectionId, nextList };
}

async function persistSettings(nextSettings) {
  state.settingsCache = nextSettings;
  await saveSettings(nextSettings);
  renderSections();
  renderFavoriteShortcuts();
  renderTaskSectionOptions();
  renderTimeMapsAndTasks(state.tasksTimeMapsCache || []);
}

function persistCollapsedState(key, list) {
  state.settingsCache = {
    ...state.settingsCache,
    [key]: list
  };
  const promise = saveSettings(state.settingsCache);
  state.pendingSettingsSave = promise;
  promise.finally(() => {
    if (state.pendingSettingsSave === promise) {
      state.pendingSettingsSave = null;
    }
  });
}

function collapseSectionCard(sectionCard, sectionId) {
  if (!sectionCard || !sectionId) {return;}
  if (state.collapsedSections.has(sectionId)) {return;}
  state.collapsedSections.add(sectionId);
  const collapsedSections = addCollapsedId(state.settingsCache.collapsedSections, sectionId);
  persistCollapsedState("collapsedSections", collapsedSections);
  const body = sectionCard.querySelector?.(`[data-section-body="${sectionId}"]`);
  if (body) {body.style.display = "none";}
  const btn = sectionCard.querySelector?.(`[data-toggle-section-collapse="${sectionId}"]`);
  if (btn) {btn.innerHTML = caretRightIconSvg;}
}

function collapseSubsectionCard(subsectionCard, subsectionId) {
  if (!subsectionCard || !subsectionId) {return;}
  if (state.collapsedSubsections.has(subsectionId)) {return;}
  state.collapsedSubsections.add(subsectionId);
  const collapsedSubsections = addCollapsedId(state.settingsCache.collapsedSubsections, subsectionId);
  persistCollapsedState("collapsedSubsections", collapsedSubsections);
  const body = subsectionCard.querySelector?.(`[data-subsection-body="${subsectionId}"]`);
  if (body) {body.style.display = "none";}
  const btn = subsectionCard.querySelector?.(`[data-toggle-subsection-collapse="${subsectionId}"]`);
  if (btn) {btn.innerHTML = caretRightIconSvg;}
}

async function handleSectionSortEnd(event) {
  if (!event?.to) {return;}
  if (event.from === event.to && event.oldIndex === event.newIndex) {return;}
  const orderedIds = getSectionIdsFromDom(event.to);
  if (!orderedIds.length) {return;}
  if (!hasSectionOrderChanged(state.settingsCache.sections || [], orderedIds)) {return;}
  const updated = buildSectionOrder(state.settingsCache.sections || [], orderedIds);
  const movedId = event.item?.dataset?.sectionCard || "";
  if (movedId) {
    state.collapsedSections.add(movedId);
  }
  const collapsedSections = addCollapsedId(state.settingsCache.collapsedSections, movedId);
  await persistSettings({
    ...state.settingsCache,
    sections: updated,
    collapsedSections
  });
}

async function handleSubsectionSortEnd(event) {
  const update = getSubsectionSortUpdate(event);
  if (!update) {return;}
  const movedId = event.item?.dataset?.subsectionCard || "";
  if (movedId) {
    state.collapsedSubsections.add(movedId);
  }
  const nextSubsections = { ...(state.settingsCache.subsections || {}) };
  nextSubsections[update.sectionId] = update.nextList;
  const collapsedSubsections = addCollapsedId(state.settingsCache.collapsedSubsections, movedId);
  await persistSettings({
    ...state.settingsCache,
    subsections: nextSubsections,
    collapsedSubsections
  });
}

export function setupSectionSortables(taskList) {
  destroySectionSortables();
  if (!taskList) {return;}
  if (state.zoomFilter?.type === "task") {return;}
  const sectionCards = taskList.querySelectorAll("[data-section-card]");
  if (!sectionCards.length) {return;}
  const sectionSortable = new Sortable(taskList, {
    animation: 150,
    draggable: "[data-section-card]",
    handle: "[data-section-drag-handle]",
    forceFallback: true,
    fallbackOnBody: true,
    ghostClass: "template-sortable-ghost",
    chosenClass: "template-sortable-chosen",
    dragClass: "template-sortable-drag",
    swapThreshold: 0.65,
    onEnd: handleSectionSortEnd
  });
  sectionSortableInstances.push(sectionSortable);
  const subsectionContainers = taskList.querySelectorAll("[data-subsection-container]");
  subsectionContainers.forEach((container) => {
    const sortable = new Sortable(container, {
      group: {
        name: `subsections-${container.dataset.sectionId || "default"}`,
        pull: true,
        put: true
      },
      animation: 150,
      draggable: "[data-subsection-card]",
      handle: "[data-subsection-drag-handle]",
      forceFallback: true,
      fallbackOnBody: true,
      ghostClass: "template-sortable-ghost",
      chosenClass: "template-sortable-chosen",
      dragClass: "template-sortable-drag",
      swapThreshold: 0.65,
      onMove: isSubsectionMoveValid,
      onEnd: handleSubsectionSortEnd
    });
    sectionSortableInstances.push(sortable);
  });

  function handleDragHandlePointerDown(event) {
    const handle = event.target?.closest?.(
      "[data-section-drag-handle],[data-subsection-drag-handle]"
    );
    if (!handle) {return;}
    if (handle.dataset.subsectionDragHandle !== undefined) {
      const subsectionCard = handle.closest?.("[data-subsection-card]");
      collapseSubsectionCard(subsectionCard, handle.dataset.subsectionDragHandle || "");
      return;
    }
    if (handle.dataset.sectionDragHandle !== undefined) {
      const sectionCard = handle.closest?.("[data-section-card]");
      collapseSectionCard(sectionCard, handle.dataset.sectionDragHandle || "");
    }
  }

  taskList.addEventListener("pointerdown", handleDragHandlePointerDown, true);
  sectionSortableInstances.push({
    destroy: () => taskList.removeEventListener("pointerdown", handleDragHandlePointerDown, true)
  });
}
