import { dayOptions, domRefs } from "./constants.js";
import {
  formatDate,
  formatOrdinal,
  formatRRuleDate,
  getNthWeekday,
  getWeekdayShortLabel
} from "./utils.js";

const {
  taskDeadlineInput,
  taskRepeatSelect,
  taskRepeatUnit,
  taskRepeatInterval,
  taskRepeatWeekdays,
  taskRepeatMonthlyMode,
  taskRepeatMonthlyDay,
  taskRepeatMonthlyNth,
  taskRepeatMonthlyWeekday,
  taskRepeatWeeklySection,
  taskRepeatMonthlySection,
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
    unit: "none",
    interval: 1,
    weeklyDays: [weekday],
    monthlyMode: "day",
    monthlyDay: monthDay,
    monthlyNth: nth,
    monthlyWeekday: weekday,
    yearlyMonth: startDate.getMonth() + 1,
    yearlyDay: monthDay,
    end: { type: "never", date: "", count: 1 }
  };
}

export const repeatStore = {
  repeatState: defaultRepeatState(),
  lastRepeatSelection: { type: "none" },
  repeatSelectionBeforeModal: { type: "none" },
  repeatTarget: "task",
  subsectionRepeatSelection: { type: "none" },
  subsectionRepeatBeforeModal: { type: "none" }
};

export function renderRepeatWeekdayOptions(selected = []) {
  if (!taskRepeatWeekdays) {return;}
  taskRepeatWeekdays.innerHTML = "";
  dayOptions.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.dayValue = String(day.value);
    btn.className =
      "rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200";
    btn.textContent = getWeekdayShortLabel(day.value);
    if (selected.includes(day.value)) {
      btn.classList.add("bg-lime-400/10", "border-lime-400", "text-lime-300");
    }
    taskRepeatWeekdays.appendChild(btn);
  });
}

export function openRepeatModal() {
  if (repeatModal) {repeatModal.classList.remove("hidden");}
}

export function closeRepeatModal() {
  if (repeatModal) {repeatModal.classList.add("hidden");}
}

function resolveWeeklyDays(repeat, fallback) {
  if (Array.isArray(repeat.weeklyDays)) {return repeat.weeklyDays;}
  if (Array.isArray(repeat.byWeekdays)) {return repeat.byWeekdays;}
  return fallback;
}

function buildRepeatFrequencyPart(unit, interval) {
  return `Every ${interval} ${unit}${interval > 1 ? "s" : ""}`;
}

function buildWeeklySummaryPart(repeat, unit, fallbackDays) {
  if (unit !== "week") {return "";}
  const weeklyDays = resolveWeeklyDays(repeat, fallbackDays);
  if (!weeklyDays.length) {return "";}
  const labels = weeklyDays.map((d) => getWeekdayShortLabel(d)).filter(Boolean);
  return labels.length ? `on ${labels.join(", ")}` : "";
}

function buildMonthlySummaryPart(repeat, unit) {
  if (unit !== "month") {return "";}
  if (repeat.monthlyMode === "nth") {
    const weekdayLabel =
      dayOptions.find((d) => d.value === repeat.monthlyWeekday)?.label || "";
    return `on the ${formatOrdinal(repeat.monthlyNth || 1)} ${weekdayLabel}`;
  }
  return `on day ${repeat.monthlyDay || 1}`;
}

function buildYearlySummaryPart(repeat, unit) {
  if (unit !== "year") {return "";}
  return `on ${repeat.yearlyMonth || ""}/${repeat.yearlyDay || ""}`;
}

function buildRepeatEndPart(end) {
  if (end.type === "on" && end.date) {
    return `until ${formatDate(end.date)}`;
  }
  if (end.type === "after" && end.count) {
    return `for ${end.count} time${end.count > 1 ? "s" : ""}`;
  }
  return "";
}

