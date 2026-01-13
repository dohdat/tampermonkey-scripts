import { handleAddSubsection } from "../sections.js";
import {
  handleAddTaskInputSubmit,
  collapseAddTaskRowForInput,
  parseClipboardTaskTitles,
  buildQuickAddTaskPayloadsFromTitles
} from "./task-add-row.js";
import { saveTask } from "../../data/db.js";
import { state } from "../state/page-state.js";

async function handleSubsectionInputSubmit(input) {
  const sectionId = input.dataset.subsectionInput || "";
  const value = input.value || "";
  if (!value.trim()) {return;}
  await handleAddSubsection(sectionId, value);
  input.value = "";
  const wrap = input.closest(`[data-subsection-form="${sectionId}"]`);
  wrap?.classList.add("hidden");
}

async function handleChildSubsectionInputSubmit(input) {
  const parentSubId = input.dataset.childSubsectionInput || "";
  const card = input.closest(`[data-subsection-card="${parentSubId}"]`);
  const parentSectionId = card?.closest("[data-section-card]")?.dataset.sectionCard || "";
  const value = input.value || "";
  if (!value.trim()) {return;}
  await handleAddSubsection(parentSectionId, value, parentSubId);
  input.value = "";
  const wrap = input.closest(`[data-child-subsection-form="${parentSubId}"]`);
  wrap?.classList.add("hidden");
}

function buildPastedTaskTitles(inputValue, clipboardTitles) {
  const existing = (inputValue || "").trim();
  if (!existing) {return clipboardTitles;}
  if (clipboardTitles[0] === existing) {return clipboardTitles;}
  return [existing, ...clipboardTitles];
}

function getAddTaskInputContext(input) {
  const sectionId = input.dataset.addTaskSection || "";
  const subsectionId = input.dataset.addTaskSubsection || "";
  const parentId = input.dataset.addTaskParent || "";
  const parentTask = parentId
    ? state.tasksCache.find((task) => task.id === parentId)
    : null;
  return { sectionId, subsectionId, parentTask };
}

export async function handleTaskListInputKeydown(event) {
  const input = event.target;
  if (!(input instanceof HTMLElement)) {return;}
  if (event.key === "Escape" && input.matches("[data-add-task-input]")) {
    event.preventDefault();
    collapseAddTaskRowForInput(input);
    return;
  }
  if (event.key !== "Enter") {return;}
  if (input.matches("[data-add-task-input]")) {
    event.preventDefault();
    await handleAddTaskInputSubmit(input);
    return;
  }
  if (input.matches("[data-subsection-input]")) {
    event.preventDefault();
    await handleSubsectionInputSubmit(input);
    return;
  }
  if (input.matches("[data-child-subsection-input]")) {
    event.preventDefault();
    await handleChildSubsectionInputSubmit(input);
  }
}

export async function handleTaskListInputPaste(event) {
  const input = event.target;
  if (!(input instanceof HTMLElement)) {return;}
  if (!input.matches("[data-add-task-input]")) {return;}
  const text = event.clipboardData?.getData("text") || "";
  const titles = parseClipboardTaskTitles(text);
  if (titles.length <= 1) {return;}
  const normalizedTitles = buildPastedTaskTitles(input.value, titles);
  const { sectionId, subsectionId, parentTask } = getAddTaskInputContext(input);
  const payloads = buildQuickAddTaskPayloadsFromTitles({
    titles: normalizedTitles,
    sectionId,
    subsectionId,
    tasks: state.tasksCache,
    parentTask
  });
  if (!payloads.length) {return;}
  event.preventDefault();
  await Promise.all(payloads.map((payload) => saveTask(payload)));
  collapseAddTaskRowForInput(input);
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
}
