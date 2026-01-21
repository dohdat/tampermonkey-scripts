import {
  addMonths,
  addDays,
  buildQuickPickSections,
  formatLongDateLabel,
  formatShortDateLabel,
  getMonthData,
  getMonthLabel,
  parseDateInputValue,
  toDateInputValue
} from "./date-picker-utils.js";
import {
  DAYS_PER_YEAR,
  ENTER_KEY,
  ESC_KEY,
  NEXT_MONTH_OFFSET,
  ONE,
  SPACE_KEY,
  TASK_REPEAT_NONE
} from "../constants.js";
import { DATE_PICKER_SUGGESTED_COUNT } from "./constants.js";
import { getUpcomingOccurrences } from "../core/scheduler.js";
import { getWeekdayShortLabel } from "./utils.js";
import { state as pageState } from "./state/page-state.js";

const PREV_MONTH_OFFSET = -1;

let datePickerCleanup = null;

function setNodeText(node, value) {
  if (!node) {return;}
  node.textContent = value;
}

function clearNode(node) {
  if (!node) {return;}
  if (node.replaceChildren) {
    node.replaceChildren();
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function replaceNodeChildren(node, fragment) {
  if (!node) {return;}
  if (node.replaceChildren) {
    node.replaceChildren(fragment);
    return;
  }
  clearNode(node);
  node.appendChild(fragment);
}

function createFragment(node) {
  const doc = node?.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc?.createDocumentFragment) {return null;}
  return doc.createDocumentFragment();
}

function isSameDate(a, b) {
  if (!a || !b) {return false;}
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function createQuickOption(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "date-picker-quick-option";
  button.setAttribute("data-date-picker-quick", toDateInputValue(option.date));
  button.setAttribute("data-test-skedpal", "date-picker-quick-option");

  const label = document.createElement("span");
  label.className = "date-picker-quick-label";
  label.setAttribute("data-test-skedpal", "date-picker-quick-label");
  label.textContent = option.label;

  const meta = document.createElement("span");
  meta.className = "date-picker-quick-date";
  meta.setAttribute("data-test-skedpal", "date-picker-quick-date");
  meta.textContent = formatShortDateLabel(option.date);

  button.appendChild(label);
  button.appendChild(meta);
  return button;
}

function createDayPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "date-picker-day date-picker-day--empty";
  placeholder.setAttribute("data-test-skedpal", "date-picker-day-empty");
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.setAttribute("role", "presentation");
  return placeholder;
}

function createDayButton(date, { selectedDate, today }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "date-picker-day";
  button.setAttribute("data-date-picker-day", toDateInputValue(date));
  button.setAttribute("data-test-skedpal", "date-picker-day");
  button.setAttribute("role", "gridcell");
  button.setAttribute("aria-label", formatLongDateLabel(date));
  button.textContent = `${date.getDate()}`;
  if (isSameDate(date, today)) {
    button.classList.add("date-picker-day--today");
    button.setAttribute("aria-current", "date");
  }
  if (isSameDate(date, selectedDate)) {
    button.classList.add("date-picker-day--selected");
    button.setAttribute("aria-selected", "true");
  } else {
    button.setAttribute("aria-selected", "false");
  }
  return button;
}

function buildQuickPickMap(nodes) {
  return new Map([
    ["soon", nodes.quickSoon],
    ["month", nodes.quickMonth],
    ["later", nodes.quickLater]
  ]);
}

function resolveNodes() {
  const modal = document.getElementById("date-picker-modal");
  if (!modal) {return null;}
  return {
    modal,
    subtitle: modal.querySelector("#date-picker-subtitle"),
    summaryValue: modal.querySelector("#date-picker-summary-value"),
    monthLabel: modal.querySelector("#date-picker-month"),
    grid: modal.querySelector("#date-picker-grid"),
    quickSuggested: modal.querySelector("#date-picker-quick-suggested"),
    suggestedCard: modal.querySelector("[data-test-skedpal='date-picker-card-suggested']"),
    quickSoon: modal.querySelector("#date-picker-quick-soon"),
    quickMonth: modal.querySelector("#date-picker-quick-month"),
    quickLater: modal.querySelector("#date-picker-quick-later"),
    prevBtn: modal.querySelector("[data-date-picker-prev]"),
    nextBtn: modal.querySelector("[data-date-picker-next]"),
    jumpBtn: modal.querySelector("#date-picker-jump"),
    closeBtn: modal.querySelector("[data-date-picker-close]"),
    cancelBtn: modal.querySelector("[data-date-picker-cancel]"),
    applyBtn: modal.querySelector("[data-date-picker-apply]"),
    footer: modal.querySelector("[data-test-skedpal='date-picker-footer']"),
    summaryHint: modal.querySelector("[data-test-skedpal='date-picker-summary-hint']")
  };
}

function createDatePickerState() {
  return {
    activeInput: null,
    selectedDate: null,
    viewDate: new Date(),
    autoApply: true
  };
}

function updateSubtitle(state, nodes) {
  if (!state.selectedDate) {
    setNodeText(nodes.subtitle, "");
    return;
  }
  setNodeText(nodes.subtitle, formatLongDateLabel(state.selectedDate));
}

function updateSummary(state, nodes) {
  if (!nodes.summaryValue) {return;}
  if (!state.selectedDate) {
    setNodeText(nodes.summaryValue, "Pick a date");
    return;
  }
  setNodeText(nodes.summaryValue, formatLongDateLabel(state.selectedDate));
}

function setFooterVisibility(nodes, visible) {
  if (!nodes.footer) {return;}
  nodes.footer.classList.toggle("hidden", !visible);
  nodes.footer.hidden = !visible;
  if (nodes.footer.style) {
    nodes.footer.style.display = visible ? "" : "none";
  }
}

function setSummaryHintVisibility(nodes, visible) {
  if (!nodes.summaryHint) {return;}
  nodes.summaryHint.classList.toggle("hidden", !visible);
  nodes.summaryHint.hidden = !visible;
  nodes.summaryHint.setAttribute("aria-hidden", visible ? "false" : "true");
}

function updateInputValue(state, date) {
  if (!state.activeInput) {return;}
  const nextValue = toDateInputValue(date);
  state.activeInput.value = nextValue;
  state.activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  state.activeInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderQuickPicks(nodes, quickPickMap) {
  const base = new Date();
  const sections = buildQuickPickSections(base);
  sections.forEach((section) => {
    const wrap = quickPickMap.get(section.id);
    if (!wrap) {return;}
    const fragment = createFragment(wrap);
    if (fragment) {
      section.options.forEach((option) => {
        fragment.appendChild(createQuickOption(option));
      });
      replaceNodeChildren(wrap, fragment);
      return;
    }
    clearNode(wrap);
    section.options.forEach((option) => {
      wrap.appendChild(createQuickOption(option));
    });
  });
}

export function buildSuggestedQuickOptions(
  task,
  now = new Date(),
  count = DATE_PICKER_SUGGESTED_COUNT
) {
  if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return [];}
  const upcoming = getUpcomingOccurrences(task, now, count, DAYS_PER_YEAR);
  return upcoming.map(({ date }, index) => {
    const weekday = getWeekdayShortLabel(date.getDay());
    const label = index === 0 ? `Next ${weekday}` : `Then ${weekday}`;
    return { label, date };
  });
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildNextAllowedWeekdayOptions(repeat, now, count) {
  const weeklyDays = Array.isArray(repeat?.weeklyDays) ? repeat.weeklyDays : [];
  if (!weeklyDays.length) {return [];}
  const allowedDays = Array.from(
    new Set(weeklyDays.map((day) => Number(day)).filter((day) => Number.isFinite(day)))
  );
  if (!allowedDays.length) {return [];}
  const start = addDays(startOfLocalDay(now), ONE);
  const options = [];
  for (let offset = 0; offset < DAYS_PER_YEAR && options.length < count; offset += 1) {
    const candidate = addDays(start, offset);
    if (!allowedDays.includes(candidate.getDay())) {continue;}
    const weekday = getWeekdayShortLabel(candidate.getDay());
    const label = options.length === 0 ? `Next ${weekday}` : `Then ${weekday}`;
    options.push({ label, date: candidate });
  }
  return options;
}

export function buildReportDelaySuggestions(
  task,
  now = new Date(),
  count = DATE_PICKER_SUGGESTED_COUNT
) {
  if (!task?.repeat || task.repeat.type === TASK_REPEAT_NONE) {return [];}
  if (task.repeat.unit === "week") {
    const quick = buildNextAllowedWeekdayOptions(task.repeat, now, count);
    if (quick.length) {return quick;}
  }
  return buildSuggestedQuickOptions(task, now, count);
}

function renderSuggestedQuickPicks(state, nodes) {
  if (!nodes.suggestedCard || !nodes.quickSuggested) {return;}
  const taskId = state.activeInput?.dataset?.reportDelayTask || "";
  const task = taskId && Array.isArray(pageState.tasksCache)
    ? pageState.tasksCache.find((entry) => entry?.id === taskId)
    : null;
  const options = task ? buildReportDelaySuggestions(task, new Date()) : [];
  if (!options.length) {
    nodes.suggestedCard.classList.add("hidden");
    clearNode(nodes.quickSuggested);
    return;
  }
  nodes.suggestedCard.classList.remove("hidden");
  const fragment = createFragment(nodes.quickSuggested);
  if (fragment) {
    options.forEach((option) => {
      fragment.appendChild(createQuickOption(option));
    });
    replaceNodeChildren(nodes.quickSuggested, fragment);
    return;
  }
  clearNode(nodes.quickSuggested);
  options.forEach((option) => {
    nodes.quickSuggested.appendChild(createQuickOption(option));
  });
}

function renderCalendar(state, nodes) {
  if (!nodes.grid || !nodes.monthLabel) {return;}
  const { year, monthIndex, daysInMonth, startWeekday } = getMonthData(state.viewDate);
  setNodeText(nodes.monthLabel, getMonthLabel(state.viewDate));
  const fragment = createFragment(nodes.grid);
  for (let i = 0; i < startWeekday; i += 1) {
    if (fragment) {
      fragment.appendChild(createDayPlaceholder());
    } else {
      nodes.grid.appendChild(createDayPlaceholder());
    }
  }
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    if (fragment) {
      fragment.appendChild(createDayButton(date, { selectedDate: state.selectedDate, today }));
    } else {
      nodes.grid.appendChild(createDayButton(date, { selectedDate: state.selectedDate, today }));
    }
  }
  if (!fragment) {return;}
  replaceNodeChildren(nodes.grid, fragment);
}

export function applyJumpToToday(state, nodes, now = new Date()) {
  state.viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar(state, nodes);
}

function openDatePicker(state, nodes, quickPickMap, input) {
  if (!input) {return;}
  state.activeInput = input;
  state.autoApply = input.dataset.datePickerManual !== "true";
  state.selectedDate = parseDateInputValue(input.value) || new Date();
  state.viewDate = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);
  renderQuickPicks(nodes, quickPickMap);
  renderSuggestedQuickPicks(state, nodes);
  renderCalendar(state, nodes);
  updateSubtitle(state, nodes);
  updateSummary(state, nodes);
  setFooterVisibility(nodes, !state.autoApply);
  setSummaryHintVisibility(nodes, !state.autoApply);
  nodes.modal.classList.remove("hidden");
  nodes.modal.setAttribute("aria-hidden", "false");
}

