import { dayOptions } from "./constants.js";
import { getWeekdayShortLabel } from "./utils.js";

export function renderRepeatWeekdayOptions(container, selected = []) {
  if (!container) {return;}
  container.innerHTML = "";
  dayOptions.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.dayValue = String(day.value);
    btn.dataset.testSkedpal = "task-repeat-weekday-btn";
    btn.className =
      "rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200";
    btn.textContent = getWeekdayShortLabel(day.value);
    if (selected.includes(day.value)) {
      btn.classList.add("bg-lime-400/10", "border-lime-400", "text-lime-300");
    }
    container.appendChild(btn);
  });
}

export function resolveWeeklyMode(repeat, fallback = "all") {
  return repeat.weeklyMode || fallback;
}

export function syncWeeklyModeInputs(repeatState, anyInput, allInput) {
  if (anyInput) {anyInput.checked = repeatState.weeklyMode === "any";}
  if (allInput) {allInput.checked = repeatState.weeklyMode !== "any";}
}

export function syncWeeklyModeLabels(repeatState, anyCountEl, allCountEl) {
  const value = 1;
  const label = String(value);
  if (anyCountEl) {anyCountEl.textContent = label;}
  if (allCountEl) {allCountEl.textContent = label;}
}
