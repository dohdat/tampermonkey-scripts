import {
  DEFAULT_TASK_REPEAT,
  TASK_REPEAT_NONE,
  THIRTY_ONE,
  domRefs
} from "./constants.js";
import { getLocalDateKey, getNthWeekday } from "./utils.js";
import { getDateParts, syncYearlyRangeInputs } from "./repeat-yearly.js";
import { updateMonthlyRangeState } from "./repeat-monthly.js";
import {
  buildRepeatFromState,
  closeRepeatModal,
  getStartDate,
  openRepeatModal,
  renderRepeatUI,
  repeatStore,
  setRepeatFromSelection,
  syncRepeatSelectLabel,
  syncSubsectionRepeatLabel
} from "./repeat.js";

const {
  taskRepeatSelect,
  taskRepeatUnit,
  taskRepeatInterval,
  taskRepeatWeekdays,
  taskRepeatWeeklyModeAny,
  taskRepeatWeeklyModeAll,
  taskRepeatMonthlyMode,
  taskRepeatMonthlyDay,
  taskRepeatMonthlyNth,
  taskRepeatMonthlyWeekday,
  taskRepeatMonthlyRangeStart,
  taskRepeatMonthlyRangeEnd,
  taskRepeatYearlyRangeStart,
  taskRepeatYearlyRangeEnd,
  taskRepeatEndNever,
  taskRepeatEndOn,
  taskRepeatEndAfter,
  taskRepeatEndDate,
  taskRepeatEndCount,
  repeatModalCloseBtns,
  repeatModalSaveBtn
} = domRefs;

function getSubsectionRepeatSelect() {
  return domRefs.subsectionTaskRepeatSelect;
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
  const subsectionTaskRepeatSelect = getSubsectionRepeatSelect();
  if (!subsectionTaskRepeatSelect) {return;}
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

function handleRepeatIntervalInput() {
  const parsed = Math.max(1, Number(taskRepeatInterval.value) || 1);
  repeatStore.repeatState.interval = parsed;
  taskRepeatInterval.value = parsed;
}

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

function handleRepeatWeeklyModeAnyChange() {
  if (taskRepeatWeeklyModeAny.checked) {
    repeatStore.repeatState.weeklyMode = "any";
    renderRepeatUI();
  }
}

function handleRepeatWeeklyModeAllChange() {
  if (taskRepeatWeeklyModeAll.checked) {
    repeatStore.repeatState.weeklyMode = "all";
    renderRepeatUI();
  }
}

function handleRepeatMonthlyModeChange() {
  repeatStore.repeatState.monthlyMode = taskRepeatMonthlyMode.value || "day";
  renderRepeatUI();
}

function handleRepeatMonthlyDayInput() {
  const val = Math.min(THIRTY_ONE, Math.max(1, Number(taskRepeatMonthlyDay.value) || 1));
  repeatStore.repeatState.monthlyDay = val;
  taskRepeatMonthlyDay.value = val;
}

function handleRepeatMonthlyNthChange() {
  repeatStore.repeatState.monthlyNth = Number(taskRepeatMonthlyNth.value) || 1;
}

function handleRepeatMonthlyWeekdayChange() {
  repeatStore.repeatState.monthlyWeekday = Number(taskRepeatMonthlyWeekday.value) || 0;
}

function resolveMonthlyRangeDay(value, fallbackDay) {
  if (!value) {return fallbackDay;}
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-(\d{2})/);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : fallbackDay;
    }
    const dayMatch = value.match(/^\d{1,2}$/);
    if (dayMatch) {
      const parsed = Number(dayMatch[0]);
      return Number.isFinite(parsed) ? parsed : fallbackDay;
    }
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {return date.getDate();}
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackDay;
}

function resolveMonthlyRangeDateValue(value) {
  if (typeof value !== "string") {return "";}
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value : "";
}

function handleRepeatMonthlyRangeStartInput() {
  const baseDate = getStartDate();
  const startValue = taskRepeatMonthlyRangeStart.value || "";
  const endValue = taskRepeatMonthlyRangeEnd?.value || "";
  const fallbackStart = repeatStore.repeatState.monthlyRangeStart || baseDate.getDate();
  const fallbackEnd = repeatStore.repeatState.monthlyRangeEnd || fallbackStart;
  const startDay = resolveMonthlyRangeDay(startValue, fallbackStart);
  const endDay = resolveMonthlyRangeDay(endValue, fallbackEnd);
  updateMonthlyRangeState(
    repeatStore.repeatState,
    baseDate,
    startDay,
    endDay,
    taskRepeatMonthlyRangeStart,
    taskRepeatMonthlyRangeEnd,
    resolveMonthlyRangeDateValue(startValue),
    resolveMonthlyRangeDateValue(endValue)
  );
}