function closeDatePicker(state, nodes) {
  nodes.modal.classList.add("hidden");
  nodes.modal.setAttribute("aria-hidden", "true");
  setFooterVisibility(nodes, true);
  setSummaryHintVisibility(nodes, true);
  if (state.activeInput?.dataset?.reportDelayTask) {
    state.activeInput.dataset.reportDelayTask = "";
  }
  state.activeInput = null;
  state.autoApply = true;
}

function selectDate(state, nodes, date) {
  if (!date) {return;}
  state.selectedDate = date;
  state.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar(state, nodes);
  updateSubtitle(state, nodes);
  updateSummary(state, nodes);
}

function applySelectedDate(state, nodes) {
  if (!state.selectedDate) {return;}
  updateInputValue(state, state.selectedDate);
  closeDatePicker(state, nodes);
}

function createCancelHandler(state, nodes) {
  function onCancelClick() {
    closeDatePicker(state, nodes);
  }
  return onCancelClick;
}

function createApplyHandler(state, nodes) {
  function onApplyClick() {
    applySelectedDate(state, nodes);
  }
  return onApplyClick;
}

function createQuickPickHandler(state, nodes) {
  function onQuickClick(event) {
    const btn = event.target.closest("[data-date-picker-quick]");
    if (!btn) {return;}
    const date = parseDateInputValue(btn.dataset.datePickerQuick);
    if (!date) {return;}
    if (state.autoApply) {
      state.selectedDate = date;
      updateInputValue(state, date);
      closeDatePicker(state, nodes);
      return;
    }
    selectDate(state, nodes, date);
  }
  return onQuickClick;
}

