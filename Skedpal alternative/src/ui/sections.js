import { getAllTasks, saveSettings, saveTask } from "../data/db.js";
import { domRefs } from "./constants.js";
import {
  applyFavoriteOrder,
  buildFavoriteKey,
  getNextFavoriteOrder,
  toggleFavoriteById
} from "./favorites.js";
import { getSectionColorMap, isStartAfterDeadline, normalizeSubtaskScheduleMode, uuid } from "./utils.js";
import { state } from "./state/page-state.js";
import { repeatStore, setRepeatFromSelection, syncSubsectionRepeatLabel } from "./repeat.js";
import { renderTimeMapOptions, collectSelectedValues } from "./time-maps.js";
import { themeColors } from "./theme.js";

const {
  sectionList,
  sectionInput,
  sectionFormRow,
  sectionFormToggle,
  subsectionFormWrap,
  subsectionSectionIdInput,
  subsectionParentIdInput,
  subsectionNameInput,
  subsectionTaskTitleInput,
  subsectionTaskLinkInput,
  subsectionTaskDurationInput,
  subsectionTaskMinBlockInput,
  subsectionTaskPriorityInput,
  subsectionTaskDeadlineInput,
  subsectionTaskStartFromInput,
  subsectionTaskRepeatSelect,
  subsectionTaskSubtaskScheduleSelect,
  subsectionTimeMapOptions,
  sidebarFavorites
} = domRefs;

let editingSubsectionId = "";
let editingSectionId = "";

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

