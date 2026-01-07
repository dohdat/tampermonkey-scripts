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

export function getRepeatSummary(repeat) {
  if (!repeat || repeat.type === "none") {return "Does not repeat";}
  const unit = repeat.unit || "week";
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const end = repeat.end || { type: "never" };
  const parts = [];
  parts.push(`Every ${interval} ${unit}${interval > 1 ? "s" : ""}`);
  let weeklyDays = [];
  if (Array.isArray(repeat.weeklyDays)) {
    weeklyDays = repeat.weeklyDays;
  } else if (Array.isArray(repeat.byWeekdays)) {
    weeklyDays = repeat.byWeekdays;
  }
  if (unit === "week" && weeklyDays.length) {
    const labels = weeklyDays.map((d) => getWeekdayShortLabel(d)).filter(Boolean);
    if (labels.length) {parts.push(`on ${labels.join(", ")}`);}
  }
  if (unit === "month" && repeat.monthlyMode === "nth") {
    parts.push(
      `on the ${formatOrdinal(repeat.monthlyNth || 1)} ${dayOptions.find((d) => d.value === repeat.monthlyWeekday)?.label || ""}`
    );
  } else if (unit === "month") {
    parts.push(`on day ${repeat.monthlyDay || 1}`);
  }
  if (unit === "year") {
    parts.push(`on ${repeat.yearlyMonth || ""}/${repeat.yearlyDay || ""}`);
  }
  if (end.type === "on" && end.date) {
    parts.push(`until ${formatDate(end.date)}`);
  } else if (end.type === "after" && end.count) {
    parts.push(`for ${end.count} time${end.count > 1 ? "s" : ""}`);
  }
  return parts.join(", ") || "Custom repeat";
}

export function renderRepeatUI(target = repeatStore.repeatTarget) {
  if (!taskRepeatUnit) {return;}
  const repeatState = repeatStore.repeatState;
  taskRepeatUnit.value = repeatState.unit === "none" ? "week" : repeatState.unit;
  taskRepeatInterval.value = repeatState.interval;
  taskRepeatWeeklySection.classList.toggle("hidden", repeatState.unit !== "week");
  taskRepeatMonthlySection.classList.toggle("hidden", repeatState.unit !== "month");
  renderRepeatWeekdayOptions(repeatState.weeklyDays || []);
  if (taskRepeatMonthlyMode) {taskRepeatMonthlyMode.value = repeatState.monthlyMode || "day";}
  if (taskRepeatMonthlyDay) {taskRepeatMonthlyDay.value = repeatState.monthlyDay || 1;}
  if (taskRepeatMonthlyNth) {taskRepeatMonthlyNth.value = String(repeatState.monthlyNth || 1);}
  if (taskRepeatMonthlyWeekday) {taskRepeatMonthlyWeekday.value = String(repeatState.monthlyWeekday ?? 0);}
  if (taskRepeatMonthlyMode) {
    const dayOpt = taskRepeatMonthlyMode.querySelector('option[value="day"]');
    const nthOpt = taskRepeatMonthlyMode.querySelector('option[value="nth"]');
    if (dayOpt) {dayOpt.textContent = `Monthly on day ${repeatState.monthlyDay || 1}`;}
    if (nthOpt) {
      nthOpt.textContent = `Monthly on the ${formatOrdinal(repeatState.monthlyNth || 1)} ${dayOptions.find((d) => d.value === repeatState.monthlyWeekday)?.label || "weekday"}`;
    }
  }
  if (taskRepeatMonthlyDay) {taskRepeatMonthlyDay.disabled = repeatState.monthlyMode !== "day";}
  if (taskRepeatMonthlyNth) {taskRepeatMonthlyNth.disabled = repeatState.monthlyMode !== "nth";}
  if (taskRepeatMonthlyWeekday) {taskRepeatMonthlyWeekday.disabled = repeatState.monthlyMode !== "nth";}
  const isDayMode = repeatState.monthlyMode === "day";
  const isNthMode = repeatState.monthlyMode === "nth";
  if (taskRepeatMonthlyDayWrap) {
    taskRepeatMonthlyDayWrap.classList.toggle("hidden", !isDayMode);
    taskRepeatMonthlyDayWrap.style.display = isDayMode ? "" : "none";
  }
  if (taskRepeatMonthlyNthWrap) {
    taskRepeatMonthlyNthWrap.classList.toggle("hidden", !isNthMode);
    taskRepeatMonthlyNthWrap.style.display = isNthMode ? "" : "none";
  }
  const endType = repeatState.end?.type || "never";
  taskRepeatEndNever.checked = endType === "never";
  taskRepeatEndOn.checked = endType === "on";
  taskRepeatEndAfter.checked = endType === "after";
  taskRepeatEndDate.value = repeatState.end?.date ? repeatState.end.date.slice(0, 10) : "";
  taskRepeatEndCount.value = repeatState.end?.count ? Number(repeatState.end.count) : 1;
  if (target === "task") {
    taskRepeatSelect.value = repeatStore.lastRepeatSelection.type === "custom" ? "custom" : "none";
    syncRepeatSelectLabel();
  } else if (target === "subsection") {
    if (subsectionTaskRepeatSelect) {
      subsectionTaskRepeatSelect.value =
        repeatStore.subsectionRepeatSelection.type === "custom" ? "custom" : "none";
    }
    syncSubsectionRepeatLabel();
  }
}