function isRepeatDisabled(repeat) {
  return !repeat || repeat.type === "none";
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

function syncMonthlyModeText(repeatState) {
  if (!taskRepeatMonthlyMode) {return;}
  const dayOpt = taskRepeatMonthlyMode.querySelector('option[value="day"]');
  const nthOpt = taskRepeatMonthlyMode.querySelector('option[value="nth"]');
  if (dayOpt) {dayOpt.textContent = `Monthly on day ${repeatState.monthlyDay || 1}`;}
  if (nthOpt) {
    nthOpt.textContent = `Monthly on the ${formatOrdinal(repeatState.monthlyNth || 1)} ${dayOptions.find((d) => d.value === repeatState.monthlyWeekday)?.label || "weekday"}`;
  }
}

function syncMonthlyModeVisibility(repeatState) {
  const isDayMode = repeatState.monthlyMode === "day";
  const isNthMode = repeatState.monthlyMode === "nth";
  if (taskRepeatMonthlyDay) {taskRepeatMonthlyDay.disabled = !isDayMode;}
  if (taskRepeatMonthlyNth) {taskRepeatMonthlyNth.disabled = !isNthMode;}
  if (taskRepeatMonthlyWeekday) {taskRepeatMonthlyWeekday.disabled = !isNthMode;}
  if (taskRepeatMonthlyDayWrap) {
    taskRepeatMonthlyDayWrap.classList.toggle("hidden", !isDayMode);
    taskRepeatMonthlyDayWrap.style.display = isDayMode ? "" : "none";
  }
  if (taskRepeatMonthlyNthWrap) {
    taskRepeatMonthlyNthWrap.classList.toggle("hidden", !isNthMode);
    taskRepeatMonthlyNthWrap.style.display = isNthMode ? "" : "none";
  }
}

function syncRepeatEndControls(repeatState) {
  const endType = repeatState.end?.type || "never";
  taskRepeatEndNever.checked = endType === "never";
  taskRepeatEndOn.checked = endType === "on";
  taskRepeatEndAfter.checked = endType === "after";
  taskRepeatEndDate.value = repeatState.end?.date ? repeatState.end.date.slice(0, 10) : "";
  taskRepeatEndCount.value = repeatState.end?.count ? Number(repeatState.end.count) : 1;
}

function syncRepeatTargetSelect(target) {
  if (target === "task") {
    taskRepeatSelect.value = repeatStore.lastRepeatSelection.type === "custom" ? "custom" : "none";
    syncRepeatSelectLabel();
    return;
  }
  if (target === "subsection") {
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value =
        repeatStore.subsectionRepeatSelection.type === "custom" ? "custom" : "none";
    }
    syncSubsectionRepeatLabel();
  }
}

export function renderRepeatUI(target = repeatStore.repeatTarget) {
  if (!taskRepeatUnit) {return;}
  const repeatState = repeatStore.repeatState;
  taskRepeatUnit.value = repeatState.unit === "none" ? "week" : repeatState.unit;
  taskRepeatInterval.value = repeatState.interval;
  taskRepeatWeeklySection.classList.toggle("hidden", repeatState.unit !== "week");
  taskRepeatMonthlySection.classList.toggle("hidden", repeatState.unit !== "month");
  renderRepeatWeekdayOptions(repeatState.weeklyDays || []);
  setInputValue(taskRepeatMonthlyMode, repeatState.monthlyMode || "day");
  setInputValue(taskRepeatMonthlyDay, repeatState.monthlyDay || 1);
  setInputValue(taskRepeatMonthlyNth, String(repeatState.monthlyNth || 1));
  setInputValue(taskRepeatMonthlyWeekday, String(repeatState.monthlyWeekday ?? 0));
  syncMonthlyModeText(repeatState);
  syncMonthlyModeVisibility(repeatState);
  syncRepeatEndControls(repeatState);
  syncRepeatTargetSelect(target);
}

function resolveRepeatUnit(repeat) {
  if (repeat.unit) {return repeat.unit;}
  const frequencyMap = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year"
  };
  return frequencyMap[repeat.frequency] || "week";
}

