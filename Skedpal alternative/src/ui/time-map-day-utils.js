import { dayOptions, TIME_MAP_DEFAULT_END, TIME_MAP_DEFAULT_START } from "./constants.js";

export function buildDefaultTimeMapRules() {
  return dayOptions.map((day) => ({
    day: day.value,
    startTime: TIME_MAP_DEFAULT_START,
    endTime: TIME_MAP_DEFAULT_END
  }));
}

export function getTimeMapDayRowsList(container) {
  return [...(container?.children || [])].filter((row) => row?.dataset?.dayRow !== undefined);
}

export function sortTimeMapDayRows(container) {
  const rows = getTimeMapDayRowsList(container);
  rows.sort((a, b) => Number(a.dataset.dayRow) - Number(b.dataset.dayRow));
  if (typeof container?.removeChild === "function") {
    rows.forEach((row) => container.appendChild(row));
    return;
  }
  container.children = [];
  rows.forEach((row) => container.appendChild(row));
}

export function syncTimeMapDaySelectOptions(select, rowsContainer) {
  if (!select || !rowsContainer) {return;}
  const used = new Set(
    getTimeMapDayRowsList(rowsContainer)
      .map((row) => Number(row.dataset?.dayRow))
      .filter((day) => Number.isFinite(day))
  );
  const currentValue = select.value;
  select.innerHTML = "";
  dayOptions.forEach((day) => {
    if (used.has(day.value)) {return;}
    const option = document.createElement("option");
    option.value = String(day.value);
    option.textContent = day.label;
    select.appendChild(option);
  });
  if (select.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "All days added";
    option.disabled = true;
    select.appendChild(option);
    select.value = "";
    return;
  }
  const stillAvailable = [...select.options].some((option) => option.value === currentValue);
  if (stillAvailable) {
    select.value = currentValue;
    return;
  }
  select.selectedIndex = 0;
}

function getSourceTimeMapDayRow(rowsContainer, activeElement) {
  const rows = getTimeMapDayRowsList(rowsContainer);
  if (!rows.length) {return null;}
  const activeRow =
    activeElement && typeof activeElement.closest === "function"
      ? activeElement.closest("[data-day-row]")
      : null;
  if (activeRow && rows.includes(activeRow)) {return activeRow;}
  return rows[0];
}

function buildDuplicatedRulesForAllDays(sourceRules) {
  return dayOptions.flatMap((day) =>
    sourceRules.map((rule) => ({
      day: day.value,
      startTime: rule.startTime,
      endTime: rule.endTime
    }))
  );
}

export function getDuplicatedRulesForAllDays(rowsContainer, activeElement, collectTimeMapRules) {
  const sourceRow = getSourceTimeMapDayRow(rowsContainer, activeElement);
  if (!sourceRow) {return [];}
  const sourceRules = collectTimeMapRules({
    querySelectorAll: () => [sourceRow]
  });
  if (!sourceRules.length) {return [];}
  return buildDuplicatedRulesForAllDays(sourceRules);
}
