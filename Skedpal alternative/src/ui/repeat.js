import {
  DEFAULT_TASK_REPEAT,
  TASK_REPEAT_NONE,
  TEN,
  domRefs
} from "./constants.js";
import { formatRRuleDate, getNthWeekday } from "./utils.js";
export { registerRepeatEventHandlers } from "./repeat-events.js";
import {
  buildMonthlyRule,
  buildMonthlySummaryPart,
  normalizeMonthlyRange,
  resolveMonthlyDay,
  resolveMonthlyMode,
  resolveMonthlyNth,
  resolveMonthlyRangeEnd,
  resolveMonthlyRangeStart,
  syncMonthlyModeText,
  syncMonthlyModeVisibility,
  syncMonthlyRangeInputs
} from "./repeat-monthly.js";
import {
  buildRepeatEndPart,
  buildRepeatFrequencyPart,
  buildWeeklySummaryPart,
  buildYearlySummaryPart,
  resolveWeeklyDays
} from "./repeat-summary.js";
import { getDateParts, syncYearlyRangeInputs } from "./repeat-yearly.js";
import {
  renderRepeatWeekdayOptions,
  resolveWeeklyMode,
  syncWeeklyModeInputs,
  syncWeeklyModeLabels
} from "./repeat-weekly.js";
const {
  taskDeadlineInput,
  taskRepeatSelect,
  taskRepeatUnit,
  taskRepeatInterval,
  taskRepeatWeekdays,
  taskRepeatWeeklyModeAny,
  taskRepeatWeeklyModeAll,
  taskRepeatWeeklyAnyCount,
  taskRepeatWeeklyAllCount,
  taskRepeatMonthlyMode,
  taskRepeatMonthlyDay,
  taskRepeatMonthlyNth,
  taskRepeatMonthlyWeekday,
  taskRepeatWeeklySection,
  taskRepeatMonthlySection,
  taskRepeatYearlySection,
  taskRepeatYearlyRangeStart,
  taskRepeatYearlyRangeEnd,
  taskRepeatMonthlyDayWrap,
  taskRepeatMonthlyNthWrap,
  taskRepeatEndNever,
  taskRepeatEndOn,
  taskRepeatEndAfter,
  taskRepeatEndDate,
  taskRepeatEndCount,
  repeatModal,
  subsectionTaskRepeatSelect
} = domRefs;
export function getStartDate() {
  const raw = taskDeadlineInput?.value;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date) ? new Date() : date;
}
export function defaultRepeatState(startDate = getStartDate()) {
  const monthDay = startDate.getDate();
  const { nth, weekday } = getNthWeekday(startDate);
  return {
    unit: TASK_REPEAT_NONE,
    interval: 1,
    weeklyDays: [weekday],
    weeklyMode: "any",
    monthlyMode: "day",
    monthlyDay: monthDay,
    monthlyNth: nth,
    monthlyWeekday: weekday,
    monthlyRangeStart: monthDay,
    monthlyRangeEnd: monthDay,
    monthlyRangeStartDate: "",
    monthlyRangeEndDate: "",
    yearlyMonth: startDate.getMonth() + 1,
    yearlyDay: monthDay,
    yearlyRangeStartDate: "",
    yearlyRangeEndDate: "",
    end: { type: "never", date: "", count: 1 }
  };
}
export const repeatStore = {
  repeatState: defaultRepeatState(),
  lastRepeatSelection: { ...DEFAULT_TASK_REPEAT },
  repeatSelectionBeforeModal: { ...DEFAULT_TASK_REPEAT },
  repeatTarget: "task",
  subsectionRepeatSelection: { ...DEFAULT_TASK_REPEAT },
  subsectionRepeatBeforeModal: { ...DEFAULT_TASK_REPEAT }
};
export function openRepeatModal() {
  if (repeatModal) {repeatModal.classList.remove("hidden");}
}
export function closeRepeatModal() {
  if (repeatModal) {repeatModal.classList.add("hidden");}
}
function isRepeatDisabled(repeat) {
  return !repeat || repeat.type === TASK_REPEAT_NONE;
}
export function getRepeatSummary(repeat) {
  if (isRepeatDisabled(repeat)) {return "Does not repeat";}
  const unit = repeat.unit || "week";
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const end = repeat.end || { type: "never" };
  const parts = [
    buildRepeatFrequencyPart(unit, interval),
    buildWeeklySummaryPart(repeat, unit, []),
    buildMonthlySummaryPart(repeat, unit),
    buildYearlySummaryPart(repeat, unit),
    buildRepeatEndPart(end)
  ].filter(Boolean);
  return parts.join(", ") || "Custom repeat";
}
function syncRepeatEndControls(repeatState) {
  const endType = repeatState.end?.type || "never";
  taskRepeatEndNever.checked = endType === "never";
  taskRepeatEndOn.checked = endType === "on";
  taskRepeatEndAfter.checked = endType === "after";
  taskRepeatEndDate.value = repeatState.end?.date ? repeatState.end.date.slice(0, TEN) : "";
  taskRepeatEndCount.value = repeatState.end?.count ? Number(repeatState.end.count) : 1;
}
function syncRepeatTargetSelect(target) {
  if (target === "task") {
    taskRepeatSelect.value =
      repeatStore.lastRepeatSelection.type === "custom" ? "custom" : TASK_REPEAT_NONE;
    syncRepeatSelectLabel();
    return;
  }
  if (target === "subsection") {
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value =
        repeatStore.subsectionRepeatSelection.type === "custom"
          ? "custom"
          : TASK_REPEAT_NONE;
    }
    syncSubsectionRepeatLabel();
  }
}
export function renderRepeatUI(target = repeatStore.repeatTarget) {
  if (!taskRepeatUnit) {return;}
  const repeatState = repeatStore.repeatState;
  if (repeatState.monthlyMode === "range") {repeatState.monthlyMode = "day";}
  normalizeMonthlyRange(repeatState, getStartDate());
  taskRepeatUnit.value = repeatState.unit === TASK_REPEAT_NONE ? "week" : repeatState.unit;
  taskRepeatInterval.value = repeatState.interval;
  taskRepeatWeeklySection.classList.toggle("hidden", repeatState.unit !== "week");
  taskRepeatMonthlySection.classList.toggle("hidden", repeatState.unit !== "month");
  taskRepeatYearlySection.classList.toggle("hidden", repeatState.unit !== "year");
  renderRepeatWeekdayOptions(taskRepeatWeekdays, repeatState.weeklyDays || []);
  syncWeeklyModeInputs(repeatState, taskRepeatWeeklyModeAny, taskRepeatWeeklyModeAll);
  syncWeeklyModeLabels(repeatState, taskRepeatWeeklyAnyCount, taskRepeatWeeklyAllCount);
  setInputValue(taskRepeatMonthlyMode, repeatState.monthlyMode || "day");
  setInputValue(taskRepeatMonthlyDay, repeatState.monthlyDay || 1);
  setInputValue(taskRepeatMonthlyNth, String(repeatState.monthlyNth || 1));
  setInputValue(taskRepeatMonthlyWeekday, String(repeatState.monthlyWeekday ?? 0));
  syncMonthlyRangeInputs(repeatState, getStartDate(), null, null);
  syncMonthlyModeText(repeatState, taskRepeatMonthlyMode);
  syncMonthlyModeVisibility(repeatState, {
    taskRepeatMonthlyDay,
    taskRepeatMonthlyNth,
    taskRepeatMonthlyWeekday,
    taskRepeatMonthlyRangeStart: null,
    taskRepeatMonthlyRangeEnd: null,
    taskRepeatMonthlyDayWrap,
    taskRepeatMonthlyNthWrap,
    taskRepeatMonthlyRangeWrap: null
  });
  syncYearlyRangeInputs(repeatState, getStartDate(), taskRepeatYearlyRangeStart, taskRepeatYearlyRangeEnd);
  syncRepeatEndControls(repeatState);
  syncRepeatTargetSelect(target);
}
function resolveRepeatUnit(repeat) {
  if (repeat.unit) {return repeat.unit;}
  const frequencyMap = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
  return frequencyMap[repeat.frequency] || "week";
}
function resolveMonthlyWeekday(repeat, base) {
  if (repeat.monthlyWeekday !== undefined && repeat.monthlyWeekday !== null) {
    return repeat.monthlyWeekday;
  }
  if (Array.isArray(repeat.byWeekdays) && repeat.byWeekdays.length) {
    return repeat.byWeekdays[0];
  }
  return base.monthlyWeekday;
}
function resolveRepeatSelectionTarget(target, selection) {
  if (target === "task") {
    repeatStore.lastRepeatSelection = selection;
  } else {
    repeatStore.subsectionRepeatSelection = selection;
  }
}
function setInputValue(input, value) {
  if (input) {
    input.value = value;
  }
}
function resolveRepeatInterval(repeat) {
  return Math.max(1, Number(repeat.interval) || 1);
}
function resolveYearlyMonth(repeat, base) {
  const rangeParts = getDateParts(repeat.yearlyRangeEndDate);
  if (rangeParts) {return rangeParts.month;}
  return repeat.yearlyMonth || repeat.byMonth || base.yearlyMonth;
}
function resolveYearlyDay(repeat, base) {
  const rangeParts = getDateParts(repeat.yearlyRangeEndDate);
  if (rangeParts) {return rangeParts.day;}
  return repeat.yearlyDay || repeat.byMonthDay || base.yearlyDay;
}
function resolveRepeatEnd(repeat) {
  return repeat.end || { type: "never", date: "", count: 1 };
}
export function setRepeatFromSelection(
  repeat = { ...DEFAULT_TASK_REPEAT },
  target = repeatStore.repeatTarget || "task"
) {
  const base = defaultRepeatState();
  if (isRepeatDisabled(repeat)) {
    repeatStore.repeatState = { ...base, unit: TASK_REPEAT_NONE };
    resolveRepeatSelectionTarget(target, { ...DEFAULT_TASK_REPEAT });
    renderRepeatUI(target);
    return;
  }
  const unit = resolveRepeatUnit(repeat);
  const weeklyDays = resolveWeeklyDays(repeat, base.weeklyDays);
  const weeklyMode = resolveWeeklyMode(repeat, base.weeklyMode);
  const monthlyMode = resolveMonthlyMode(repeat);
  repeatStore.repeatState = {
    ...base,
    ...repeat,
    unit,
    interval: resolveRepeatInterval(repeat),
    weeklyDays,
    weeklyMode,
    monthlyMode,
    monthlyDay: resolveMonthlyDay(repeat, base),
    monthlyNth: resolveMonthlyNth(repeat, base),
    monthlyWeekday: resolveMonthlyWeekday(repeat, base),
    monthlyRangeStart: resolveMonthlyRangeStart(repeat, base),
    monthlyRangeEnd: resolveMonthlyRangeEnd(repeat, base),
    monthlyRangeStartDate: repeat.monthlyRangeStartDate || base.monthlyRangeStartDate,
    monthlyRangeEndDate: repeat.monthlyRangeEndDate || base.monthlyRangeEndDate,
    yearlyMonth: resolveYearlyMonth(repeat, base),
    yearlyDay: resolveYearlyDay(repeat, base),
    yearlyRangeStartDate: repeat.yearlyRangeStartDate || base.yearlyRangeStartDate,
    yearlyRangeEndDate: repeat.yearlyRangeEndDate || base.yearlyRangeEndDate,
    end: resolveRepeatEnd(repeat)
  };
  const built = buildRepeatFromState();
  resolveRepeatSelectionTarget(target, built);
  renderRepeatUI(target);
}
export function syncRepeatSelectLabel() {
  if (!taskRepeatSelect) {return;}
  const noneOpt = taskRepeatSelect.querySelector(`option[value="${TASK_REPEAT_NONE}"]`);
  const customOpt = taskRepeatSelect.querySelector('option[value="custom"]');
  const customNewOpt = taskRepeatSelect.querySelector('option[value="custom-new"]');
  if (noneOpt) {noneOpt.textContent = "Does not repeat";}
  if (customOpt) {
    customOpt.textContent =
      repeatStore.lastRepeatSelection.type === "custom"
        ? getRepeatSummary(repeatStore.lastRepeatSelection)
        : "Saved pattern";
  }
  if (customNewOpt) {
    customNewOpt.textContent = "Custom...";
  }
}
export function syncSubsectionRepeatLabel() {
  if (!subsectionTaskRepeatSelect) {return;}
  const noneOpt = subsectionTaskRepeatSelect.querySelector(`option[value="${TASK_REPEAT_NONE}"]`);
  const customOpt = subsectionTaskRepeatSelect.querySelector('option[value="custom"]');
  const customNewOpt = subsectionTaskRepeatSelect.querySelector('option[value="custom-new"]');
  if (noneOpt) {noneOpt.textContent = "Does not repeat";}
  if (customOpt) {
    customOpt.textContent =
      repeatStore.subsectionRepeatSelection.type === "custom"
        ? getRepeatSummary(repeatStore.subsectionRepeatSelection)
        : "Saved pattern";
  }
  if (customNewOpt) {customNewOpt.textContent = "Custom...";}
}
function buildDailyRule(interval) {
  return `FREQ=DAILY;INTERVAL=${interval}`;
}
function buildWeeklyRule(repeatState, startDate, interval, byDayCodes) {
  const days = (repeatState.weeklyDays || [startDate.getDay()]).map((d) => byDayCodes[d]);
  return `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(",")}`;
}
function buildYearlyRule(repeatState, startDate, interval) {
  const month = repeatState.yearlyMonth || startDate.getMonth() + 1;
  const day = repeatState.yearlyDay || startDate.getDate();
  return `FREQ=YEARLY;INTERVAL=${interval};BYMONTH=${month};BYMONTHDAY=${day}`;
}
function appendRepeatEnd(rule, end) {
  if (end.type === "after" && end.count) {
    return `${rule};COUNT=${end.count}`;
  }
  if (end.type === "on" && end.date) {
    const until = formatRRuleDate(end.date);
    if (until) {return `${rule};UNTIL=${until}`;}
  }
  return rule;
}
export function buildRepeatFromState() {
  const repeatState = repeatStore.repeatState;
  if (!repeatState || repeatState.unit === TASK_REPEAT_NONE) {return { ...DEFAULT_TASK_REPEAT };}
  const startDate = getStartDate();
  const unit = repeatState.unit;
  const interval = Math.max(1, Number(repeatState.interval) || 1);
  const end = repeatState.end || { type: "never" };
  const yearlyRangeParts = getDateParts(repeatState.yearlyRangeEndDate);
  const yearlyMonth = yearlyRangeParts?.month || repeatState.yearlyMonth;
  const yearlyDay = yearlyRangeParts?.day || repeatState.yearlyDay;
  const byDayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const ruleBuilders = {
    day: () => buildDailyRule(interval),
    week: () => buildWeeklyRule(repeatState, startDate, interval, byDayCodes),
    month: () => buildMonthlyRule(repeatState, startDate, interval, byDayCodes),
    year: () =>
      buildYearlyRule(
        { ...repeatState, yearlyMonth, yearlyDay },
        startDate,
        interval
      )
  };
  const ruleBuilder = ruleBuilders[unit];
  const rule = ruleBuilder ? appendRepeatEnd(ruleBuilder(), end) : "";
  return {
    type: "custom",
    unit,
    interval,
    weeklyDays: repeatState.weeklyDays,
    weeklyMode: repeatState.weeklyMode,
    monthlyMode: repeatState.monthlyMode,
    monthlyDay: repeatState.monthlyDay,
    monthlyNth: repeatState.monthlyNth,
    monthlyWeekday: repeatState.monthlyWeekday,
    monthlyRangeStart: repeatState.monthlyRangeStart,
    monthlyRangeEnd: repeatState.monthlyRangeEnd,
    monthlyRangeStartDate: repeatState.monthlyRangeStartDate,
    monthlyRangeEndDate: repeatState.monthlyRangeEndDate,
    yearlyMonth,
    yearlyDay,
    yearlyRangeStartDate: repeatState.yearlyRangeStartDate,
    yearlyRangeEndDate: repeatState.yearlyRangeEndDate,
    end,
    rrule: rule
  };
}
export function enableDeadlinePicker() {
  const openPicker = (event) => {
    if (!event?.isTrusted) {return;}
    if (typeof taskDeadlineInput.showPicker === "function") {
      try {
        taskDeadlineInput.showPicker();
      } catch (_err) {
        // Some browsers block showPicker without a direct gesture; ignore.
      }
    } else {
      taskDeadlineInput.focus();
    }
  };
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      openPicker(event);
    }
  };
  taskDeadlineInput.addEventListener("click", openPicker);
  taskDeadlineInput.addEventListener("keydown", handleKeyDown);
  return () => {
    taskDeadlineInput.removeEventListener("click", openPicker);
    taskDeadlineInput.removeEventListener("keydown", handleKeyDown);
  };
}
