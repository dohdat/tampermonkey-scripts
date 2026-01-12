export function toggleTemplateSubtaskList(card, btn) {
  if (!card || !btn) {return;}
  const subtaskList = card.querySelector?.("[data-template-subtask-list]");
  if (!subtaskList) {return;}
  const isHidden = subtaskList.classList.toggle("hidden");
  btn.textContent = isHidden ? "Expand" : "Collapse";
  btn.setAttribute("aria-expanded", String(!isHidden));
}

export function getExpandedTemplateIds(list) {
  const expanded = new Set();
  const cards = list?.querySelectorAll?.("[data-template-id]") || [];
  cards.forEach((card) => {
    const templateId = card?.dataset?.templateId || "";
    if (!templateId) {return;}
    const subtaskList = card.querySelector?.("[data-template-subtask-list]");
    if (!subtaskList) {return;}
    const isHidden = subtaskList.classList?.contains?.("hidden")
      ?? String(subtaskList.className || "").split(" ").includes("hidden");
    if (!isHidden) {
      expanded.add(templateId);
    }
  });
  return expanded;
}
