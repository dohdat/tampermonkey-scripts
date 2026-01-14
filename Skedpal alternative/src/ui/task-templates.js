import {
  getAllTaskTemplates,
  saveTaskTemplate,
  deleteTaskTemplate
} from "../data/db.js";
import Sortable from "../../vendor/sortable.esm.js";
import { SORT_AFTER, TEMPLATE_SORTABLE_STYLE_ID, domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { openTemplateEditor, openTemplateSubtaskEditor } from "./tasks/tasks-actions.js";
import {
  toggleTemplateSubtaskList,
  getExpandedTemplateIds,
  getTemplateCardFromNode
} from "./task-templates-utils.js";

const SORT_BEFORE = -1;
let templateSortableInstances = [];

function getTemplateTitle(template) {
  return template?.title || "Untitled template";
}

function getTemplateOrder(template) {
  const order = Number(template?.order);
  return Number.isFinite(order) ? order : null;
}

function sortTemplates(list) {
  return [...list].sort((a, b) => {
    const orderA = getTemplateOrder(a);
    const orderB = getTemplateOrder(b);
    if (orderA !== null && orderB !== null && orderA !== orderB) {
      return orderA - orderB;
    }
    if (orderA !== null && orderB === null) {return SORT_BEFORE;}
    if (orderA === null && orderB !== null) {return SORT_AFTER;}
    return getTemplateTitle(a).localeCompare(getTemplateTitle(b));
  });
}

function renderEmptyTemplateList(container) {
  const empty = document.createElement("div");
  empty.className =
    "flex items-center justify-center rounded-xl border-dashed border-slate-700 bg-slate-900/60 px-3 py-4 text-sm text-slate-400";
  empty.textContent = "No task templates yet.";
  empty.setAttribute("data-test-skedpal", "task-template-empty");
  container.appendChild(empty);
}

function buildSubtaskRow(subtask, templateId) {
  const row = document.createElement("div");
  row.className =
    "group flex flex-wrap items-center justify-between gap-2 rounded-xl border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200";
  row.setAttribute("data-test-skedpal", "task-template-subtask-row");
  row.setAttribute("data-template-subtask-row", "true");
  row.dataset.subtaskId = subtask.id || "";

  const content = document.createElement("div");
  content.className = "flex flex-wrap items-center gap-2";
  content.setAttribute("data-test-skedpal", "task-template-subtask-content");

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className =
    "cursor-grab rounded-lg border-slate-800 px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100 hover:border-lime-400 hover:text-lime-300";
  dragHandle.setAttribute("aria-label", "Drag subtask");
  dragHandle.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M7 4.5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 4.5ZM7 10a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 10Zm-1.25 6.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM15.5 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM14.25 11.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm1.25 4a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"></path></svg>`;
  dragHandle.setAttribute("data-template-subtask-drag-handle", "true");
  dragHandle.setAttribute("data-test-skedpal", "task-template-subtask-drag-handle");

  const label = document.createElement("div");
  label.className = "text-sm font-semibold text-slate-100";
  label.textContent = getTemplateTitle(subtask);
  label.setAttribute("data-test-skedpal", "task-template-subtask-title");

  const actions = document.createElement("div");
  actions.className = "task-template-subtask-actions flex flex-wrap items-center gap-2";
  actions.setAttribute("data-test-skedpal", "task-template-subtask-actions");

  const addChildBtn = document.createElement("button");
  addChildBtn.type = "button";
  addChildBtn.dataset.templateAddChildSubtask = subtask.id || "";
  addChildBtn.dataset.templateId = templateId;
  addChildBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  addChildBtn.textContent = "Add subtask";
  addChildBtn.setAttribute("data-test-skedpal", "task-template-subtask-add-child");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.dataset.templateSubtaskEdit = subtask.id || "";
  editBtn.dataset.templateId = templateId;
  editBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("data-test-skedpal", "task-template-subtask-edit");

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.dataset.templateSubtaskDelete = subtask.id || "";
  removeBtn.dataset.templateId = templateId;
  removeBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:border-orange-400";
  removeBtn.textContent = "Remove";
  removeBtn.setAttribute("data-test-skedpal", "task-template-subtask-delete");

  actions.appendChild(addChildBtn);
  actions.appendChild(editBtn);
  actions.appendChild(removeBtn);
  content.appendChild(dragHandle);
  content.appendChild(label);
  row.appendChild(content);
  row.appendChild(actions);
  return row;
}

function buildTemplateSubtaskTree(subtasks) {
  const items = Array.isArray(subtasks) ? subtasks : [];
  const ids = new Set(items.map((entry) => entry.id).filter(Boolean));
  const childrenByParent = items.reduce((map, subtask) => {
    const parentKey =
      subtask.subtaskParentId && ids.has(subtask.subtaskParentId)
        ? subtask.subtaskParentId
        : "";
    if (!map.has(parentKey)) {map.set(parentKey, []);}
    map.get(parentKey).push(subtask);
    return map;
  }, new Map());
  return {
    roots: childrenByParent.get("") || [],
    childrenByParent
  };
}

function collectTemplateDescendantIds(subtasks, parentId) {
  if (!parentId) {return new Set();}
  const { childrenByParent } = buildTemplateSubtaskTree(subtasks);
  const toRemove = new Set([parentId]);
  const stack = [parentId];
  while (stack.length) {
    const current = stack.pop();
    const children = childrenByParent.get(current) || [];
    children.forEach((child) => {
      if (!child.id || toRemove.has(child.id)) {return;}
      toRemove.add(child.id);
      stack.push(child.id);
    });
  }
  return toRemove;
}

function renderSubtaskTree(container, templateId, subtasks) {
  const { roots, childrenByParent } = buildTemplateSubtaskTree(subtasks);
  const visited = new Set();
  const appendSubtask = (subtask, parentContainer) => {
    if (subtask.id && visited.has(subtask.id)) {return;}
    if (subtask.id) {visited.add(subtask.id);}
    const node = document.createElement("div");
    node.className = "space-y-2";
    node.dataset.subtaskId = subtask.id || "";
    node.setAttribute("data-template-subtask-node", "true");
    node.setAttribute("data-test-skedpal", "task-template-subtask-node");
    node.appendChild(buildSubtaskRow(subtask, templateId));
    const children = childrenByParent.get(subtask.id) || [];
    if (children.length) {
      const childWrap = document.createElement("div");
      childWrap.className = "ml-4 space-y-2 border-l border-slate-800/60 pl-4";
      childWrap.setAttribute("data-test-skedpal", "task-template-subtask-children");
      childWrap.setAttribute("data-template-subtask-container", "true");
      childWrap.dataset.parentSubtaskId = subtask.id || "";
      childWrap.dataset.templateId = templateId || "";
      node.appendChild(childWrap);
      children.forEach((child) => appendSubtask(child, childWrap));
    }
    parentContainer.appendChild(node);
  };
  roots.forEach((subtask) => appendSubtask(subtask, container));
}

function buildTemplateTitle(template, subtaskCount) {
  const titleWrap = document.createElement("div");
  titleWrap.className = "group flex flex-wrap items-center gap-2";
  titleWrap.setAttribute("data-test-skedpal", "task-template-title-wrap");
  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className =
    "cursor-grab rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 opacity-0 transition group-hover:opacity-100 hover:border-lime-400 hover:text-lime-300";
  dragHandle.setAttribute("aria-label", "Drag template");
  dragHandle.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M7 4.5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 4.5ZM7 10a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 10Zm-1.25 6.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM15.5 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM14.25 11.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm1.25 4a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"></path></svg>`;
  dragHandle.setAttribute("data-template-drag-handle", "true");
  dragHandle.setAttribute("data-test-skedpal", "task-template-drag-handle");
  const title = document.createElement("span");
  title.className = "text-base font-semibold text-slate-100";
  title.textContent = getTemplateTitle(template);
  title.setAttribute("data-test-skedpal", "task-template-title");
  const count = document.createElement("span");
  count.className =
    "rounded-full border-slate-700 bg-slate-800/70 px-2 py-1 text-xs font-semibold text-slate-200";
  count.textContent = `${subtaskCount} ${subtaskCount === 1 ? "subtask" : "subtasks"}`;
  count.setAttribute("data-test-skedpal", "task-template-subtask-count");
  titleWrap.appendChild(dragHandle);
  titleWrap.appendChild(title);
  titleWrap.appendChild(count);
  return titleWrap;
}

function buildTemplateActions(template, subtaskCount, isExpanded) {
  const actions = document.createElement("div");
  actions.className = "task-template-actions flex flex-wrap items-center gap-2";
  actions.setAttribute("data-test-skedpal", "task-template-actions");
  const addSubtaskBtn = document.createElement("button");
  addSubtaskBtn.type = "button";
  addSubtaskBtn.dataset.templateAddSubtask = template.id || "";
  addSubtaskBtn.className =
    "rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  addSubtaskBtn.textContent = "Add subtask";
  addSubtaskBtn.setAttribute("data-test-skedpal", "task-template-add-subtask");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.dataset.templateEdit = template.id || "";
  editBtn.className =
    "rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("data-test-skedpal", "task-template-edit");

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.dataset.templateDelete = template.id || "";
  deleteBtn.className =
    "rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-orange-400";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("data-test-skedpal", "task-template-delete");

  actions.appendChild(addSubtaskBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  if (subtaskCount > 0) {
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.dataset.templateToggleSubtasks = template.id || "";
    toggleBtn.className =
      "rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
    toggleBtn.textContent = isExpanded ? "Collapse" : "Expand";
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("data-test-skedpal", "task-template-toggle");
    actions.appendChild(toggleBtn);
  }
  return actions;
}

function buildTemplateSubtaskList(template, isExpanded) {
  if (!Array.isArray(template.subtasks) || template.subtasks.length === 0) {return null;}
  const subtaskList = document.createElement("div");
  subtaskList.className = `grid gap-2${isExpanded ? "" : " hidden"}`;
  subtaskList.dataset.templateSubtaskList = template.id || "";
  subtaskList.dataset.templateId = template.id || "";
  subtaskList.dataset.parentSubtaskId = "";
  subtaskList.setAttribute("data-template-subtask-container", "true");
  subtaskList.setAttribute("data-test-skedpal", "task-template-subtask-list");
  renderSubtaskTree(subtaskList, template.id, template.subtasks);
  return subtaskList;
}

function buildTemplateCard(template, isExpanded) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
  card.setAttribute("data-test-skedpal", "task-template-card");
  card.setAttribute("data-template-card", "true");
  card.dataset.templateId = template.id || "";

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", "task-template-header");

  const subtaskCount = (template.subtasks || []).length;
  const titleWrap = buildTemplateTitle(template, subtaskCount);
  const actions = buildTemplateActions(template, subtaskCount, isExpanded);
  header.appendChild(titleWrap);
  header.appendChild(actions);
  card.appendChild(header);

  const subtaskList = buildTemplateSubtaskList(template, isExpanded);
  if (subtaskList) {
    card.appendChild(subtaskList);
  }

  return card;
}

function ensureTemplateSortableStyles() {
  if (document.getElementById(TEMPLATE_SORTABLE_STYLE_ID)) {return;}
  const style = document.createElement("style");
  style.id = TEMPLATE_SORTABLE_STYLE_ID;
  style.setAttribute("data-test-skedpal", "task-template-sortable-styles");
  style.textContent = `
.template-sortable-ghost { opacity: 0.55; }
.template-sortable-drag { opacity: 0.9; }
.template-sortable-chosen {
  box-shadow: 0 10px 25px rgba(var(--color-lime-400-rgb), 0.25);
  outline: 2px solid rgba(var(--color-lime-400-rgb), 0.35);
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

function destroyTemplateSortables() {
  templateSortableInstances.forEach((instance) => instance?.destroy?.());
  templateSortableInstances = [];
}

function collectTemplateCards(list) {
  return [...(list?.querySelectorAll?.(":scope > [data-template-id]") || [])];
}

async function handleTemplateListSortEnd(event) {
  if (!event?.to || (event.from === event.to && event.oldIndex === event.newIndex)) {return;}
  const list = event.to;
  const cards = collectTemplateCards(list);
  if (!cards.length) {return;}
  const templatesById = new Map(
    (state.taskTemplatesCache || []).map((template) => [template.id, template])
  );
  const updates = [];
  cards.forEach((card, index) => {
    const templateId = card.dataset.templateId;
    if (!templateId) {return;}
    const template = templatesById.get(templateId);
    if (!template) {return;}
    const order = index + 1;
    if (getTemplateOrder(template) !== order) {
      updates.push({ ...template, order });
    }
  });
  if (!updates.length) {return;}
  await Promise.all(updates.map((template) => saveTaskTemplate(template)));
  await loadTaskTemplates();
  window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
}

function getTemplateSubtaskList(card) {
  return card?.querySelector?.("[data-template-subtask-list]") || null;
}

function buildSubtaskOrderFromDom(container, template, parentId, store) {
  const nodes = [...(container?.children || [])].filter(
    (node) => node?.dataset?.templateSubtaskNode === "true"
  );
  nodes.forEach((node) => {
    const subtaskId = node.dataset.subtaskId;
    if (!subtaskId) {return;}
    const original = store.subtasksById.get(subtaskId);
    if (!original) {return;}
    const desiredParentId = parentId || null;
    const updated =
      (original.subtaskParentId || null) === desiredParentId
        ? original
        : { ...original, subtaskParentId: desiredParentId };
    store.nextSubtasks.push(updated);
    const childContainer = node.querySelector(":scope > [data-template-subtask-container]");
    if (childContainer) {
      buildSubtaskOrderFromDom(childContainer, template, subtaskId, store);
    }
  });
}

function buildTemplateSubtasksFromDom(card, template) {
  const list = getTemplateSubtaskList(card);
  if (!list) {return Array.isArray(template.subtasks) ? template.subtasks : [];}
  const subtasksById = new Map(
    (template.subtasks || []).map((subtask) => [subtask.id, subtask])
  );
  const store = { subtasksById, nextSubtasks: [] };
  buildSubtaskOrderFromDom(list, template, "", store);
  return store.nextSubtasks;
}

function hasSubtaskOrderChanged(currentSubtasks, nextSubtasks) {
  if (currentSubtasks.length !== nextSubtasks.length) {return true;}
  for (let i = 0; i < currentSubtasks.length; i += 1) {
    const current = currentSubtasks[i];
    const next = nextSubtasks[i];
    if (current?.id !== next?.id) {return true;}
    if ((current?.subtaskParentId || null) !== (next?.subtaskParentId || null)) {return true;}
  }
  return false;
}

function isSubtaskMoveValid(event) {
  const dragged = event?.dragged;
  const targetContainer = event?.to;
  if (!dragged || !targetContainer) {return true;}
  return !dragged.contains(targetContainer);
}

async function handleTemplateSubtaskSortEnd(event) {
  if (!event?.to) {return;}
  if (event.from === event.to && event.oldIndex === event.newIndex) {return;}
  const container = event.to;
  const card = getTemplateCardFromNode(container);
  const templateId = card?.dataset?.templateId || "";
  if (!templateId || !card) {return;}
  const template = findTemplateById(templateId);
  if (!template) {return;}
  const nextSubtasks = buildTemplateSubtasksFromDom(card, template);
  if (!hasSubtaskOrderChanged(template.subtasks || [], nextSubtasks)) {return;}
  await saveTaskTemplate({ ...template, subtasks: nextSubtasks });
  await loadTaskTemplates();
  window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
}

function setupTemplateSortables(list) {
  destroyTemplateSortables();
  if (!list || typeof list.addEventListener !== "function") {return;}
  if (typeof window === "undefined" || typeof document === "undefined") {return;}
  ensureTemplateSortableStyles();
  const listSortable = new Sortable(list, {
    animation: 150,
    draggable: "[data-template-id]",
    handle: "[data-template-drag-handle]",
    ghostClass: "template-sortable-ghost",
    chosenClass: "template-sortable-chosen",
    dragClass: "template-sortable-drag",
    swapThreshold: 0.65,
    onEnd: handleTemplateListSortEnd
  });
  templateSortableInstances.push(listSortable);
  const containers = list.querySelectorAll("[data-template-subtask-container]");
  containers.forEach((container) => {
    const sortable = new Sortable(container, {
      group: {
        name: `template-subtasks-${container.dataset.templateId || "default"}`,
        pull: true,
        put: true
      },
      animation: 150,
      draggable: "[data-template-subtask-node]",
      handle: "[data-template-subtask-drag-handle]",
      ghostClass: "template-sortable-ghost",
      chosenClass: "template-sortable-chosen",
      dragClass: "template-sortable-drag",
      swapThreshold: 0.65,
      onMove: isSubtaskMoveValid,
      onEnd: handleTemplateSubtaskSortEnd
    });
    templateSortableInstances.push(sortable);
  });
}

export function renderTaskTemplates() {
  const list = domRefs.taskTemplateList;
  if (!list) {return;}
  const expandedIds = getExpandedTemplateIds(list);
  list.innerHTML = "";
  const templates = sortTemplates(state.taskTemplatesCache || []);
  if (!templates.length) {
    renderEmptyTemplateList(list);
    destroyTemplateSortables();
    return;
  }
  const fragment = document.createDocumentFragment();
  templates.forEach((template) => {
    const isExpanded = expandedIds.has(template.id || "");
    fragment.appendChild(buildTemplateCard(template, isExpanded));
  });
  list.appendChild(fragment);
  setupTemplateSortables(list);
}

export async function loadTaskTemplates() {
  const templates = await getAllTaskTemplates();
  state.taskTemplatesCache = Array.isArray(templates) ? templates : [];
  renderTaskTemplates();
  window.dispatchEvent(new CustomEvent("skedpal:templates-loaded"));
}

async function handleTemplateDelete(templateId) {
  if (!templateId) {return;}
  await deleteTaskTemplate(templateId);
  await loadTaskTemplates();
  window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
}

function findTemplateById(templateId) {
  return (state.taskTemplatesCache || []).find((template) => template.id === templateId) || null;
}

function findTemplateSubtask(templateId, subtaskId) {
  const template = findTemplateById(templateId);
  if (!template) {return { template: null, subtask: null };}
  const subtask = (template.subtasks || []).find((entry) => entry.id === subtaskId) || null;
  return { template, subtask };
}

const templateClickHandlers = [
  {
    when: (btn) => Boolean(btn.dataset.templateToggleSubtasks),
    run: (btn) => {
      const card = btn.closest?.("[data-template-id]");
      toggleTemplateSubtaskList(card, btn);
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateEdit),
    run: (btn) => {
      const template = findTemplateById(btn.dataset.templateEdit);
      if (template) {
        openTemplateEditor(template);
      }
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateDelete),
    run: (btn) => {
      void handleTemplateDelete(btn.dataset.templateDelete);
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateAddSubtask),
    run: (btn) => {
      const template = findTemplateById(btn.dataset.templateAddSubtask);
      if (template) {
        openTemplateSubtaskEditor(template, null);
      }
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateAddChildSubtask && btn.dataset.templateId),
    run: (btn) => {
      const template = findTemplateById(btn.dataset.templateId);
      if (template) {
        openTemplateSubtaskEditor(template, null, btn.dataset.templateAddChildSubtask);
      }
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateSubtaskEdit && btn.dataset.templateId),
    run: (btn) => {
      const { template, subtask } = findTemplateSubtask(
        btn.dataset.templateId,
        btn.dataset.templateSubtaskEdit
      );
      if (template && subtask) {
        openTemplateSubtaskEditor(template, subtask);
      }
    }
  },
  {
    when: (btn) => Boolean(btn.dataset.templateSubtaskDelete && btn.dataset.templateId),
    run: (btn) => {
      const template = findTemplateById(btn.dataset.templateId);
      if (!template) {return;}
      const toRemove = collectTemplateDescendantIds(
        template.subtasks || [],
        btn.dataset.templateSubtaskDelete
      );
      const nextSubtasks = (template.subtasks || []).filter(
        (entry) => !entry.id || !toRemove.has(entry.id)
      );
      const updated = { ...template, subtasks: nextSubtasks };
      void saveTaskTemplate(updated).then(() => {
        window.dispatchEvent(new CustomEvent("skedpal:templates-updated"));
      });
    }
  }
];

function handleTemplateListClick(event) {
  const btn = event.target.closest("button");
  if (!btn) {return;}
  const match = templateClickHandlers.find((handler) => handler.when(btn));
  if (!match) {return;}
  match.run(btn);
}

export function initTaskTemplates() {
  const { taskTemplateNewBtn, taskTemplateList, taskTemplateToggleBtn, taskTemplateListWrap } = domRefs;
  const cleanupFns = [];
  const handleNewClick = () => openTemplateEditor(null);
  if (taskTemplateNewBtn) {
    taskTemplateNewBtn.addEventListener("click", handleNewClick);
    cleanupFns.push(() => taskTemplateNewBtn.removeEventListener("click", handleNewClick));
  }
  const handleToggleClick = () => {
    if (!taskTemplateListWrap || !taskTemplateToggleBtn) {return;}
    const isHidden = taskTemplateListWrap.classList.toggle("hidden");
    taskTemplateToggleBtn.textContent = isHidden ? "Expand" : "Collapse";
    taskTemplateToggleBtn.setAttribute("aria-expanded", String(!isHidden));
  };
  if (taskTemplateToggleBtn) {
    taskTemplateToggleBtn.addEventListener("click", handleToggleClick);
    cleanupFns.push(() => taskTemplateToggleBtn.removeEventListener("click", handleToggleClick));
  }
  if (taskTemplateList) {
    taskTemplateList.addEventListener("click", handleTemplateListClick);
    cleanupFns.push(() => taskTemplateList.removeEventListener("click", handleTemplateListClick));
  }
  const handleTemplatesUpdated = () => {
    void loadTaskTemplates();
  };
  window.addEventListener("skedpal:templates-updated", handleTemplatesUpdated);
  cleanupFns.push(() => window.removeEventListener("skedpal:templates-updated", handleTemplatesUpdated));
  return () => {
    destroyTemplateSortables();
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
