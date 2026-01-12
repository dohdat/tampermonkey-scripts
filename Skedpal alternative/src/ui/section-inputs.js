import { handleAddSection, handleRemoveSection } from "./sections.js";

export function handleSectionInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddSection();
  }
}

export function handleSectionListClick(event) {
  const btn = event.target.closest("button[data-remove-section]");
  if (!btn) {return;}
  handleRemoveSection(btn.dataset.removeSection);
}
