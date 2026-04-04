import { dayOptions } from "./constants.js";
import { createTimeline } from "./time-map-timeline.js";

function createDayHeader(day) {
  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-2";
  header.setAttribute("data-test-skedpal", "timemap-day-header");
  const label = document.createElement("span");
  label.className = "text-sm font-semibold text-slate-100";
  label.textContent = dayOptions.find((opt) => opt.value === Number(day))?.label || String(day);
  label.setAttribute("data-test-skedpal", "timemap-day-label");
  const actionGroup = document.createElement("div");
  actionGroup.className = "flex items-center gap-2";
  actionGroup.setAttribute("data-test-skedpal", "timemap-day-actions");
  const duplicateDayBtn = document.createElement("button");
  duplicateDayBtn.type = "button";
  duplicateDayBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-lime-400 hover:text-lime-200";
  duplicateDayBtn.textContent = "Duplicate to all";
  duplicateDayBtn.setAttribute("data-test-skedpal", "timemap-day-duplicate");
  duplicateDayBtn.setAttribute("data-day-duplicate", "true");
  const removeDayBtn = document.createElement("button");
  removeDayBtn.type = "button";
  removeDayBtn.className =
    "rounded-lg border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-orange-400 hover:text-orange-300";
  removeDayBtn.textContent = "Remove";
  removeDayBtn.setAttribute("data-test-skedpal", "timemap-day-remove");
  removeDayBtn.setAttribute("data-day-remove", "true");
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
