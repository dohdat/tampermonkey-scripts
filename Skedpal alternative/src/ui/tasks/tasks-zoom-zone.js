import { TASK_ZONE_CLASS } from "../constants.js";
import { state } from "../state/page-state.js";
import { renderTaskCards } from "./task-cards-render.js";
import { buildAddTaskRow } from "./task-add-row.js";

function buildZoomZoneMeta(zoomMeta) {
  return {
    sectionId: zoomMeta?.sectionId || "",
    subsectionId: zoomMeta?.subsectionId || "",
    parentId: zoomMeta?.parentId || ""
  };
}

export function buildZoomTaskZone(
  filteredTasks,
  context,
  renderToken,
  zoomMeta,
  shouldCancel
) {
  const zone = document.createElement("div");
  zone.className = "space-y-2";
  zone.classList.add(TASK_ZONE_CLASS);
  zone.setAttribute("data-test-skedpal", "task-zoom-zone");
  const meta = buildZoomZoneMeta(zoomMeta);
  zone.dataset.dropSection = meta.sectionId;
  zone.dataset.dropSubsection = meta.subsectionId;
  renderTaskCards(zone, filteredTasks, context, {
    renderToken,
    batchSize: 30,
    shouldCancel: typeof shouldCancel === "function" ? shouldCancel : null
  });
  if (state.zoomFilter) {
    zone.appendChild(
      buildAddTaskRow({
        sectionId: meta.sectionId,
        subsectionId: meta.subsectionId,
        parentId: meta.parentId
      })
    );
  }
  return zone;
}
