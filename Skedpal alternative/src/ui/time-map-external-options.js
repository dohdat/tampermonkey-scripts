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
  const icon = buildExternalCalendarIcon();
  const text = document.createElement("span");
  text.textContent = calendar.name || calendar.id || "External calendar";
  text.setAttribute("data-test-skedpal", "timemap-external-option-label");
  label.appendChild(input);
  label.appendChild(swatch);
  label.appendChild(icon);
  label.appendChild(text);
  return label;
}

export function appendExternalCalendarOptions(container, selected = []) {
  const calendars = resolveExternalCalendarOptions();
  if (!calendars.length) {return;}
  const selectedIds = new Set(Array.isArray(selected) ? selected : []);
  const header = document.createElement("div");
  header.className = "mt-2";
  header.setAttribute("data-test-skedpal", "timemap-external-heading");
  const headingLabel = document.createElement("span");
  headingLabel.className = "sr-only";
  headingLabel.textContent = "Allow overlaps with calendars";
  headingLabel.setAttribute("data-test-skedpal", "timemap-external-heading-label");
  header.appendChild(headingLabel);
  container.appendChild(header);
  calendars.forEach((calendar) => {
    container.appendChild(buildExternalCalendarOption(calendar, selectedIds));
  });
}

function buildExternalCalendarIcon() {
  const icon = document.createElement("span");
  icon.className = "calendar-event-icon";
  icon.setAttribute("data-test-skedpal", "calendar-event-external-icon");
  icon.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M6 2h40a6 6 0 0 1 6 6v40H6a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"></path>
    <path fill="#1967D2" d="M46 2h12a6 6 0 0 1 6 6v16H52V8a6 6 0 0 0-6-6z"></path>
    <path fill="#FFFFFF" d="M14 18h36v30H14z"></path>
    <path fill="#FBBC04" d="M50 24h14v24a6 6 0 0 1-6 6H50z"></path>
    <path fill="#34A853" d="M14 48h36v10a6 6 0 0 1-6 6H14z"></path>
    <path fill="#188038" d="M0 48h14v10a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6z"></path>
    <path fill="#EA4335" d="M64 48v10a6 6 0 0 1-6 6H50z"></path>
    <path fill="#1A73E8" d="M28 42V24h6v18z"></path>
    <path fill="#1A73E8" d="M28 42v-6h12v6z"></path>
  </svg>`;
  return icon;
}
