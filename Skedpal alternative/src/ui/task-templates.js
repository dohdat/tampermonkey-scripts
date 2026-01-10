import {
  getAllTaskTemplates,
  saveTaskTemplate,
  deleteTaskTemplate
} from "../data/db.js";
import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { openTemplateEditor, openTemplateSubtaskEditor } from "./tasks/tasks-actions.js";

function getTemplateTitle(template) {
  return template?.title || "Untitled template";
}

function sortTemplates(list) {
  return [...list].sort((a, b) => getTemplateTitle(a).localeCompare(getTemplateTitle(b)));
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
    "flex flex-wrap items-center justify-between gap-2 rounded-xl border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200";
  row.setAttribute("data-test-skedpal", "task-template-subtask-row");
  row.dataset.templateId = templateId;
  row.dataset.subtaskId = subtask.id || "";

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
  row.appendChild(label);
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
    parentContainer.appendChild(buildSubtaskRow(subtask, templateId));
    const children = childrenByParent.get(subtask.id) || [];
    if (!children.length) {return;}
    const childWrap = document.createElement("div");
    childWrap.className = "ml-4 space-y-2 border-l border-slate-800/60 pl-4";
    childWrap.setAttribute("data-test-skedpal", "task-template-subtask-children");
    childWrap.dataset.parentSubtaskId = subtask.id || "";
    parentContainer.appendChild(childWrap);
    children.forEach((child) => appendSubtask(child, childWrap));
  };
  roots.forEach((subtask) => appendSubtask(subtask, container));
}

function buildTemplateCard(template) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border-slate-800 bg-slate-900/70 p-4 shadow space-y-3";
  card.setAttribute("data-test-skedpal", "task-template-card");
  card.dataset.templateId = template.id || "";

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", "task-template-header");

  const titleWrap = document.createElement("div");
  titleWrap.className = "flex flex-wrap items-center gap-2";
  titleWrap.setAttribute("data-test-skedpal", "task-template-title-wrap");
  const title = document.createElement("span");
  title.className = "text-base font-semibold text-slate-100";
  title.textContent = getTemplateTitle(template);
  title.setAttribute("data-test-skedpal", "task-template-title");
  const count = document.createElement("span");
  count.className =
    "rounded-full border-slate-700 bg-slate-800/70 px-2 py-1 text-xs font-semibold text-slate-200";
  const subtaskCount = (template.subtasks || []).length;
  count.textContent = `${subtaskCount} ${subtaskCount === 1 ? "subtask" : "subtasks"}`;
  count.setAttribute("data-test-skedpal", "task-template-subtask-count");
  titleWrap.appendChild(title);
  titleWrap.appendChild(count);

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
  header.appendChild(titleWrap);
  header.appendChild(actions);
  card.appendChild(header);

  if (Array.isArray(template.subtasks) && template.subtasks.length) {
    const subtaskList = document.createElement("div");
    subtaskList.className = "grid gap-2";
    subtaskList.setAttribute("data-test-skedpal", "task-template-subtask-list");
    renderSubtaskTree(subtaskList, template.id, template.subtasks);
    card.appendChild(subtaskList);
  }

  return card;
}

export function renderTaskTemplates() {
  const list = domRefs.taskTemplateList;
  if (!list) {return;}
  list.innerHTML = "";
  const templates = sortTemplates(state.taskTemplatesCache || []);
  if (!templates.length) {
    renderEmptyTemplateList(list);
    return;
  }
  const fragment = document.createDocumentFragment();
  templates.forEach((template) => fragment.appendChild(buildTemplateCard(template)));
  list.appendChild(fragment);
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
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
