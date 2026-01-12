import { renderTaskCard } from "./task-card.js";
import { sortTasksByHierarchy, renderInBatches } from "../utils.js";
import { FORTY } from "../constants.js";

export function renderTaskCards(container, tasks, context, options = {}) {
  const sorted = sortTasksByHierarchy(tasks);
  if (!sorted.length) {return;}
  const { batchSize = FORTY, shouldCancel } = options;
  const cancelCheck = typeof shouldCancel === "function" ? shouldCancel : null;
  if (sorted.length <= batchSize) {
    sorted.forEach((task) => {
      container.appendChild(renderTaskCard(task, context));
    });
    return;
  }
  renderInBatches({
    items: sorted,
    batchSize,
    shouldCancel: cancelCheck,
    renderBatch: (batch) => {
      const fragment = document.createDocumentFragment();
      batch.forEach((task) => fragment.appendChild(renderTaskCard(task, context)));
      container.appendChild(fragment);
    }
  });
}