function handleRepeatMonthlyRangeEndInput() {
  const baseDate = getStartDate();
  const startValue = taskRepeatMonthlyRangeStart?.value || "";
  const endValue = taskRepeatMonthlyRangeEnd.value || "";
  const fallbackStart = repeatStore.repeatState.monthlyRangeStart || baseDate.getDate();
  const fallbackEnd = repeatStore.repeatState.monthlyRangeEnd || fallbackStart;
  const startDay = resolveMonthlyRangeDay(startValue, fallbackStart);
  const endDay = resolveMonthlyRangeDay(endValue, fallbackEnd);
  updateMonthlyRangeState(
    repeatStore.repeatState,
    baseDate,
    startDay,
    endDay,
    taskRepeatMonthlyRangeStart,
    taskRepeatMonthlyRangeEnd,
    resolveMonthlyRangeDateValue(startValue),
    resolveMonthlyRangeDateValue(endValue)
  );
}

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

function handleRepeatEndCountInput() {
  taskRepeatEndCount.value = Math.max(1, Number(taskRepeatEndCount.value) || 1);
  updateRepeatEnd();
}

function handleRepeatModalCloseClick() {
  closeRepeatModal();
  if (repeatStore.repeatTarget === "subsection") {
    setRepeatFromSelection(repeatStore.subsectionRepeatBeforeModal || { ...DEFAULT_TASK_REPEAT }, "subsection");
    const prev = repeatStore.subsectionRepeatBeforeModal || { ...DEFAULT_TASK_REPEAT };
    const subsectionTaskRepeatSelect = getSubsectionRepeatSelect();
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value = prev.type === "custom" ? "custom" : TASK_REPEAT_NONE;
    }
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
    const subsectionTaskRepeatSelect = getSubsectionRepeatSelect();
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value = "custom";
    }
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
  const cleanupFns = [
    ...registerRepeatSelectHandlers(),
    ...registerRepeatStateHandlers(),
    ...registerRepeatModalHandlers()
  ];
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

function registerRepeatSelectHandlers() {
  const cleanupFns = [];
  if (taskRepeatSelect) {
    taskRepeatSelect.addEventListener("change", handleTaskRepeatSelectChange);
    cleanupFns.push(() =>
      taskRepeatSelect.removeEventListener("change", handleTaskRepeatSelectChange)
    );
  }
  const subsectionTaskRepeatSelect = getSubsectionRepeatSelect();
  if (subsectionTaskRepeatSelect) {
    subsectionTaskRepeatSelect.addEventListener("change", handleSubsectionRepeatSelectChange);
    cleanupFns.push(() =>
      subsectionTaskRepeatSelect.removeEventListener("change", handleSubsectionRepeatSelectChange)
    );
  }
  return cleanupFns;
}

function registerRepeatUnitHandlers() {
  const cleanupFns = [];
  if (taskRepeatUnit) {
    taskRepeatUnit.addEventListener("change", handleRepeatUnitChange);
    cleanupFns.push(() => taskRepeatUnit.removeEventListener("change", handleRepeatUnitChange));
  }
  return cleanupFns;
}

function registerRepeatIntervalHandlers() {
  const cleanupFns = [];
  if (taskRepeatInterval) {
    taskRepeatInterval.addEventListener("input", handleRepeatIntervalInput);
    cleanupFns.push(() =>
      taskRepeatInterval.removeEventListener("input", handleRepeatIntervalInput)
    );
  }
  return cleanupFns;
}

function registerRepeatWeeklyHandlers() {
  const cleanupFns = [];
  if (taskRepeatWeekdays) {
    taskRepeatWeekdays.addEventListener("click", handleRepeatWeekdaysClick);
    cleanupFns.push(() =>
      taskRepeatWeekdays.removeEventListener("click", handleRepeatWeekdaysClick)
    );
  }
  if (taskRepeatWeeklyModeAny) {
    taskRepeatWeeklyModeAny.addEventListener("change", handleRepeatWeeklyModeAnyChange);
    cleanupFns.push(() =>
      taskRepeatWeeklyModeAny.removeEventListener("change", handleRepeatWeeklyModeAnyChange)
    );
  }
  if (taskRepeatWeeklyModeAll) {
    taskRepeatWeeklyModeAll.addEventListener("change", handleRepeatWeeklyModeAllChange);
    cleanupFns.push(() =>
      taskRepeatWeeklyModeAll.removeEventListener("change", handleRepeatWeeklyModeAllChange)
    );
  }
  return cleanupFns;
}

