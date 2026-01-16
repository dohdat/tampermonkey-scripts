import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";

const { googleCalendarList } = domRefs;

export function buildCalendarDefaultToggle(entry, selectedIds, defaultId) {
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "flex items-center gap-2 text-xs text-slate-300";
  toggleLabel.setAttribute("data-test-skedpal", "google-calendar-default-toggle-label");

  const toggle = document.createElement("input");
  toggle.type = "radio";
  toggle.name = "google-calendar-default";
  toggle.className = "h-3.5 w-3.5 accent-lime-400";
  toggle.dataset.calendarDefaultToggle = "true";
  toggle.dataset.calendarId = entry.id || "";
  toggle.checked = Boolean(entry.id && entry.id === defaultId);
  toggle.disabled = !selectedIds.includes(entry.id);
  toggle.setAttribute("data-test-skedpal", "google-calendar-default-toggle");

  const toggleText = document.createElement("span");
  toggleText.textContent = "Default";
  toggleText.setAttribute("data-test-skedpal", "google-calendar-default-toggle-text");

  toggleLabel.appendChild(toggle);
  toggleLabel.appendChild(toggleText);
  return toggleLabel;
}

export function updateDefaultCalendarToggles(selectedIds, defaultId) {
  if (!googleCalendarList) {return;}
  const toggles = [...googleCalendarList.querySelectorAll("input[data-calendar-default-toggle]")];
  toggles.forEach((toggle) => {
    const calendarId = toggle.dataset.calendarId || "";
    const isSelected = selectedIds.includes(calendarId);
    toggle.disabled = !isSelected;
    toggle.checked = Boolean(calendarId && calendarId === defaultId && isSelected);
  });
}

export function handleCalendarDefaultToggleChange(target, persistSettingsSafely) {
  const calendarId = target?.dataset?.calendarId || "";
  if (!calendarId || target.disabled) {return;}
  persistSettingsSafely(
    { defaultGoogleCalendarId: calendarId },
    "Failed to save default calendar."
  );
}

export function resolveCalendarDefaultToggleTarget(target) {
  if (!target) {return null;}
  if (target.matches?.("input[data-calendar-default-toggle]")) {return target;}
  const label = target.closest?.("[data-test-skedpal='google-calendar-default-toggle-label']");
  if (!label) {return null;}
  return label.querySelector?.("input[data-calendar-default-toggle]") || null;
}

export function getDefaultCalendarId() {
  return state.settingsCache.defaultGoogleCalendarId || "";
}
