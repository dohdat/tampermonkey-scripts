import { TASK_PLACEHOLDER_CLASS, TASK_ZONE_CLASS } from "../constants.js";
import { sortTasksByOrder } from "../utils.js";
import { renderTaskCards } from "./task-cards-render.js";
import { registerTaskVirtualizer, shouldVirtualizeTaskList } from "./task-virtualization.js";

export function buildChildSubsectionInput(sub, sectionId, isNoSection) {
  const childSubsectionInputWrap = document.createElement("div");
  childSubsectionInputWrap.className =
    "hidden flex flex-col gap-2 md:flex-row md:items-center";
  childSubsectionInputWrap.dataset.childSubsectionForm = sub.id;
  childSubsectionInputWrap.setAttribute("data-test-skedpal", "subsection-child-input-wrap");
  childSubsectionInputWrap.innerHTML = `
        <input data-child-subsection-input="${sub.id}" data-test-skedpal="subsection-child-input" placeholder="Add subsection" class="w-full rounded-lg border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-lime-400 focus:outline-none" />
        <button type="button" data-submit-child-subsection="${sub.id}" data-parent-section="${
          isNoSection ? "" : sectionId
        }" data-test-skedpal="subsection-child-submit" class="rounded-lg border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-lime-400">Add</button>
      `;
  return childSubsectionInputWrap;
}

export function buildSubsectionZone(
  sub,
  sectionId,
  isNoSection,
  sectionTasks,
  context,
  suppressPlaceholders,
  renderToken,
  options = {}
) {
  const { enableVirtualization, isCollapsed, shouldCancel } = options;
  const subZone = document.createElement("div");
  subZone.className =
    "rounded-lg border-dashed border-slate-700 bg-slate-900/40 px-2 py-2";
  subZone.setAttribute("data-test-skedpal", "subsection-task-zone-wrap");
  const subZoneList = document.createElement("div");
  subZoneList.dataset.dropSection = isNoSection ? "" : sectionId;
  subZoneList.dataset.dropSubsection = sub.id;
  subZoneList.className = "flex flex-col gap-2";
  subZoneList.classList.add(TASK_ZONE_CLASS);
  subZoneList.setAttribute("data-test-skedpal", "subsection-task-zone");
  const subTasks = sortTasksByOrder(sectionTasks.filter((t) => t.subsection === sub.id));
  if (subTasks.length === 0 && !suppressPlaceholders) {
    const empty = document.createElement("div");
    empty.className = `text-xs text-slate-500 ${TASK_PLACEHOLDER_CLASS}`;
    empty.textContent = "Drag tasks here or add new.";
    empty.setAttribute("data-test-skedpal", "subsection-task-empty");
    subZoneList.appendChild(empty);
  } else if (
    enableVirtualization &&
    !isCollapsed &&
    shouldVirtualizeTaskList(subTasks.length)
  ) {
    registerTaskVirtualizer({ listEl: subZoneList, tasks: subTasks, context });
  } else {
    renderTaskCards(subZoneList, subTasks, context, {
      renderToken,
      batchSize: 30,
      shouldCancel
    });
  }
  subZone.appendChild(subZoneList);
  return subZone;
}
