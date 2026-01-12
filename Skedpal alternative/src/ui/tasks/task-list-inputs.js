import { handleAddSubsection } from "../sections.js";
import {
  handleAddTaskInputSubmit,
  collapseAddTaskRowForInput
} from "./task-add-row.js";

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