function resolveMonthlyMode(repeat) {
  if (repeat.monthlyMode) {return repeat.monthlyMode;}
  if (repeat.bySetPos) {return "nth";}
  if (repeat.byMonthDay) {return "day";}
  return "day";
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

function resolveMonthlyDay(repeat, base) {
  return repeat.monthlyDay || repeat.byMonthDay || base.monthlyDay;
}

function resolveMonthlyNth(repeat, base) {
  return repeat.monthlyNth || repeat.bySetPos || base.monthlyNth;
}

function resolveYearlyMonth(repeat, base) {
  return repeat.yearlyMonth || repeat.byMonth || base.yearlyMonth;
}

function resolveYearlyDay(repeat, base) {
  return repeat.yearlyDay || repeat.byMonthDay || base.yearlyDay;
}

function resolveRepeatEnd(repeat) {
  return repeat.end || { type: "never", date: "", count: 1 };
}

export function setRepeatFromSelection(
  repeat = { type: "none" },
  target = repeatStore.repeatTarget || "task"
) {
  const base = defaultRepeatState();
  if (isRepeatDisabled(repeat)) {
    repeatStore.repeatState = { ...base, unit: "none" };
    resolveRepeatSelectionTarget(target, { type: "none" });
    renderRepeatUI(target);
    return;
  }
  const unit = resolveRepeatUnit(repeat);
  const weeklyDays = resolveWeeklyDays(repeat, base.weeklyDays);
  const monthlyMode = resolveMonthlyMode(repeat);
  repeatStore.repeatState = {
    ...base,
    ...repeat,
    unit,
    interval: resolveRepeatInterval(repeat),
    weeklyDays,
    monthlyMode,
    monthlyDay: resolveMonthlyDay(repeat, base),
    monthlyNth: resolveMonthlyNth(repeat, base),
    monthlyWeekday: resolveMonthlyWeekday(repeat, base),
    yearlyMonth: resolveYearlyMonth(repeat, base),
    yearlyDay: resolveYearlyDay(repeat, base),
    end: resolveRepeatEnd(repeat)
  };
  const built = buildRepeatFromState();
  resolveRepeatSelectionTarget(target, built);
  renderRepeatUI(target);
}

export function syncRepeatSelectLabel() {
  if (!taskRepeatSelect) {return;}
  const noneOpt = taskRepeatSelect.querySelector('option[value="none"]');
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
  const noneOpt = subsectionTaskRepeatSelect.querySelector('option[value="none"]');
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

function buildMonthlyRule(repeatState, startDate, interval, byDayCodes) {
  if (repeatState.monthlyMode === "nth") {
    const byday = byDayCodes[repeatState.monthlyWeekday ?? startDate.getDay()];
    const bysetpos = repeatState.monthlyNth ?? getNthWeekday(startDate).nth;
    return `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${byday};BYSETPOS=${bysetpos}`;
  }
  const day = repeatState.monthlyDay || startDate.getDate();
  return `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${day}`;
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
  if (!repeatState || repeatState.unit === "none") {return { type: "none" };}
  const startDate = getStartDate();
  const unit = repeatState.unit;
  const interval = Math.max(1, Number(repeatState.interval) || 1);
  const end = repeatState.end || { type: "never" };
  const byDayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const ruleBuilders = {
    day: () => buildDailyRule(interval),
    week: () => buildWeeklyRule(repeatState, startDate, interval, byDayCodes),
    month: () => buildMonthlyRule(repeatState, startDate, interval, byDayCodes),
    year: () => buildYearlyRule(repeatState, startDate, interval)
  };
  const ruleBuilder = ruleBuilders[unit];
  const rule = ruleBuilder ? appendRepeatEnd(ruleBuilder(), end) : "";
  return {
    type: "custom",
    unit,
    interval,
    weeklyDays: repeatState.weeklyDays,
    monthlyMode: repeatState.monthlyMode,
    monthlyDay: repeatState.monthlyDay,
    monthlyNth: repeatState.monthlyNth,
    monthlyWeekday: repeatState.monthlyWeekday,
    yearlyMonth: repeatState.yearlyMonth,
    yearlyDay: repeatState.yearlyDay,
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

export function registerRepeatEventHandlers() {
  registerRepeatSelectHandlers();
  registerRepeatStateHandlers();
  registerRepeatModalHandlers();
}

function registerRepeatSelectHandlers() {
  taskRepeatSelect?.addEventListener("change", () => {
    const value = taskRepeatSelect.value;
    const baseSelection =
      repeatStore.lastRepeatSelection?.type === "custom"
        ? repeatStore.lastRepeatSelection
        : { type: "none" };
    if (value === "custom" || value === "custom-new") {
      repeatStore.repeatTarget = "task";
      repeatStore.repeatSelectionBeforeModal = baseSelection;
      openRepeatModal();
      const initial =
        repeatStore.lastRepeatSelection?.type === "custom"
          ? repeatStore.lastRepeatSelection
          : { type: "custom", unit: repeatStore.repeatState.unit === "none" ? "week" : repeatStore.repeatState.unit };
      setRepeatFromSelection(initial);
    } else {
      setRepeatFromSelection({ type: "none" });
    }
  });

  subsectionTaskRepeatSelect?.addEventListener("change", () => {
    const value = subsectionTaskRepeatSelect.value;
    const baseSelection =
      repeatStore.subsectionRepeatSelection?.type === "custom"
        ? repeatStore.subsectionRepeatSelection
        : { type: "none" };
    if (value === "custom" || value === "custom-new") {
      repeatStore.repeatTarget = "subsection";
      repeatStore.subsectionRepeatBeforeModal = baseSelection;
      openRepeatModal();
      const initial =
        repeatStore.subsectionRepeatSelection?.type === "custom"
          ? repeatStore.subsectionRepeatSelection
          : { type: "custom", unit: repeatStore.repeatState.unit === "none" ? "week" : repeatStore.repeatState.unit };
      setRepeatFromSelection(initial, "subsection");
    } else {
      repeatStore.repeatTarget = "subsection";
      setRepeatFromSelection({ type: "none" }, "subsection");
      syncSubsectionRepeatLabel();
    }
  });
}

function registerRepeatStateHandlers() {
  taskRepeatUnit?.addEventListener("change", () => {
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
    }
    if (unit === "year") {
      const start = getStartDate();
      repeatStore.repeatState.yearlyMonth = start.getMonth() + 1;
      repeatStore.repeatState.yearlyDay = start.getDate();
    }
    renderRepeatUI();
  });

  taskRepeatInterval?.addEventListener("input", () => {
    const parsed = Math.max(1, Number(taskRepeatInterval.value) || 1);
    repeatStore.repeatState.interval = parsed;
    taskRepeatInterval.value = parsed;
  });

  taskRepeatWeekdays?.addEventListener("click", (event) => {
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
  });

  taskRepeatMonthlyMode?.addEventListener("change", () => {
    repeatStore.repeatState.monthlyMode = taskRepeatMonthlyMode.value || "day";
    renderRepeatUI();
  });
  taskRepeatMonthlyDay?.addEventListener("input", () => {
    const val = Math.min(31, Math.max(1, Number(taskRepeatMonthlyDay.value) || 1));
    repeatStore.repeatState.monthlyDay = val;
    taskRepeatMonthlyDay.value = val;
  });
  taskRepeatMonthlyNth?.addEventListener("change", () => {
    repeatStore.repeatState.monthlyNth = Number(taskRepeatMonthlyNth.value) || 1;
  });
  taskRepeatMonthlyWeekday?.addEventListener("change", () => {
    repeatStore.repeatState.monthlyWeekday = Number(taskRepeatMonthlyWeekday.value) || 0;
  });
  const updateRepeatEnd = () => {
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
  };
  taskRepeatEndNever?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndOn?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndAfter?.addEventListener("change", updateRepeatEnd);
  taskRepeatEndDate?.addEventListener("input", updateRepeatEnd);
  taskRepeatEndCount?.addEventListener("input", () => {
    taskRepeatEndCount.value = Math.max(1, Number(taskRepeatEndCount.value) || 1);
    updateRepeatEnd();
  });
}

function registerRepeatModalHandlers() {
  repeatModalCloseBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      closeRepeatModal();
      if (repeatStore.repeatTarget === "subsection") {
        setRepeatFromSelection(repeatStore.subsectionRepeatBeforeModal || { type: "none" }, "subsection");
        const prev = repeatStore.subsectionRepeatBeforeModal || { type: "none" };
        subsectionTaskRepeatSelect.value = prev.type === "custom" ? "custom" : "none";
        syncSubsectionRepeatLabel();
      } else {
        setRepeatFromSelection(repeatStore.repeatSelectionBeforeModal || { type: "none" }, "task");
        const prev = repeatStore.repeatSelectionBeforeModal || { type: "none" };
        taskRepeatSelect.value = prev.type === "custom" ? "custom" : "none";
        syncRepeatSelectLabel();
      }
      repeatStore.repeatTarget = "task";
    })
  );
  repeatModalSaveBtn?.addEventListener("click", () => {
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
  });
}
