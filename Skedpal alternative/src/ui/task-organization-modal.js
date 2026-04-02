import { getAllTasks, saveTask } from "../data/db.js";
import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { handleAddSubsection } from "./sections.js";
import { loadTasks } from "./tasks/tasks-actions.js";
import { computeSubsectionPrioritySortUpdates } from "./tasks/tasks.js";

function getModalRefs() {
  return {
    taskOrganizationModal:
      domRefs.taskOrganizationModal || document.getElementById("task-organization-modal"),
    taskOrganizationModalTitle:
      domRefs.taskOrganizationModalTitle ||
      document.getElementById("task-organization-modal-title"),
    taskOrganizationModalSubtitle:
      domRefs.taskOrganizationModalSubtitle ||
      document.getElementById("task-organization-modal-subtitle"),
    taskOrganizationModalStatus:
      domRefs.taskOrganizationModalStatus ||
      document.getElementById("task-organization-modal-status"),
    taskOrganizationModalOutput:
      domRefs.taskOrganizationModalOutput ||
      document.getElementById("task-organization-modal-output")
  };
}

function resolveSubsectionName(sectionId, subsectionId, settings = state.settingsCache) {
  if (!sectionId || !subsectionId) {return "";}
  const list = settings?.subsections?.[sectionId] || [];
  const match = list.find((entry) => entry.id === subsectionId);
  return match?.name || "";
}

function buildPanelUi(panel) {
  if (!panel) {return null;}
  panel.innerHTML = "";
  panel.classList.add(
    "hidden",
    "space-y-2",
    "rounded-xl",
    "border",
    "border-slate-800/70",
    "bg-slate-950/60",
    "p-3"
  );

  const status = document.createElement("div");
  status.className = "text-xs text-slate-400";
  status.setAttribute("data-test-skedpal", "task-organization-status");

  const output = document.createElement("div");
  output.classList.add("hidden");
  output.setAttribute("data-test-skedpal", "task-organization-output");

  panel.appendChild(status);
  panel.appendChild(output);

  return { kind: "panel", panel, status, output };
}

function buildModalUi(scopeLabel = "") {
  const {
    taskOrganizationModal,
    taskOrganizationModalTitle,
    taskOrganizationModalSubtitle,
    taskOrganizationModalStatus,
    taskOrganizationModalOutput
  } = getModalRefs();
  if (!taskOrganizationModal || !taskOrganizationModalStatus || !taskOrganizationModalOutput) {
    return null;
  }
  if (taskOrganizationModalTitle) {
    taskOrganizationModalTitle.textContent = `Review task placement${scopeLabel ? `: ${scopeLabel}` : ""}`;
  }
  if (taskOrganizationModalSubtitle) {
    taskOrganizationModalSubtitle.textContent = scopeLabel
      ? `Accept to move a task inside ${scopeLabel}, or reject to dismiss the suggestion.`
      : "Accept to move a task, or reject to dismiss the suggestion.";
  }
  return {
    kind: "modal",
    panel: taskOrganizationModal,
    status: taskOrganizationModalStatus,
    output: taskOrganizationModalOutput
  };
}

export function getUiTargets(scopeLabel, panel = null) {
  const panelUi = buildPanelUi(panel);
  const modalUi = buildModalUi(scopeLabel);
  return [modalUi, panelUi].filter(Boolean);
}

function withUiTargets(uiTargets, callback) {
  uiTargets.forEach((ui) => {
    if (ui) {
      callback(ui);
    }
  });
}

export function setStatus(uiTargets, message, variant = "info") {
  withUiTargets(uiTargets, (ui) => {
    if (!ui?.status) {return;}
    if (!message) {
      ui.status.textContent = "";
      delete ui.status.dataset.variant;
      if (ui.kind === "panel") {
        ui.panel.classList.add("hidden");
      }
      return;
    }
    ui.status.textContent = message;
    ui.status.dataset.variant = variant;
    if (ui.kind === "panel") {
      ui.panel.classList.remove("hidden");
    }
  });
}

export function clearOutput(uiTargets) {
  withUiTargets(uiTargets, (ui) => {
    if (!ui?.output) {return;}
    ui.output.innerHTML = "";
    ui.output.classList.add("hidden");
  });
}

function buildPlacementLabel(sectionName, subsectionName, parentSubsectionName = "") {
  if (sectionName && parentSubsectionName && subsectionName) {
    return `${sectionName} / ${parentSubsectionName} / ${subsectionName}`;
  }
  if (sectionName && subsectionName) {
    return `${sectionName} / ${subsectionName}`;
  }
  return sectionName || "No section";
}

