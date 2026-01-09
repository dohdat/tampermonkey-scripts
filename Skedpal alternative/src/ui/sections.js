import { getAllTasks, saveSettings, saveTask } from "../data/db.js";
import { domRefs } from "./constants.js";
import { getNextFavoriteOrder, toggleFavoriteById } from "./favorites.js";
import {
  applyPrioritySelectColor,
  isStartAfterDeadline,
  normalizeSubtaskScheduleMode,
  uuid
} from "./utils.js";
import { state } from "./state/page-state.js";
import { repeatStore, setRepeatFromSelection, syncSubsectionRepeatLabel } from "./repeat.js";
import { renderTimeMapOptions, collectSelectedValues } from "./time-maps.js";
import { renderFavoriteShortcuts } from "./sections-favorites.js";
import { getSectionName, getSubsectionsFor } from "./sections-data.js";
import {
  DEFAULT_SUBSECTION_TEMPLATE,
  formatTemplateDate,
  getInputValue,
  getNumberInputValue,
  resolveSubsectionRepeatSelection,
  setInputValue
} from "./sections-helpers.js";

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
  subsectionTimeMapOptions
} = domRefs;

let editingSubsectionId = "";
let editingSectionId = "";

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
    : sections.find((s) => s.name?.toLowerCase() === "work") || null;
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

  const addOptions = (parentId = "", depth = 0) => {
    const siblings = subsections.filter((s) => (s.parentId || "") === (parentId || ""));
    siblings.forEach((sub) => {
      const opt = document.createElement("option");
      opt.value = sub.id;
      const prefix = depth > 0 ? `${"-- ".repeat(depth)}` : "";
      opt.textContent = `${prefix}${sub.name}`;
      opt.setAttribute("data-test-skedpal", "task-subsection-option");
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

function buildSubsectionTemplateFromInputs() {
  const repeat = resolveSubsectionRepeatSelection();
  return {
    title: getInputValue(subsectionTaskTitleInput, ""),
    link: getInputValue(subsectionTaskLinkInput, ""),
    durationMin: getNumberInputValue(subsectionTaskDurationInput, 30),
    minBlockMin: getNumberInputValue(subsectionTaskMinBlockInput, 15),
    priority: getNumberInputValue(subsectionTaskPriorityInput, 3),
    deadline: getInputValue(subsectionTaskDeadlineInput, ""),
    repeat,
    startFrom: getInputValue(subsectionTaskStartFromInput, ""),
    timeMapIds: collectSelectedValues(subsectionTimeMapOptions) || [],
    subtaskScheduleMode: normalizeSubtaskScheduleMode(subsectionTaskSubtaskScheduleSelect?.value)
  };
}

function resolveSubsectionTemplate(existing) {
  return {
    ...DEFAULT_SUBSECTION_TEMPLATE,
    ...(existing?.template || {})
  };
}

function applySubsectionTemplate(template) {
  setInputValue(subsectionTaskTitleInput, template.title || "");
  setInputValue(subsectionTaskLinkInput, template.link || "");
  setInputValue(subsectionTaskDurationInput, template.durationMin || 30);
  setInputValue(subsectionTaskMinBlockInput, template.minBlockMin || 15);
  setInputValue(subsectionTaskPriorityInput, String(template.priority || 3));
  applyPrioritySelectColor(subsectionTaskPriorityInput);
  setInputValue(subsectionTaskDeadlineInput, formatTemplateDate(template.deadline));
  setInputValue(subsectionTaskStartFromInput, formatTemplateDate(template.startFrom));
  const repeat = template.repeat || { type: "none" };
  setInputValue(subsectionTaskRepeatSelect, repeat.type === "custom" ? "custom" : "none");
  setRepeatFromSelection(repeat, "subsection");
  syncSubsectionRepeatLabel();
  if (subsectionTaskSubtaskScheduleSelect) {
    subsectionTaskSubtaskScheduleSelect.value = normalizeSubtaskScheduleMode(template.subtaskScheduleMode);
  }
  renderTimeMapOptions(subsectionTimeMapOptions, template.timeMapIds || [], state.tasksTimeMapsCache);
}

function hasInvalidSubsectionDates() {
  if (
    isStartAfterDeadline(subsectionTaskStartFromInput?.value || "", subsectionTaskDeadlineInput?.value || "")
  ) {
    alert("Start from cannot be after deadline.");
    return true;
  }
  return false;
}

function isDuplicateSubsectionName(list, parentId, name, ignoreId = "") {
  return list.some(
    (s) =>
      s.id !== ignoreId &&
      (s.parentId || "") === (parentId || "") &&
      s.name &&
      s.name.toLowerCase() === name.toLowerCase()
  );
}

function promptForName(title, currentValue) {
  const next = prompt(title, currentValue || "");
  if (next === null) {return null;}
  return next.trim();
}

function isValidRename(name, currentName, list, subsectionId, parentId) {
  if (!name) {return false;}
  if (name.toLowerCase() === (currentName || "").toLowerCase()) {return false;}
  return !isDuplicateSubsectionName(list, parentId || "", name, subsectionId);
}

export function openSubsectionModal(sectionId, parentId = "", existingSubsectionId = "") {
  const { subsectionFormWrap } = domRefs;
  if (!subsectionFormWrap) {return;}
  repeatStore.repeatTarget = "subsection";
  const subs = getSubsectionsFor(sectionId);
  const existing = subs.find((s) => s.id === existingSubsectionId);
  const parent = !existing && parentId ? subs.find((s) => s.id === parentId) : null;
  editingSubsectionId = existing ? existing.id : "";
  editingSectionId = sectionId;
  subsectionSectionIdInput.value = sectionId || "";
  subsectionParentIdInput.value = parentId || existing?.parentId || "";
  subsectionNameInput.value = existing?.name || "";
  const template = resolveSubsectionTemplate(existing || parent);
  applySubsectionTemplate(template);
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
  if (hasInvalidSubsectionDates()) {return;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const parentId = parentSubsectionId || "";
  if (isDuplicateSubsectionName(list, parentId, name)) {return;}
  const entry = {
    id: uuid(),
    name,
    favorite: false,
    parentId,
    template: buildSubsectionTemplateFromInputs()
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
  const name = promptForName("Rename subsection", target.name || "");
  if (name === null) {return;}
  if (!isValidRename(name, target.name, list, subsectionId, target.parentId)) {return;}
  const updatedList = list.map((s) => (s.id === subsectionId ? { ...s, name } : s));
  subsections[sectionId] = updatedList;
  state.settingsCache = { ...state.settingsCache, subsections };
  await saveSettings(state.settingsCache);
  renderTaskSectionOptions(sectionId);
  const { loadTasks } = await import("./tasks/tasks-actions.js");
  await loadTasks();
}

export async function handleRemoveSubsection(sectionId, subsectionId) {
  const removal = buildSubsectionRemoval(sectionId, subsectionId);
  if (!removal) {return;}
  const { subsections, target, parentId, nextList } = removal;
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

function buildSubsectionRemoval(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return null;}
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const sectionList = subsections[sectionId] || [];
  const target = sectionList.find((s) => s.id === subsectionId);
  if (!target) {return null;}
  const parentId = target.parentId || "";
  const nextList = sectionList
    .filter((s) => s.id !== subsectionId)
    .map((s) => (s.parentId === subsectionId ? { ...s, parentId } : s));
  if (nextList.length === sectionList.length) {return null;}
  return { subsections, target, parentId, nextList };
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
  if (hasInvalidSubsectionDates()) {return;}
  if (editingSubsectionId) {
    await saveEditedSubsection(sectionId, editingSubsectionId, name, parentId);
  } else {
    await handleAddSubsection(sectionId, name, parentId);
  }
  closeSubsectionModal();
}

async function saveEditedSubsection(sectionId, subsectionId, name, parentId) {
  const subsections = { ...(state.settingsCache.subsections || {}) };
  const list = subsections[sectionId] || [];
  const idx = list.findIndex((s) => s.id === subsectionId);
  if (idx < 0) {return;}
  const updated = {
    ...list[idx],
    name,
    parentId,
    template: buildSubsectionTemplateFromInputs()
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