function registerRepeatMonthlyHandlers() {
  const cleanupFns = [];
  if (taskRepeatMonthlyMode) {
    taskRepeatMonthlyMode.addEventListener("change", handleRepeatMonthlyModeChange);
    cleanupFns.push(() =>
      taskRepeatMonthlyMode.removeEventListener("change", handleRepeatMonthlyModeChange)
    );
  }
  if (taskRepeatMonthlyDay) {
    taskRepeatMonthlyDay.addEventListener("input", handleRepeatMonthlyDayInput);
    cleanupFns.push(() =>
      taskRepeatMonthlyDay.removeEventListener("input", handleRepeatMonthlyDayInput)
    );
  }
  if (taskRepeatMonthlyNth) {
    taskRepeatMonthlyNth.addEventListener("change", handleRepeatMonthlyNthChange);
    cleanupFns.push(() =>
      taskRepeatMonthlyNth.removeEventListener("change", handleRepeatMonthlyNthChange)
    );
  }
  if (taskRepeatMonthlyWeekday) {
    taskRepeatMonthlyWeekday.addEventListener("change", handleRepeatMonthlyWeekdayChange);
    cleanupFns.push(() =>
      taskRepeatMonthlyWeekday.removeEventListener("change", handleRepeatMonthlyWeekdayChange)
    );
  }
  if (taskRepeatMonthlyRangeStart) {
    taskRepeatMonthlyRangeStart.addEventListener("input", handleRepeatMonthlyRangeStartInput);
    cleanupFns.push(() =>
      taskRepeatMonthlyRangeStart.removeEventListener("input", handleRepeatMonthlyRangeStartInput)
    );
  }
  if (taskRepeatMonthlyRangeEnd) {
    taskRepeatMonthlyRangeEnd.addEventListener("input", handleRepeatMonthlyRangeEndInput);
    cleanupFns.push(() =>
      taskRepeatMonthlyRangeEnd.removeEventListener("input", handleRepeatMonthlyRangeEndInput)
    );
  }
  return cleanupFns;
}

function registerRepeatYearlyHandlers() {
  const cleanupFns = [];
  if (taskRepeatYearlyRangeStart) {
    taskRepeatYearlyRangeStart.addEventListener("input", handleRepeatYearlyRangeStartInput);
    cleanupFns.push(() =>
      taskRepeatYearlyRangeStart.removeEventListener("input", handleRepeatYearlyRangeStartInput)
    );
  }
  if (taskRepeatYearlyRangeEnd) {
    taskRepeatYearlyRangeEnd.addEventListener("input", handleRepeatYearlyRangeEndInput);
    cleanupFns.push(() =>
      taskRepeatYearlyRangeEnd.removeEventListener("input", handleRepeatYearlyRangeEndInput)
    );
  }
  return cleanupFns;
}

function registerRepeatEndHandlers() {
  const cleanupFns = [];
  if (taskRepeatEndNever) {
    taskRepeatEndNever.addEventListener("change", updateRepeatEnd);
    cleanupFns.push(() => taskRepeatEndNever.removeEventListener("change", updateRepeatEnd));
  }
  if (taskRepeatEndOn) {
    taskRepeatEndOn.addEventListener("change", updateRepeatEnd);
    cleanupFns.push(() => taskRepeatEndOn.removeEventListener("change", updateRepeatEnd));
  }
  if (taskRepeatEndAfter) {
    taskRepeatEndAfter.addEventListener("change", updateRepeatEnd);
    cleanupFns.push(() => taskRepeatEndAfter.removeEventListener("change", updateRepeatEnd));
  }
  if (taskRepeatEndDate) {
    taskRepeatEndDate.addEventListener("input", updateRepeatEnd);
    cleanupFns.push(() => taskRepeatEndDate.removeEventListener("input", updateRepeatEnd));
  }
  if (taskRepeatEndCount) {
    taskRepeatEndCount.addEventListener("input", handleRepeatEndCountInput);
    cleanupFns.push(() =>
      taskRepeatEndCount.removeEventListener("input", handleRepeatEndCountInput)
    );
  }
  return cleanupFns;
}

function registerRepeatStateHandlers() {
  return [
    ...registerRepeatUnitHandlers(),
    ...registerRepeatIntervalHandlers(),
    ...registerRepeatWeeklyHandlers(),
    ...registerRepeatMonthlyHandlers(),
    ...registerRepeatYearlyHandlers(),
    ...registerRepeatEndHandlers()
  ];
}

function registerRepeatModalHandlers() {
  const cleanupFns = [];
  repeatModalCloseBtns.forEach((btn) => {
    btn.addEventListener("click", handleRepeatModalCloseClick);
    cleanupFns.push(() => btn.removeEventListener("click", handleRepeatModalCloseClick));
  });
  if (repeatModalSaveBtn) {
    repeatModalSaveBtn.addEventListener("click", handleRepeatModalSaveClick);
    cleanupFns.push(() =>
      repeatModalSaveBtn.removeEventListener("click", handleRepeatModalSaveClick)
    );
  }
  return cleanupFns;
}