export async function ensureDefaultSectionsPresent() {
  const defaults = [
    { id: "section-work-default", name: "Work", favorite: false },
    { id: "section-personal-default", name: "Personal", favorite: false }
  ];
  let sections = [...(state.settingsCache.sections || [])];
  const subsections = { ...(state.settingsCache.subsections || {}) };
  let changed = false;
  defaults.forEach((def) => {
    const idx = sections.findIndex((s) => s.id === def.id);
    if (idx >= 0) {
      const current = sections[idx];
      if (!current.name) {
        sections[idx] = { ...current, name: def.name };
        changed = true;
      }
    } else {
      sections.push(def);
      changed = true;
    }
    if (!Array.isArray(subsections[def.id])) {
      subsections[def.id] = [];
      changed = true;
    }
  });
  if (changed) {
    state.settingsCache = { ...state.settingsCache, sections, subsections };
    await saveSettings(state.settingsCache);
  }
  return state.settingsCache.sections;
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

export function renderSections() {
  sectionList.innerHTML = "";
  (state.settingsCache.sections || []).forEach((section) => {
    const isDefault =
      section.id === "section-work-default" || section.id === "section-personal-default";
    const chip = document.createElement("div");
    chip.className =
      "flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200";
    chip.setAttribute("data-test-skedpal", "section-chip");
    const label = document.createElement("span");
    label.textContent = getSectionName(section.id) || section.name;
    label.setAttribute("data-test-skedpal", "section-chip-name");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.dataset.removeSection = section.id;
    removeBtn.className =
      "h-5 w-5 rounded-full border border-slate-700 text-[10px] font-bold text-slate-300 hover:border-orange-400 hover:text-orange-300";
    removeBtn.setAttribute("data-test-skedpal", "section-remove-btn");
    removeBtn.textContent = "x";
    if (isDefault) {
      removeBtn.classList.add("hidden");
    }
    chip.appendChild(label);
    chip.appendChild(removeBtn);
    sectionList.appendChild(chip);
  });
}

export function openSectionForm() {
  if (sectionFormRow) {
    sectionFormRow.classList.remove("hidden");
  }
  if (sectionFormToggle) {
    sectionFormToggle.textContent = "Hide section form";
  }
  sectionInput?.focus();
}

export function closeSectionForm() {
  if (sectionFormRow) {
    sectionFormRow.classList.add("hidden");
  }
  if (sectionFormToggle) {
    sectionFormToggle.textContent = "Add section";
  }
  if (sectionInput) {
    sectionInput.value = "";
  }
}

export function renderTaskSectionOptions(selected) {
  const sections = [...(state.settingsCache.sections || [])];
  const selectedSection = selected
    ? sections.find((s) => s.id === selected) || sections.find((s) => s.name === selected)
    : null;
  const { taskSectionSelect } = domRefs;
  taskSectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No section";
  if (!selectedSection) {noneOpt.selected = true;}
  taskSectionSelect.appendChild(noneOpt);
  sections.forEach((section) => {
    const opt = document.createElement("option");
    opt.value = section.id;
    opt.textContent = section.name;
    if (selectedSection) {opt.selected = selectedSection.id === section.id;}
    taskSectionSelect.appendChild(opt);
  });
  taskSectionSelect.disabled = false;
  renderTaskSubsectionOptions();
}

export function renderTaskSubsectionOptions(selected) {
  const { taskSectionSelect, taskSubsectionSelect } = domRefs;
  const section = taskSectionSelect.value;
  const subsections = section ? getSubsectionsFor(section) : [];
  const selectedSubsection =
    selected && section
      ? subsections.find((s) => s.id === selected) || subsections.find((s) => s.name === selected)
      : null;
  taskSubsectionSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "None";
  taskSubsectionSelect.appendChild(noneOpt);

  const addOptions = (parentId = "", depth = 0) => {
    const siblings = subsections.filter((s) => (s.parentId || "") === (parentId || ""));
    siblings.forEach((sub) => {
      const opt = document.createElement("option");
      opt.value = sub.id;
      const prefix = depth > 0 ? `${"-- ".repeat(depth)}` : "";
      opt.textContent = `${prefix}${sub.name}`;
      if (selectedSubsection) {opt.selected = selectedSubsection.id === sub.id;}
      taskSubsectionSelect.appendChild(opt);
      addOptions(sub.id, depth + 1);
    });
  };

  addOptions();
  if (!taskSubsectionSelect.value) {
    taskSubsectionSelect.value = "";
  }
}

export function getSubsectionTemplate(sectionId, subsectionId) {
  const subs = getSubsectionsFor(sectionId);
  const sub = subs.find((s) => s.id === subsectionId);
  return sub?.template || null;
}

export function openSubsectionModal(sectionId, parentId = "", existingSubsectionId = "") {
  const { subsectionFormWrap } = domRefs;
  if (!subsectionFormWrap) {return;}
  repeatStore.repeatTarget = "subsection";
  const subs = getSubsectionsFor(sectionId);
  const existing = subs.find((s) => s.id === existingSubsectionId);
  editingSubsectionId = existing ? existing.id : "";
  editingSectionId = sectionId;
  subsectionSectionIdInput.value = sectionId || "";
  subsectionParentIdInput.value = parentId || existing?.parentId || "";
  subsectionNameInput.value = existing?.name || "";
  const template = existing?.template || {
    title: "",
    link: "",
    durationMin: 30,
    minBlockMin: 30,
    priority: 3,
    deadline: "",
    startFrom: "",
    repeat: { type: "none" },
    timeMapIds: [],
    subtaskScheduleMode: "parallel"
  };
  subsectionTaskTitleInput.value = template.title || "";
  subsectionTaskLinkInput.value = template.link || "";
  subsectionTaskDurationInput.value = template.durationMin || 30;
  subsectionTaskMinBlockInput.value = template.minBlockMin || 30;
  subsectionTaskPriorityInput.value = String(template.priority || 3);
  subsectionTaskDeadlineInput.value = template.deadline ? template.deadline.slice(0, 10) : "";
  subsectionTaskStartFromInput.value = template.startFrom ? template.startFrom.slice(0, 10) : "";
  subsectionTaskRepeatSelect.value = template.repeat?.type === "custom" ? "custom" : "none";
  setRepeatFromSelection(template.repeat || { type: "none" }, "subsection");
  syncSubsectionRepeatLabel();
  if (subsectionTaskSubtaskScheduleSelect) {
    subsectionTaskSubtaskScheduleSelect.value = normalizeSubtaskScheduleMode(template.subtaskScheduleMode);
  }
  renderTimeMapOptions(subsectionTimeMapOptions, template.timeMapIds || [], state.tasksTimeMapsCache);
  subsectionFormWrap.classList.remove("hidden");
}

export async function handleAddSection() {
  const name = sectionInput.value.trim();
  if (!name) {return;}
  const sections = state.settingsCache.sections || [];
  if (sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    sectionInput.value = "";
    return;
  }
  const newSection = { id: uuid(), name, favorite: false };
  const updated = [...sections, newSection];
  const subsections = { ...(state.settingsCache.subsections || {}), [newSection.id]: [] };
  state.settingsCache = { ...state.settingsCache, sections: updated, subsections };
  await saveSettings(state.settingsCache);
  renderSections();
  renderFavoriteShortcuts();
  renderTaskSectionOptions(newSection.id);
  sectionInput.value = "";
  closeSectionForm();
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleRemoveSection(id) {
  if (id === "section-work-default" || id === "section-personal-default") {return;}
  const sections = state.settingsCache.sections || [];
  const nextSections = sections.filter((s) => s.id !== id);
  if (nextSections.length === sections.length) {return;}
  const target = sections.find((s) => s.id === id);
  const confirmRemove = confirm(
    `Delete section "${target?.name || "Untitled section"}" and clear its tasks' section/subsection?`
  );
  if (!confirmRemove) {return;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  delete subsections[id];
  state.settingsCache = { ...state.settingsCache, sections: nextSections, subsections };
  await saveSettings(state.settingsCache);
  const tasks = await getAllTasks();
  const updates = tasks
    .filter((t) => t.section === id)
    .map((t) => saveTask({ ...t, section: "", subsection: "" }));
  if (updates.length) {
    await Promise.all(updates);
  }
  renderSections();
  renderFavoriteShortcuts();
  renderTaskSectionOptions();
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleAddSubsection(sectionId, value, parentSubsectionId = "") {
  const name = value.trim();
  if (!sectionId || !name) {return;}
  if (
    isStartAfterDeadline(subsectionTaskStartFromInput?.value || "", subsectionTaskDeadlineInput?.value || "")
  ) {
    alert("Start from cannot be after deadline.");
    return;
  }
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const parentId = parentSubsectionId || "";
  if (
    list.some(
      (s) =>
        (s.parentId || "") === parentId &&
        s.name &&
        s.name.toLowerCase() === name.toLowerCase()
    )
  )
    {return;}
  const entry = {
    id: uuid(),
    name,
    favorite: false,
    parentId,
    template: {
      title: subsectionTaskTitleInput?.value || "",
      link: subsectionTaskLinkInput?.value || "",
      durationMin: Number(subsectionTaskDurationInput?.value) || 30,
      minBlockMin: Number(subsectionTaskMinBlockInput?.value) || 30,
      priority: Number(subsectionTaskPriorityInput?.value) || 3,
      deadline: subsectionTaskDeadlineInput?.value || "",
      repeat:
        repeatStore.subsectionRepeatSelection?.type && repeatStore.subsectionRepeatSelection.type !== "none"
          ? repeatStore.subsectionRepeatSelection
          : { type: "none" },
      startFrom: subsectionTaskStartFromInput?.value || "",
      timeMapIds: collectSelectedValues(subsectionTimeMapOptions) || [],
      subtaskScheduleMode: normalizeSubtaskScheduleMode(subsectionTaskSubtaskScheduleSelect?.value)
    }
  };
  subsections[sectionId] = [...list, entry];
  state.settingsCache = { ...state.settingsCache, subsections };
  await saveSettings(state.settingsCache);
  renderTaskSectionOptions(sectionId);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleRenameSection(sectionId) {
  const sections = state.settingsCache.sections || [];
  const section = sections.find((s) => s.id === sectionId);
  if (!section) {return;}
  const next = prompt("Rename section", section.name || "");
  if (next === null) {return;}
  const name = next.trim();
  if (!name || name.toLowerCase() === section.name.toLowerCase()) {return;}
  if (sections.some((s) => s.id !== sectionId && s.name.toLowerCase() === name.toLowerCase())) {return;}
  const updatedSections = sections.map((s) => (s.id === sectionId ? { ...s, name } : s));
  state.settingsCache = { ...state.settingsCache, sections: updatedSections };
  await saveSettings(state.settingsCache);
  renderSections();
  renderTaskSectionOptions(sectionId);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleRenameSubsection(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const target = list.find((s) => s.id === subsectionId);
  if (!target) {return;}
  const next = prompt("Rename subsection", target.name || "");
  if (next === null) {return;}
  const name = next.trim();
  if (!name || name.toLowerCase() === target.name.toLowerCase()) {return;}
  if (list.some((s) => s.id !== subsectionId && s.name.toLowerCase() === name.toLowerCase())) {return;}
  const updatedList = list.map((s) => (s.id === subsectionId ? { ...s, name } : s));
  subsections[sectionId] = updatedList;
  state.settingsCache = { ...state.settingsCache, subsections };
  await saveSettings(state.settingsCache);
  renderTaskSectionOptions(sectionId);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleRemoveSubsection(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const target = list.find((s) => s.id === subsectionId);
  const parentId = target?.parentId || "";
  const nextList = list
    .filter((s) => s.id !== subsectionId)
    .map((s) =>
      s.parentId === subsectionId
        ? { ...s, parentId }
        : s
    );
  if (nextList.length === list.length) {return;}
  const confirmRemove = confirm(
    `Delete subsection "${target?.name || "Untitled subsection"}" and move its tasks to the parent subsection?`
  );
  if (!confirmRemove) {return;}
  subsections[sectionId] = nextList;
  state.settingsCache = { ...state.settingsCache, subsections };
  await saveSettings(state.settingsCache);
  const tasks = await getAllTasks();
  const nextSubsectionId = parentId || "";
  const updates = tasks
    .filter((t) => t.section === sectionId && t.subsection === subsectionId)
    .map((t) => saveTask({ ...t, subsection: nextSubsectionId }));
  if (updates.length) {
    await Promise.all(updates);
  }
  renderTaskSectionOptions(sectionId);
  renderFavoriteShortcuts();
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleToggleSectionFavorite(sectionId) {
  const sections = state.settingsCache.sections || [];
  const nextOrder = getNextFavoriteOrder(state.settingsCache);
  const updatedSections = toggleFavoriteById(sections, sectionId, nextOrder);
  state.settingsCache = { ...state.settingsCache, sections: updatedSections };
  await saveSettings(state.settingsCache);
  renderSections();
  renderFavoriteShortcuts();
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleToggleSubsectionFavorite(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const nextOrder = getNextFavoriteOrder(state.settingsCache);
  const updatedList = toggleFavoriteById(list, subsectionId, nextOrder);
  subsections[sectionId] = updatedList;
  state.settingsCache = { ...state.settingsCache, subsections };
  await saveSettings(state.settingsCache);
  renderTaskSectionOptions(sectionId);
  renderFavoriteShortcuts();
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export function renderFavoriteShortcuts() {
  if (!sidebarFavorites) {return;}
  sidebarFavorites.innerHTML = "";
  sidebarFavorites.classList.remove("hidden");
  const sections = (state.settingsCache.sections || []).filter((s) => s.favorite);
  const sectionColorMap = getSectionColorMap(state.settingsCache.sections || []);
  const fallbackColor = {
    dot: themeColors.lime400,
    glow: themeColors.lime400Glow
  };
  const subsectionMap = state.settingsCache.subsections || {};
  const subsectionEntries = Object.entries(subsectionMap).flatMap(([sectionId, list]) =>
    (list || []).filter((s) => s.favorite).map((s) => ({ ...s, sectionId }))
  );
  const items = [
    ...sections.map((s) => ({
      type: "section",
      label: s.name || "Untitled section",
      sectionId: s.id,
      favoriteOrder: s.favoriteOrder,
      ...((sectionColorMap.get(s.id) || fallbackColor) ?? fallbackColor)
    })),
    ...subsectionEntries.map((sub) => ({
      type: "subsection",
      label: sub.name || "Untitled subsection",
      sectionId: sub.sectionId || "",
      subsectionId: sub.id,
      detail: getSectionName(sub.sectionId) || "No section",
      favoriteOrder: sub.favoriteOrder,
      ...((sectionColorMap.get(sub.sectionId) || fallbackColor) ?? fallbackColor)
    }))
  ].sort((a, b) => {
    const aOrder = Number.isFinite(a.favoriteOrder) ? a.favoriteOrder : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.favoriteOrder) ? b.favoriteOrder : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {return aOrder - bOrder;}
    return a.label.localeCompare(b.label);
  });

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "sidebar-fav-empty";
    empty.setAttribute("data-test-skedpal", "sidebar-fav-empty");
    empty.textContent = "No favorites yet";
    sidebarFavorites.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.setAttribute("data-test-skedpal", "sidebar-fav-row");
    li.setAttribute("data-fav-row", "true");
    li.dataset.favKey = buildFavoriteKey(item);
    li.draggable = true;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-fav-item";
    btn.setAttribute("data-test-skedpal", "sidebar-fav-button");
    btn.setAttribute("data-fav-button", "true");
    btn.dataset.favKey = buildFavoriteKey(item);
    btn.dataset.favJump = "true";
    btn.dataset.favType = item.type;
    btn.dataset.sectionId = item.sectionId || "";
    if (item.subsectionId) {btn.dataset.subsectionId = item.subsectionId;}
    btn.innerHTML = `
      <span class="sidebar-fav-dot" aria-hidden="true" data-test-skedpal="sidebar-fav-dot" style="background:${item.dot};box-shadow:0 0 0 2px ${item.glow};"></span>
      <span class="sidebar-fav-text">
        <span class="sidebar-fav-label" data-test-skedpal="sidebar-fav-label">${item.label}</span>
        ${
          item.detail
            ? `<span class="sidebar-fav-detail" data-test-skedpal="sidebar-fav-detail">${item.detail}</span>`
            : ""
        }
      </span>
    `;
    li.appendChild(btn);
    sidebarFavorites.appendChild(li);
  });
}

export async function updateFavoriteOrder(orderedKeys = []) {
  const updatedSettings = applyFavoriteOrder(state.settingsCache, orderedKeys);
  state.settingsCache = updatedSettings;
  await saveSettings(state.settingsCache);
  renderFavoriteShortcuts();
}

export function closeSubsectionModal() {
  if (subsectionFormWrap) {subsectionFormWrap.classList.add("hidden");}
  editingSubsectionId = "";
  editingSectionId = "";
  repeatStore.subsectionRepeatSelection = { type: "none" };
  repeatStore.repeatTarget = "task";
}

export function getEditingSubsectionId() {
  return editingSubsectionId;
}

export function getEditingSectionId() {
  return editingSectionId;
}

export async function handleSubsectionFormSubmit() {
  const sectionId = subsectionSectionIdInput.value || editingSectionId || "";
  const parentId = subsectionParentIdInput.value || "";
  const name = subsectionNameInput.value || "";
  if (!sectionId || !name) {return;}
  if (
    isStartAfterDeadline(subsectionTaskStartFromInput?.value || "", subsectionTaskDeadlineInput?.value || "")
  ) {
    alert("Start from cannot be after deadline.");
    return;
  }
  if (editingSubsectionId) {
    const subsections = { ...(state.settingsCache.subsections || {}) };
    const list = subsections[sectionId] || [];
    const idx = list.findIndex((s) => s.id === editingSubsectionId);
    if (idx >= 0) {
      const updated = {
        ...list[idx],
        name,
        parentId,
        template: {
          title: subsectionTaskTitleInput?.value || "",
          link: subsectionTaskLinkInput?.value || "",
          durationMin: Number(subsectionTaskDurationInput?.value) || 30,
          minBlockMin: Number(subsectionTaskMinBlockInput?.value) || 30,
          priority: Number(subsectionTaskPriorityInput?.value) || 3,
          deadline: subsectionTaskDeadlineInput?.value || "",
          repeat:
            repeatStore.subsectionRepeatSelection?.type && repeatStore.subsectionRepeatSelection.type !== "none"
              ? repeatStore.subsectionRepeatSelection
              : { type: "none" },
          startFrom: subsectionTaskStartFromInput?.value || "",
          timeMapIds: collectSelectedValues(subsectionTimeMapOptions) || [],
          subtaskScheduleMode: normalizeSubtaskScheduleMode(subsectionTaskSubtaskScheduleSelect?.value)
        }
      };
      list[idx] = updated;
      subsections[sectionId] = list;
      state.settingsCache = { ...state.settingsCache, subsections };
      await saveSettings(state.settingsCache);
      renderTaskSectionOptions(sectionId);
      renderFavoriteShortcuts();
      const { loadTasks } = await import("./tasks/tasks-actions.js");
      await loadTasks();
    }
  } else {
    await handleAddSubsection(sectionId, name, parentId);
  }
  closeSubsectionModal();
}