function buildSuggestionActionButtonClass(variant) {
  const baseClass = [
    "inline-flex",
    "items-center",
    "justify-center",
    "rounded-full",
    "border",
    "px-2.5",
    "py-1",
    "text-[11px]",
    "font-semibold",
    "leading-none",
    "transition",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50"
  ];
  if (variant === "accept") {
    return [
      ...baseClass,
      "border-lime-400/60",
      "bg-lime-400/10",
      "text-lime-200",
      "hover:border-lime-400",
      "hover:bg-lime-400/20"
    ].join(" ");
  }
  return [
    ...baseClass,
    "border-slate-700",
    "bg-slate-900/60",
    "text-slate-300",
    "hover:border-orange-400",
    "hover:text-orange-300"
  ].join(" ");
}

function buildSuggestionItem(suggestion, index, includeActions) {
  const item = document.createElement("div");
  item.className = "rounded-xl border border-slate-800 bg-slate-950/60 p-3 shadow-sm";
  item.setAttribute("data-test-skedpal", `task-organization-item-${index}`);
  item.dataset.taskOrganizationItem = suggestion.taskId;

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", `task-organization-header-${index}`);

  const title = document.createElement("div");
  title.className = "text-sm font-semibold text-slate-100";
  title.textContent = suggestion.taskTitle;
  title.setAttribute("data-test-skedpal", `task-organization-task-title-${index}`);
  header.appendChild(title);

  if (suggestion.createSubsection && suggestion.suggestedSubsectionName) {
    const badge = document.createElement("span");
    badge.className = "rounded-full border border-lime-400/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-300";
    badge.textContent = "Create subsection";
    badge.setAttribute("data-test-skedpal", `task-organization-badge-${index}`);
    header.appendChild(badge);
  }

  const current = document.createElement("div");
  current.className = "mt-2 text-xs text-slate-400";
  current.textContent = `Current: ${buildPlacementLabel(
    suggestion.currentSectionName,
    suggestion.currentSubsectionName
  )}`;
  current.setAttribute("data-test-skedpal", `task-organization-current-${index}`);

  const suggested = document.createElement("div");
  suggested.className = "mt-1 text-xs text-lime-300";
  suggested.textContent = `Suggested: ${buildPlacementLabel(
    suggestion.suggestedSectionName,
    suggestion.suggestedSubsectionName,
    suggestion.suggestedParentSubsectionName || ""
  )}`;
  suggested.setAttribute("data-test-skedpal", `task-organization-suggested-${index}`);

  item.appendChild(header);
  item.appendChild(current);
  item.appendChild(suggested);

  if (suggestion.reason) {
    const reason = document.createElement("div");
    reason.className = "mt-2 text-xs text-slate-400";
    reason.textContent = suggestion.reason;
    reason.setAttribute("data-test-skedpal", `task-organization-reason-${index}`);
    item.appendChild(reason);
  }

  if (includeActions) {
    const actions = document.createElement("div");
    actions.className = "mt-2 flex flex-wrap items-center justify-end gap-1.5";
    actions.setAttribute("data-test-skedpal", `task-organization-actions-${index}`);

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = buildSuggestionActionButtonClass("accept");
    acceptBtn.textContent = "Accept";
    acceptBtn.dataset.taskOrganizationAction = "accept";
    acceptBtn.dataset.taskId = suggestion.taskId;
    acceptBtn.disabled = state.taskOrganizationBusy;
    acceptBtn.setAttribute("data-test-skedpal", `task-organization-accept-${index}`);

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = buildSuggestionActionButtonClass("reject");
    rejectBtn.textContent = "Reject";
    rejectBtn.dataset.taskOrganizationAction = "reject";
    rejectBtn.dataset.taskId = suggestion.taskId;
    rejectBtn.disabled = state.taskOrganizationBusy;
    rejectBtn.setAttribute("data-test-skedpal", `task-organization-reject-${index}`);

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    item.appendChild(actions);
  }

  return item;
}

export function renderSuggestions(uiTargets, suggestions) {
  withUiTargets(uiTargets, (ui) => {
    if (!ui?.output) {return;}
    ui.output.innerHTML = "";
    const list = document.createElement("div");
    list.className = "grid gap-2";
    list.setAttribute("data-test-skedpal", "task-organization-list");
    suggestions.forEach((suggestion, index) => {
      list.appendChild(buildSuggestionItem(suggestion, index, ui.kind === "modal"));
    });
    ui.output.appendChild(list);
    ui.output.classList.remove("hidden");
    if (ui.kind === "panel") {
      ui.panel.classList.remove("hidden");
    }
  });
}

