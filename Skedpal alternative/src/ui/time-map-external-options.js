import { EXTERNAL_CALENDAR_TIMEMAP_PREFIX } from "./constants.js";
import { state } from "./state/page-state.js";
import { themeColors } from "./theme.js";

function resolveExternalCalendarOptions() {
  const selectedIds = Array.isArray(state.settingsCache?.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : [];
  if (!selectedIds.length) {return [];}
  const calendarList = Array.isArray(state.googleCalendarListCache)
    ? state.googleCalendarListCache
    : [];
  return selectedIds.map((id) => {
    const entry = calendarList.find((calendar) => calendar.id === id);
    return {
      id,
      name: entry?.summary || id,
      color: entry?.backgroundColor || ""
    };
  });
}

function buildExternalCalendarOption(calendar, selectedIds) {
  const label = document.createElement("label");
  label.className =
    "flex items-center gap-2 rounded-lg border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200";
  label.setAttribute("data-test-skedpal", "timemap-external-option");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = `${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}${calendar.id}`;
  input.checked = selectedIds.has(input.value);
  input.className = "h-4 w-4 rounded border-slate-700 bg-slate-900 text-lime-400";
  input.setAttribute("data-test-skedpal", "timemap-external-option-checkbox");
  const swatch = document.createElement("span");
  swatch.className = "h-3 w-3 rounded-full border-slate-700";
  swatch.style.backgroundColor = calendar.color || themeColors.sky400;
  swatch.style.borderColor = calendar.color || themeColors.slate500;
  swatch.setAttribute("data-test-skedpal", "timemap-external-option-color");
  const text = document.createElement("span");
  text.textContent = calendar.name || calendar.id || "External calendar";
  text.setAttribute("data-test-skedpal", "timemap-external-option-label");
  label.appendChild(input);
  label.appendChild(swatch);
  label.appendChild(text);
  return label;
}

export function appendExternalCalendarOptions(container, selected = []) {
  const calendars = resolveExternalCalendarOptions();
  if (!calendars.length) {return;}
  const selectedIds = new Set(Array.isArray(selected) ? selected : []);
  const header = document.createElement("div");
  header.className = "mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400";
  header.textContent = "Allow overlaps with calendars";
  header.setAttribute("data-test-skedpal", "timemap-external-heading");
  container.appendChild(header);
  calendars.forEach((calendar) => {
    container.appendChild(buildExternalCalendarOption(calendar, selectedIds));
  });
}