function createDayGridHandler(state, nodes) {
  function onDayGridClick(event) {
    const btn = event.target.closest("[data-date-picker-day]");
    if (!btn) {return;}
    const date = parseDateInputValue(btn.dataset.datePickerDay);
    if (!date) {return;}
    if (state.autoApply) {
      state.selectedDate = date;
      updateInputValue(state, date);
      closeDatePicker(state, nodes);
      return;
    }
    selectDate(state, nodes, date);
  }
  return onDayGridClick;
}

function bindInputListeners(inputs, handlers, cleanupFns) {
  const { onInputClick, onInputKeydown } = handlers;
  inputs.forEach((input) => {
    input.readOnly = true;
    input.addEventListener("click", onInputClick);
    input.addEventListener("keydown", onInputKeydown);
    cleanupFns.push(() => input.removeEventListener("click", onInputClick));
    cleanupFns.push(() => input.removeEventListener("keydown", onInputKeydown));
  });
}

function bindQuickPickListeners(nodes, handlers, cleanupFns) {
  const { onQuickClick } = handlers;
  [nodes.quickSuggested, nodes.quickSoon, nodes.quickMonth, nodes.quickLater].forEach((section) => {
    if (!section) {return;}
    section.addEventListener("click", onQuickClick);
    cleanupFns.push(() => section.removeEventListener("click", onQuickClick));
  });
}