export function renderRawResponse(uiTargets, text) {
  withUiTargets(uiTargets, (ui) => {
    if (!ui?.output) {return;}
    ui.output.innerHTML = "";
    const pre = document.createElement("pre");
    pre.className = "task-ai-raw";
    pre.textContent = text || "No response";
    pre.setAttribute("data-test-skedpal", "task-organization-raw");
    ui.output.appendChild(pre);
    ui.output.classList.remove("hidden");
    if (ui.kind === "panel") {
      ui.panel.classList.remove("hidden");
    }
  });
}

export function clearTaskOrganizationState() {
  state.taskOrganizationSuggestions = [];
  state.taskOrganizationRawOutput = "";
  state.taskOrganizationBusy = false;
}

export function storeTaskOrganizationSuggestions(suggestions, scopeLabel) {
  state.taskOrganizationSuggestions = suggestions;
  state.taskOrganizationRawOutput = "";
  state.taskOrganizationScopeLabel = scopeLabel;
}

export function renderTaskOrganizationModalState() {
  const modalUi = buildModalUi(state.taskOrganizationScopeLabel);
  if (!modalUi) {return;}
  clearOutput([modalUi]);
  if (state.taskOrganizationRawOutput) {
    renderRawResponse([modalUi], state.taskOrganizationRawOutput);
    return;
  }
  if (!state.taskOrganizationSuggestions.length) {
    const empty = document.createElement("div");
    empty.className = "rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400";
    empty.textContent = "No pending suggestions.";
    empty.setAttribute("data-test-skedpal", "task-organization-empty");
    modalUi.output.appendChild(empty);
    modalUi.output.classList.remove("hidden");
    return;
  }
  renderSuggestions([modalUi], state.taskOrganizationSuggestions);
}

export function openTaskOrganizationModal(scopeLabel = "") {
  const modalUi = buildModalUi(scopeLabel);
  if (!modalUi?.panel) {return false;}
  modalUi.panel.classList.remove("hidden");
  document.body.classList.add("modal-open");
  return true;
}

export function closeTaskOrganizationModal() {
  const { taskOrganizationModal } = getModalRefs();
  if (taskOrganizationModal) {
    taskOrganizationModal.classList.add("hidden");
  }
  document.body.classList.remove("modal-open");
  state.taskOrganizationBusy = false;
}

async function reloadTasksForTaskOrganization() {
  const testOverride = globalThis?.__skedpalTestLoadTasks;
  if (typeof testOverride === "function") {
    await testOverride();
    return;
  }
  await loadTasks();
}

function resolveSectionByName(sectionName) {
  const normalized = (sectionName || "").trim().toLowerCase();
  return (state.settingsCache.sections || []).find(
    (section) => (section?.name || "").trim().toLowerCase() === normalized
  ) || null;
}

function resolveSubsectionByName(sectionId, subsectionName) {
  const normalized = (subsectionName || "").trim().toLowerCase();
  if (!sectionId || !normalized) {return null;}
  return (state.settingsCache.subsections?.[sectionId] || []).find(
    (subsection) => (subsection?.name || "").trim().toLowerCase() === normalized
  ) || null;
}

function resolveClosestParentSubsectionId(sectionId, task) {
  if (!sectionId || !task?.subsection || task.section !== sectionId) {return "";}
  const subsection = (state.settingsCache.subsections?.[sectionId] || []).find(
    (entry) => entry.id === task.subsection
  );
  return subsection?.parentId || "";
}

async function ensureSuggestedSubsection(sectionId, suggestion, task = null) {
  const subsectionName = suggestion?.suggestedSubsectionName || "";
  if (!subsectionName) {return "";}
  const existing = resolveSubsectionByName(sectionId, subsectionName);
  if (existing?.id) {return existing.id;}
  const parentSubsectionId = resolveSubsectionByName(
    sectionId,
    suggestion?.suggestedParentSubsectionName || ""
  )?.id || resolveClosestParentSubsectionId(sectionId, task);
  const created = await handleAddSubsection(sectionId, subsectionName, parentSubsectionId);
  if (created?.id) {return created.id;}
  return resolveSubsectionByName(sectionId, subsectionName)?.id || "";
}

function buildSuggestionPlacement(sectionId, sectionName, subsectionId) {
  const subsection = subsectionId
    ? (state.settingsCache.subsections?.[sectionId] || []).find((entry) => entry.id === subsectionId) || null
    : null;
  const subsectionName = subsection?.name || "";
  const parentSubsectionName = subsection?.parentId
    ? resolveSubsectionName(sectionId, subsection.parentId, state.settingsCache)
    : "";
  return buildPlacementLabel(sectionName, subsectionName, parentSubsectionName);
}

