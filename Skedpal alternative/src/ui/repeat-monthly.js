import { THIRTY_ONE, TWO, dayOptions } from "./constants.js";
import { formatOrdinal, getNthWeekday } from "./utils.js";

function pad2(value) {
  return String(value).padStart(TWO, "0");
}

export function clampDayValue(value) {
  return Math.min(THIRTY_ONE, Math.max(1, Number(value) || 1));
}

function clampDayInMonth(baseDate, day) {
  const year = baseDate.getFullYear();
  const monthIndex = baseDate.getMonth();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(lastDay, Math.max(1, day));
}

export function buildMonthDateValue(baseDate, day) {
  const year = baseDate.getFullYear();
  const monthIndex = baseDate.getMonth();
  const safeDay = clampDayInMonth(baseDate, day);
  return `${year}-${pad2(monthIndex + 1)}-${pad2(safeDay)}`;
}

export function normalizeMonthlyRange(repeatState, baseDate) {
  const startDay = repeatState.monthlyRangeStartDate
    ? new Date(repeatState.monthlyRangeStartDate).getDate()
    : repeatState.monthlyRangeStart ?? baseDate.getDate();
  const endDay = repeatState.monthlyRangeEndDate
    ? new Date(repeatState.monthlyRangeEndDate).getDate()
    : repeatState.monthlyRangeEnd ?? startDay;
  const start = clampDayValue(startDay);
  const end = Math.max(start, clampDayValue(endDay));
  repeatState.monthlyRangeStart = start;
  repeatState.monthlyRangeEnd = end;
  if (!repeatState.monthlyRangeStartDate) {
    repeatState.monthlyRangeStartDate = buildMonthDateValue(baseDate, start);
  }
  if (!repeatState.monthlyRangeEndDate) {
    repeatState.monthlyRangeEndDate = buildMonthDateValue(baseDate, end);
  }
}

export function buildMonthlySummaryPart(repeat, unit) {
  if (unit !== "month") {return "";}
  if (repeat.monthlyMode === "range") {
    const start = repeat.monthlyRangeStart || 1;
    const end = repeat.monthlyRangeEnd || start;
    return `between day ${start} and day ${end}`;
  }
  if (repeat.monthlyMode === "nth") {
    const weekdayLabel =
      dayOptions.find((d) => d.value === repeat.monthlyWeekday)?.label || "";
    return `on the ${formatOrdinal(repeat.monthlyNth || 1)} ${weekdayLabel}`;
  }
  return `on day ${repeat.monthlyDay || 1}`;
}

export function syncMonthlyModeText(repeatState, monthlyModeSelect) {
  if (!monthlyModeSelect) {return;}
  const dayOpt = monthlyModeSelect.querySelector('option[value="day"]');
  const nthOpt = monthlyModeSelect.querySelector('option[value="nth"]');
  const rangeOpt = monthlyModeSelect.querySelector('option[value="range"]');
  if (dayOpt) {dayOpt.textContent = `Monthly on day ${repeatState.monthlyDay || 1}`;}
  if (nthOpt) {
    nthOpt.textContent = `Monthly on the ${formatOrdinal(repeatState.monthlyNth || 1)} ${dayOptions.find((d) => d.value === repeatState.monthlyWeekday)?.label || "weekday"}`;
  }
  if (rangeOpt) {
    const start = repeatState.monthlyRangeStart || 1;
    const end = repeatState.monthlyRangeEnd || start;
    rangeOpt.textContent = `Monthly between day ${start} and ${end}`;
  }
}

