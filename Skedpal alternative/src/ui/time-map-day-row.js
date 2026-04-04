import { dayOptions, duplicateIconSvg, removeIconSvg } from "./constants.js";
import { createTimeline } from "./time-map-timeline.js";

function createCompactActionButton({
  actionName,
  label,
  iconSvg,
  hoverClassName
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `title-icon-btn border-slate-700 bg-slate-900/70 text-slate-300 ${hoverClassName}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("data-test-skedpal", `timemap-day-${actionName}`);
  button.setAttribute(`data-day-${actionName}`, "true");

  const icon = document.createElement("span");
  icon.className = "pointer-events-none";
  icon.setAttribute("data-test-skedpal", `timemap-day-${actionName}-icon`);
  icon.innerHTML = iconSvg;

  const srOnlyLabel = document.createElement("span");
  srOnlyLabel.className = "sr-only";
  srOnlyLabel.textContent = label;
  srOnlyLabel.setAttribute("data-test-skedpal", `timemap-day-${actionName}-label`);

  button.appendChild(icon);
  button.appendChild(srOnlyLabel);
  return button;
}

function createDayHeader(day) {
  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", "timemap-day-header");
  const label = document.createElement("span");
  label.className = "text-sm font-semibold text-slate-100";
  label.textContent = dayOptions.find((opt) => opt.value === Number(day))?.label || String(day);
  label.setAttribute("data-test-skedpal", "timemap-day-label");
  const actionGroup = document.createElement("div");
  actionGroup.className = "flex items-center gap-1.5";
  actionGroup.setAttribute("data-test-skedpal", "timemap-day-actions");
  const duplicateDayBtn = createCompactActionButton({
    actionName: "duplicate",
    label: "Duplicate time ranges to all days",
    iconSvg: duplicateIconSvg,
    hoverClassName: "hover:border-lime-400 hover:text-lime-200"
  });
  const removeDayBtn = createCompactActionButton({
    actionName: "remove",
    label: "Remove day",
    iconSvg: removeIconSvg,
    hoverClassName: "hover:border-orange-400 hover:text-orange-300"
  });
  actionGroup.appendChild(duplicateDayBtn);
  actionGroup.appendChild(removeDayBtn);
  header.appendChild(label);
  header.appendChild(actionGroup);
  return header;
}

function createAddBlockButton(day) {
  const addBlockBtn = document.createElement("button");
  addBlockBtn.type = "button";
  addBlockBtn.textContent = "Add time range";
  addBlockBtn.className =
    "mt-2 w-fit rounded-lg border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-lime-400";
  addBlockBtn.setAttribute("data-test-skedpal", "timemap-block-add");
  addBlockBtn.dataset.day = String(day);
  addBlockBtn.setAttribute("data-block-add", "true");
  return addBlockBtn;
}

export function createTimeMapDayRow(day, blocks = []) {
  const row = document.createElement("div");
  row.dataset.dayRow = String(day);
  row.className = "rounded-xl border-slate-700 bg-slate-900/60 p-3";
  row.setAttribute("data-test-skedpal", "timemap-day-row");
  const header = createDayHeader(day);
  const timeline = createTimeline(day, blocks);
  const addBlockBtn = createAddBlockButton(day);
  row.appendChild(header);
  row.appendChild(timeline);
  row.appendChild(addBlockBtn);
  return row;
}