function bindCalendarListeners(nodes, handlers, cleanupFns) {
  const { onDayGridClick, onPrevClick, onNextClick, onJumpClick } = handlers;
  nodes.grid?.addEventListener("click", onDayGridClick);
  cleanupFns.push(() => nodes.grid?.removeEventListener("click", onDayGridClick));

  nodes.prevBtn?.addEventListener("click", onPrevClick);
  cleanupFns.push(() => nodes.prevBtn?.removeEventListener("click", onPrevClick));

  nodes.nextBtn?.addEventListener("click", onNextClick);
  cleanupFns.push(() => nodes.nextBtn?.removeEventListener("click", onNextClick));

  nodes.jumpBtn?.addEventListener("click", onJumpClick);
  cleanupFns.push(() => nodes.jumpBtn?.removeEventListener("click", onJumpClick));
}

function bindModalListeners(nodes, handlers, cleanupFns) {
  const {
    onCloseClick,
    onCancelClick,
    onApplyClick,
    onOverlayClick,
    onKeydown,
    onPageHide
  } = handlers;
  nodes.closeBtn?.addEventListener("click", onCloseClick);
  cleanupFns.push(() => nodes.closeBtn?.removeEventListener("click", onCloseClick));

  nodes.cancelBtn?.addEventListener("click", onCancelClick);
  cleanupFns.push(() => nodes.cancelBtn?.removeEventListener("click", onCancelClick));

  nodes.applyBtn?.addEventListener("click", onApplyClick);
  cleanupFns.push(() => nodes.applyBtn?.removeEventListener("click", onApplyClick));

  nodes.modal.addEventListener("click", onOverlayClick);
  cleanupFns.push(() => nodes.modal.removeEventListener("click", onOverlayClick));

  document.addEventListener("keydown", onKeydown);
  cleanupFns.push(() => document.removeEventListener("keydown", onKeydown));

  window.addEventListener("pagehide", onPageHide);
  cleanupFns.push(() => window.removeEventListener("pagehide", onPageHide));
}