async function applyTaskOrganizationSuggestion(suggestion) {
  const section = resolveSectionByName(suggestion?.suggestedSectionName || "");
  if (!section?.id) {
    throw new Error(`Missing section "${suggestion?.suggestedSectionName || ""}"`);
  }
  const tasks = await getAllTasks();
  const task = tasks.find((entry) => entry.id === suggestion?.taskId);
  if (!task) {
    return { task: null, placementLabel: buildPlacementLabel(section.name, ""), autoSorted: false };
  }
  let subsectionId = "";
  if (suggestion?.suggestedSubsectionName) {
    subsectionId = await ensureSuggestedSubsection(section.id, suggestion, task);
  }
  await saveTask({
    ...task,
    section: section.id,
    subsection: subsectionId
  });
  let autoSorted = false;
  if (subsectionId) {
    const refreshedTasks = await getAllTasks();
    const { updates, changed } = computeSubsectionPrioritySortUpdates(
      refreshedTasks,
      section.id,
      subsectionId
    );
    if (changed) {
      await Promise.all(updates.map((entry) => saveTask(entry)));
      autoSorted = true;
    }
  }
  await reloadTasksForTaskOrganization();
  return {
    task,
    placementLabel: buildSuggestionPlacement(section.id, section.name, subsectionId),
    autoSorted
  };
}

function removeTaskOrganizationSuggestion(taskId) {
  state.taskOrganizationSuggestions = state.taskOrganizationSuggestions.filter(
    (suggestion) => suggestion.taskId !== taskId
  );
}

function findTaskOrganizationSuggestion(taskId) {
  return state.taskOrganizationSuggestions.find((suggestion) => suggestion.taskId === taskId) || null;
}

function setTaskOrganizationBusy(isBusy) {
  state.taskOrganizationBusy = isBusy;
  renderTaskOrganizationModalState();
}

async function acceptTaskOrganizationSuggestion(taskId) {
  const suggestion = findTaskOrganizationSuggestion(taskId);
  if (!suggestion) {return false;}
  setTaskOrganizationBusy(true);
  try {
    setStatus([buildModalUi(state.taskOrganizationScopeLabel)].filter(Boolean), `Applying suggestion for ${suggestion.taskTitle}...`, "loading");
    const result = await applyTaskOrganizationSuggestion(suggestion);
    removeTaskOrganizationSuggestion(taskId);
    renderTaskOrganizationModalState();
    if (!result.task) {
      setStatus(
        [buildModalUi(state.taskOrganizationScopeLabel)].filter(Boolean),
        `Task "${suggestion.taskTitle}" no longer exists. Removed the suggestion.`,
        "info"
      );
      return true;
    }
    const remaining = state.taskOrganizationSuggestions.length;
    const autoSortSuffix = result.autoSorted ? " Auto-sorted destination tasks by priority." : "";
    setStatus(
      [buildModalUi(state.taskOrganizationScopeLabel)].filter(Boolean),
      `Moved "${suggestion.taskTitle}" to ${result.placementLabel}. ${remaining} suggestion${remaining === 1 ? "" : "s"} remaining.${autoSortSuffix}`,
      "success"
    );
    return true;
  } finally {
    setTaskOrganizationBusy(false);
  }
}

function rejectTaskOrganizationSuggestion(taskId) {
  const suggestion = findTaskOrganizationSuggestion(taskId);
  if (!suggestion) {return false;}
  removeTaskOrganizationSuggestion(taskId);
  renderTaskOrganizationModalState();
  const remaining = state.taskOrganizationSuggestions.length;
  setStatus(
    [buildModalUi(state.taskOrganizationScopeLabel)].filter(Boolean),
    `Rejected "${suggestion.taskTitle}". ${remaining} suggestion${remaining === 1 ? "" : "s"} remaining.`,
    "info"
  );
  return true;
}

export async function handleTaskOrganizationModalClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest?.("[data-task-organization-action]");
  if (!button) {return false;}
  const action = button.dataset.taskOrganizationAction || "";
  const taskId = button.dataset.taskId || "";
  if (!taskId) {return false;}
  if (action === "accept") {
    await acceptTaskOrganizationSuggestion(taskId);
    return true;
  }
  if (action === "reject") {
    rejectTaskOrganizationSuggestion(taskId);
    return true;
  }
  return false;
}

export function resetTaskOrganizationScopePanel(panel = null) {
  const ui = buildPanelUi(panel);
  if (!ui) {return false;}
  clearOutput([ui]);
  setStatus([ui], "");
  return true;
}
