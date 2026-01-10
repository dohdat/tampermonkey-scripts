import {
  DEFAULT_TASK_REPEAT,
  TASK_REPEAT_NONE,
  TEN,
  THIRTY_ONE,
  domRefs
} from "./constants.js";
import { formatRRuleDate, getLocalDateKey, getNthWeekday } from "./utils.js";
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
  repeatModalCloseBtns,
  repeatModalSaveBtn,
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
    weeklyMode: "all",
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
}
function handleTaskRepeatSelectChange() {
  const value = taskRepeatSelect.value;
  const baseSelection =
    repeatStore.lastRepeatSelection?.type === "custom"
      ? repeatStore.lastRepeatSelection
      : { ...DEFAULT_TASK_REPEAT };
  if (value === "custom" || value === "custom-new") {
    repeatStore.repeatTarget = "task";
    repeatStore.repeatSelectionBeforeModal = baseSelection;
    openRepeatModal();
    const initial =
      repeatStore.lastRepeatSelection?.type === "custom"
        ? repeatStore.lastRepeatSelection
        : {
          type: "custom",
          unit:
            repeatStore.repeatState.unit === TASK_REPEAT_NONE
              ? "week"
              : repeatStore.repeatState.unit
        };
    setRepeatFromSelection(initial);
  } else {
    setRepeatFromSelection({ ...DEFAULT_TASK_REPEAT });
  }
}
function handleSubsectionRepeatSelectChange() {
  const value = subsectionTaskRepeatSelect.value;
  const baseSelection =
    repeatStore.subsectionRepeatSelection?.type === "custom"
      ? repeatStore.subsectionRepeatSelection
      : { ...DEFAULT_TASK_REPEAT };
  if (value === "custom" || value === "custom-new") {
    repeatStore.repeatTarget = "subsection";
    repeatStore.subsectionRepeatBeforeModal = baseSelection;
    openRepeatModal();
    const initial =
      repeatStore.subsectionRepeatSelection?.type === "custom"
        ? repeatStore.subsectionRepeatSelection
        : {
          type: "custom",
          unit:
            repeatStore.repeatState.unit === TASK_REPEAT_NONE
              ? "week"
              : repeatStore.repeatState.unit
        };
    setRepeatFromSelection(initial, "subsection");
  } else {
    repeatStore.repeatTarget = "subsection";
    setRepeatFromSelection({ ...DEFAULT_TASK_REPEAT }, "subsection");
    syncSubsectionRepeatLabel();
  }
}
function handleRepeatUnitChange() {
  const unit = taskRepeatUnit.value || "week";
  repeatStore.repeatState.unit = unit;
  if (unit === "week" && (!repeatStore.repeatState.weeklyDays || repeatStore.repeatState.weeklyDays.length === 0)) {
    repeatStore.repeatState.weeklyDays = [getStartDate().getDay()];
  }
  if (unit === "month") {
    const start = getStartDate();
    repeatStore.repeatState.monthlyDay = start.getDate();
    const { nth, weekday } = getNthWeekday(start);
    repeatStore.repeatState.monthlyNth = nth;
    repeatStore.repeatState.monthlyWeekday = weekday;
    repeatStore.repeatState.monthlyRangeStart = start.getDate();
    repeatStore.repeatState.monthlyRangeEnd = start.getDate();
    repeatStore.repeatState.monthlyRangeStartDate = "";
    repeatStore.repeatState.monthlyRangeEndDate = "";
  }
  if (unit === "year") {
    const start = getStartDate();
    repeatStore.repeatState.yearlyMonth = start.getMonth() + 1;
    repeatStore.repeatState.yearlyDay = start.getDate();
    const fallback = getLocalDateKey(start);
    repeatStore.repeatState.yearlyRangeStartDate = fallback;
    repeatStore.repeatState.yearlyRangeEndDate = fallback;
  }
  renderRepeatUI();
}
function handleRepeatIntervalInput() { const parsed = Math.max(1, Number(taskRepeatInterval.value) || 1); repeatStore.repeatState.interval = parsed; taskRepeatInterval.value = parsed; }
function handleRepeatWeekdaysClick(event) {
  const btn = event.target.closest("button[data-day-value]");
  if (!btn) {return;}
  const day = Number(btn.dataset.dayValue);
  const set = new Set(repeatStore.repeatState.weeklyDays || []);
  if (set.has(day)) {
    set.delete(day);
  } else {
    set.add(day);
  }
  if (set.size === 0) {set.add(getStartDate().getDay());}
  repeatStore.repeatState.weeklyDays = Array.from(set);
  renderRepeatUI();
}
function handleRepeatWeeklyModeAnyChange() { if (taskRepeatWeeklyModeAny.checked) { repeatStore.repeatState.weeklyMode = "any"; renderRepeatUI(); } }
function handleRepeatWeeklyModeAllChange() { if (taskRepeatWeeklyModeAll.checked) { repeatStore.repeatState.weeklyMode = "all"; renderRepeatUI(); } }
function handleRepeatMonthlyModeChange() { repeatStore.repeatState.monthlyMode = taskRepeatMonthlyMode.value || "day"; renderRepeatUI(); }
function handleRepeatMonthlyDayInput() { const val = Math.min(THIRTY_ONE, Math.max(1, Number(taskRepeatMonthlyDay.value) || 1)); repeatStore.repeatState.monthlyDay = val; taskRepeatMonthlyDay.value = val; }
function handleRepeatMonthlyNthChange() { repeatStore.repeatState.monthlyNth = Number(taskRepeatMonthlyNth.value) || 1; }
function handleRepeatMonthlyWeekdayChange() { repeatStore.repeatState.monthlyWeekday = Number(taskRepeatMonthlyWeekday.value) || 0; }
function handleRepeatYearlyRangeStartInput() {
  const baseDate = getStartDate();
  repeatStore.repeatState.yearlyRangeStartDate =
    taskRepeatYearlyRangeStart.value || getLocalDateKey(baseDate);
  syncYearlyRangeInputs(repeatStore.repeatState, baseDate, taskRepeatYearlyRangeStart, taskRepeatYearlyRangeEnd);
}
function handleRepeatYearlyRangeEndInput() {
  const baseDate = getStartDate();
  const endValue = taskRepeatYearlyRangeEnd.value || getLocalDateKey(baseDate);
  repeatStore.repeatState.yearlyRangeEndDate = endValue;
  const parts = getDateParts(endValue);
  if (parts) {
    repeatStore.repeatState.yearlyMonth = parts.month;
    repeatStore.repeatState.yearlyDay = parts.day;
  }
  syncYearlyRangeInputs(repeatStore.repeatState, baseDate, taskRepeatYearlyRangeStart, taskRepeatYearlyRangeEnd);
}
function updateRepeatEnd() {
  if (taskRepeatEndAfter.checked) {
    repeatStore.repeatState.end = {
      type: "after",
      count: Math.max(1, Number(taskRepeatEndCount.value) || 1)
    };
  } else if (taskRepeatEndOn.checked) {
    repeatStore.repeatState.end = { type: "on", date: taskRepeatEndDate.value };
  } else {
    repeatStore.repeatState.end = { type: "never", date: "", count: 1 };
  }
}
function handleRepeatEndCountInput() { taskRepeatEndCount.value = Math.max(1, Number(taskRepeatEndCount.value) || 1); updateRepeatEnd(); }
function handleRepeatModalCloseClick() {
  closeRepeatModal();
  if (repeatStore.repeatTarget === "subsection") {
    setRepeatFromSelection(repeatStore.subsectionRepeatBeforeModal || { ...DEFAULT_TASK_REPEAT }, "subsection");
    const prev = repeatStore.subsectionRepeatBeforeModal || { ...DEFAULT_TASK_REPEAT };
    subsectionTaskRepeatSelect.value = prev.type === "custom" ? "custom" : TASK_REPEAT_NONE;
    syncSubsectionRepeatLabel();
  } else {
    setRepeatFromSelection(repeatStore.repeatSelectionBeforeModal || { ...DEFAULT_TASK_REPEAT }, "task");
    const prev = repeatStore.repeatSelectionBeforeModal || { ...DEFAULT_TASK_REPEAT };
    taskRepeatSelect.value = prev.type === "custom" ? "custom" : TASK_REPEAT_NONE;
    syncRepeatSelectLabel();
  }
  repeatStore.repeatTarget = "task";
}
function handleRepeatModalSaveClick() {
  const repeat = buildRepeatFromState();
  if (repeatStore.repeatTarget === "subsection") {
    repeatStore.subsectionRepeatSelection = repeat;
    setRepeatFromSelection(repeat, "subsection");
    subsectionTaskRepeatSelect.value = "custom";
    syncSubsectionRepeatLabel();
  } else {
    repeatStore.lastRepeatSelection = repeat;
    setRepeatFromSelection(repeat, "task");
    taskRepeatSelect.value = "custom";
    syncRepeatSelectLabel();
  }
  closeRepeatModal();
  repeatStore.repeatTarget = "task";
}
export function registerRepeatEventHandlers() {
  registerRepeatSelectHandlers();
  registerRepeatStateHandlers();
  registerRepeatModalHandlers();
}
function registerRepeatSelectHandlers() {
  taskRepeatSelect?.addEventListener("change", handleTaskRepeatSelectChange);
  subsectionTaskRepeatSelect?.addEventListener("change", handleSubsectionRepeatSelectChange);
}
function registerRepeatUnitHandlers() {
  taskRepeatUnit?.addEventListener("change", handleRepeatUnitChange);
}
function registerRepeatIntervalHandlers() {
  taskRepeatInterval?.addEventListener("input", handleRepeatIntervalInput);
}
function registerRepeatWeeklyHandlers() {
  taskRepeatWeekdays?.addEventListener("click", handleRepeatWeekdaysClick);
  taskRepeatWeeklyModeAny?.addEventListener("change", handleRepeatWeeklyModeAnyChange);
  taskRepeatWeeklyModeAll?.addEventListener("change", handleRepeatWeeklyModeAllChange);
}
function registerRepeatMonthlyHandlers() {
  taskRepeatMonthlyMode?.addEventListener("change", handleRepeatMonthlyModeChange);
  taskRepeatMonthlyDay?.addEventListener("input", handleRepeatMonthlyDayInput);
  taskRepeatMonthlyNth?.addEventListener("change", handleRepeatMonthlyNthChange);
  taskRepeatMonthlyWeekday?.addEventListener("change", handleRepeatMonthlyWeekdayChange);
}
function registerRepeatYearlyHandlers() {
  taskRepeatYearlyRangeStart?.addEventListener("input", handleRepeatYearlyRangeStartInput);
  taskRepeatYearlyRangeEnd?.addEventListener("input", handleRepeatYearlyRangeEndInput);
}
function registerRepeatEndHandlers() {
  taskRepeatEndNever?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndOn?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndAfter?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndDate?.addEventListener("input", updateRepeatEnd);
  taskRepeatEndCount?.addEventListener("input", handleRepeatEndCountInput);
}
function registerRepeatStateHandlers() {
  registerRepeatUnitHandlers();
  registerRepeatIntervalHandlers();
  registerRepeatWeeklyHandlers();
  registerRepeatMonthlyHandlers();
  registerRepeatYearlyHandlers();
  registerRepeatEndHandlers();
}
function registerRepeatModalHandlers() {
  repeatModalCloseBtns.forEach((btn) =>
    btn.addEventListener("click", handleRepeatModalCloseClick)
  );
  repeatModalSaveBtn?.addEventListener("click", handleRepeatModalSaveClick);
}