function buildHandlers(state, nodes, quickPickMap, cleanup) {
  function onInputClick(event) {
    event.preventDefault();
    openDatePicker(state, nodes, quickPickMap, event.currentTarget);
  }

  function onInputKeydown(event) {
    if (event.key !== ENTER_KEY && event.key !== SPACE_KEY) {return;}
    event.preventDefault();
    openDatePicker(state, nodes, quickPickMap, event.currentTarget);
  }

  function onOverlayClick(event) {
    if (event.target !== nodes.modal) {return;}
    closeDatePicker(state, nodes);
  }

  function onCloseClick() {
    closeDatePicker(state, nodes);
  }

  const onCancelClick = createCancelHandler(state, nodes);
  const onApplyClick = createApplyHandler(state, nodes);
  const onQuickClick = createQuickPickHandler(state, nodes);
  const onDayGridClick = createDayGridHandler(state, nodes);

  function onPrevClick() {
    state.viewDate = addMonths(state.viewDate, PREV_MONTH_OFFSET);
    renderCalendar(state, nodes);
  }

  function onNextClick() {
    state.viewDate = addMonths(state.viewDate, NEXT_MONTH_OFFSET);
    renderCalendar(state, nodes);
  }

  function onJumpClick() {
    applyJumpToToday(state, nodes);
  }

  function onKeydown(event) {
    if (event.key !== ESC_KEY) {return;}
    if (nodes.modal.classList.contains("hidden")) {return;}
    closeDatePicker(state, nodes);
  }

  function onPageHide() {
    cleanup();
  }

  return {
    onInputClick,
    onInputKeydown,
    onOverlayClick,
    onCloseClick,
    onCancelClick,
    onApplyClick,
    onQuickClick,
    onDayGridClick,
    onPrevClick,
    onNextClick,
    onJumpClick,
    onKeydown,
    onPageHide
  };
}

function setupDatePicker(nodes) {
  const state = createDatePickerState();
  const cleanupFns = [];
  const quickPickMap = buildQuickPickMap(nodes);
  const cleanup = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
    datePickerCleanup = null;
  };
  const handlers = buildHandlers(state, nodes, quickPickMap, cleanup);
  const inputs = [...document.querySelectorAll("input[data-date-picker]")];

  bindInputListeners(inputs, handlers, cleanupFns);
  bindQuickPickListeners(nodes, handlers, cleanupFns);
  bindCalendarListeners(nodes, handlers, cleanupFns);
  bindModalListeners(nodes, handlers, cleanupFns);

  return cleanup;
}

export function initDatePicker() {
  if (datePickerCleanup) {return datePickerCleanup;}
  const nodes = resolveNodes();
  if (!nodes) {return () => {};}
  datePickerCleanup = setupDatePicker(nodes);
  return datePickerCleanup;
}

export function cleanupDatePicker() {
  if (!datePickerCleanup) {return;}
  datePickerCleanup();
}