export function syncMonthlyModeVisibility(repeatState, refs) {
  const isDayMode = repeatState.monthlyMode === "day";
  const isNthMode = repeatState.monthlyMode === "nth";
  const isRangeMode = repeatState.monthlyMode === "range";
  const setInputEnabled = (input, enabled) => {
    if (!input) {return;}
    input.disabled = !enabled;
  };
  const setWrapVisible = (wrap, visible) => {
    if (!wrap) {return;}
    wrap.classList.toggle("hidden", !visible);
    wrap.style.display = visible ? "" : "none";
  };
  setInputEnabled(refs.taskRepeatMonthlyDay, isDayMode);
  setInputEnabled(refs.taskRepeatMonthlyNth, isNthMode);
  setInputEnabled(refs.taskRepeatMonthlyWeekday, isNthMode);
  setInputEnabled(refs.taskRepeatMonthlyRangeStart, isRangeMode);
  setInputEnabled(refs.taskRepeatMonthlyRangeEnd, isRangeMode);
  setWrapVisible(refs.taskRepeatMonthlyDayWrap, isDayMode);
  setWrapVisible(refs.taskRepeatMonthlyNthWrap, isNthMode);
  setWrapVisible(refs.taskRepeatMonthlyRangeWrap, isRangeMode);
}

export function syncMonthlyRangeInputs(repeatState, baseDate, rangeStartInput, rangeEndInput) {
  if (rangeStartInput) {
    rangeStartInput.value =
      repeatState.monthlyRangeStartDate ||
      buildMonthDateValue(baseDate, repeatState.monthlyRangeStart || 1);
  }
  if (rangeEndInput) {
    rangeEndInput.value =
      repeatState.monthlyRangeEndDate ||
      buildMonthDateValue(
        baseDate,
        repeatState.monthlyRangeEnd || repeatState.monthlyRangeStart || 1
      );
  }
}

export function updateMonthlyRangeState(
  repeatState,
  baseDate,
  startDay,
  endDay,
  rangeStartInput,
  rangeEndInput,
  startDateValue,
  endDateValue
) {
  const start = clampDayValue(startDay);
  const end = Math.max(start, clampDayValue(endDay));
  repeatState.monthlyRangeStart = start;
  repeatState.monthlyRangeEnd = end;
  repeatState.monthlyRangeStartDate =
    startDateValue || repeatState.monthlyRangeStartDate || buildMonthDateValue(baseDate, start);
  repeatState.monthlyRangeEndDate =
    endDateValue || repeatState.monthlyRangeEndDate || buildMonthDateValue(baseDate, end);
  syncMonthlyRangeInputs(repeatState, baseDate, rangeStartInput, rangeEndInput);
}

export function resolveMonthlyMode(repeat) {
  if (repeat.monthlyMode === "range") {
    if (repeat.bySetPos) {return "nth";}
    if (repeat.byMonthDay) {return "day";}
    return "range";
  }
  if (repeat.monthlyMode) {return repeat.monthlyMode;}
  if (repeat.bySetPos) {return "nth";}
  if (repeat.byMonthDay) {return "day";}
  return "day";
}

export function resolveMonthlyDay(repeat, base) {
  return repeat.monthlyDay || repeat.byMonthDay || base.monthlyDay;
}

export function resolveMonthlyNth(repeat, base) {
  return repeat.monthlyNth || repeat.bySetPos || base.monthlyNth;
}

export function resolveMonthlyRangeStart(repeat, base) {
  return repeat.monthlyRangeStart || base.monthlyRangeStart;
}

export function resolveMonthlyRangeEnd(repeat, base) {
  return repeat.monthlyRangeEnd || base.monthlyRangeEnd;
}

export function buildMonthlyRule(repeatState, startDate, interval, byDayCodes) {
  if (repeatState.monthlyMode === "nth") {
    const byday = byDayCodes[repeatState.monthlyWeekday ?? startDate.getDay()];
    const bysetpos = repeatState.monthlyNth ?? getNthWeekday(startDate).nth;
    return `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${byday};BYSETPOS=${bysetpos}`;
  }
  if (repeatState.monthlyMode === "range") {
    const endDay = repeatState.monthlyRangeEnd || startDate.getDate();
    return `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${endDay}`;
  }
  const day = repeatState.monthlyDay || startDate.getDate();
  return `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${day}`;
}
