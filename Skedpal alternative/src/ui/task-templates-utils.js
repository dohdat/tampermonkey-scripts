export function toggleTemplateSubtaskList(card, btn) {
  if (!card || !btn) {return;}
  const subtaskList = card.querySelector?.("[data-template-subtask-list]");
  if (!subtaskList) {return;}
  const isHidden = subtaskList.classList.toggle("hidden");
  btn.textContent = isHidden ? "Expand" : "Collapse";
  btn.setAttribute("aria-expanded", String(!isHidden));
}

export function getNextTemplateOrder(templates) {
  const orders = (templates || [])
    .map((template) => Number(template?.order))
    .filter((order) => Number.isFinite(order));
  const maxOrder = orders.length ? Math.max(...orders) : 0;
  return maxOrder + 1;
}

export function getExpandedTemplateIds(list) {
  const expanded = new Set();
  const cards = list?.querySelectorAll?.("[data-template-card]") || [];
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

export function getTemplateCardFromNode(node) {
  if (!node?.closest) {return null;}
  return node.closest("[data-template-card]");
}