export function setRepeatFromSelection(
  repeat = { type: "none" },
  target = repeatStore.repeatTarget || "task"
) {
  const base = defaultRepeatState();
  if (!repeat || repeat.type === "none") {
    repeatStore.repeatState = { ...base, unit: "none" };
    if (target === "task") {
      repeatStore.lastRepeatSelection = { type: "none" };
    } else {
      repeatStore.subsectionRepeatSelection = { type: "none" };
    }
    renderRepeatUI(target);
    return;
  }
  let unit = repeat.unit || "week";
  if (!repeat.unit) {
    if (repeat.frequency === "daily") {
      unit = "day";
    } else if (repeat.frequency === "weekly") {
      unit = "week";
    } else if (repeat.frequency === "monthly") {
      unit = "month";
    } else if (repeat.frequency === "yearly") {
      unit = "year";
    }
  }
  let weeklyDays = base.weeklyDays;
  if (Array.isArray(repeat.weeklyDays)) {
    weeklyDays = repeat.weeklyDays;
  } else if (Array.isArray(repeat.byWeekdays)) {
    weeklyDays = repeat.byWeekdays;
  }
  let monthlyMode = "day";
  if (repeat.monthlyMode) {
    monthlyMode = repeat.monthlyMode;
  } else if (repeat.bySetPos) {
    monthlyMode = "nth";
  } else if (repeat.byMonthDay) {
    monthlyMode = "day";
  }
  repeatStore.repeatState = {
    ...base,
    ...repeat,
    unit,
    interval: Math.max(1, Number(repeat.interval) || 1),
    weeklyDays,
    monthlyMode,
    monthlyDay: repeat.monthlyDay || repeat.byMonthDay || base.monthlyDay,
    monthlyNth: repeat.monthlyNth || repeat.bySetPos || base.monthlyNth,
    monthlyWeekday:
      repeat.monthlyWeekday ??
      (Array.isArray(repeat.byWeekdays) && repeat.byWeekdays.length
        ? repeat.byWeekdays[0]
        : base.monthlyWeekday),
    yearlyMonth: repeat.yearlyMonth || repeat.byMonth || base.yearlyMonth,
    yearlyDay: repeat.yearlyDay || repeat.byMonthDay || base.yearlyDay,
    end: repeat.end || { type: "never", date: "", count: 1 }
  };
  const built = buildRepeatFromState();
  if (target === "task") {
    repeatStore.lastRepeatSelection = built;
  } else {
    repeatStore.subsectionRepeatSelection = built;
  }
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

export function buildRepeatFromState() {
  const repeatState = repeatStore.repeatState;
  if (!repeatState || repeatState.unit === "none") {return { type: "none" };}
  const startDate = getStartDate();
  const unit = repeatState.unit;
  const interval = Math.max(1, Number(repeatState.interval) || 1);
  const end = repeatState.end || { type: "never" };
  let rule = "";
  const byDayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  if (unit === "day") {
    rule = `FREQ=DAILY;INTERVAL=${interval}`;
  } else if (unit === "week") {
    const days = (repeatState.weeklyDays || [startDate.getDay()]).map((d) => byDayCodes[d]);
    rule = `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(",")}`;
  } else if (unit === "month") {
    if (repeatState.monthlyMode === "nth") {
      const byday = byDayCodes[repeatState.monthlyWeekday ?? startDate.getDay()];
      const bysetpos = repeatState.monthlyNth ?? getNthWeekday(startDate).nth;
      rule = `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${byday};BYSETPOS=${bysetpos}`;
    } else {
      const day = repeatState.monthlyDay || startDate.getDate();
      rule = `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${day}`;
    }
  } else if (unit === "year") {
    const month = repeatState.yearlyMonth || startDate.getMonth() + 1;
    const day = repeatState.yearlyDay || startDate.getDate();
    rule = `FREQ=YEARLY;INTERVAL=${interval};BYMONTH=${month};BYMONTHDAY=${day}`;
  }
  if (end.type === "after" && end.count) {
    rule += `;COUNT=${end.count}`;
  } else if (end.type === "on" && end.date) {
    const until = formatRRuleDate(end.date);
    if (until) {rule += `;UNTIL=${until}`;}
  }
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
