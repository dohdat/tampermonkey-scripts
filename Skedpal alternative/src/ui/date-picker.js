import {
  addMonths,
  buildQuickPickSections,
  formatLongDateLabel,
  formatShortDateLabel,
  getMonthData,
  getMonthLabel,
  parseDateInputValue,
  toDateInputValue
} from "./date-picker-utils.js";

const PREV_MONTH_OFFSET = -1;
const NEXT_MONTH_OFFSET = 1;
const ENTER_KEY = "Enter";
const SPACE_KEY = " ";
const ESC_KEY = "Escape";

let datePickerCleanup = null;

function setNodeText(node, value) {
  if (!node) {return;}
  node.textContent = value;
}

function clearNode(node) {
  if (!node) {return;}
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
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
  return placeholder;
}

function createDayButton(date, { selectedDate, today }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "date-picker-day";
  button.setAttribute("data-date-picker-day", toDateInputValue(date));
  button.setAttribute("data-test-skedpal", "date-picker-day");
  button.textContent = `${date.getDate()}`;
  if (isSameDate(date, today)) {
    button.classList.add("date-picker-day--today");
  }
  if (isSameDate(date, selectedDate)) {
    button.classList.add("date-picker-day--selected");
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
    monthLabel: modal.querySelector("#date-picker-month"),
    grid: modal.querySelector("#date-picker-grid"),
    quickSoon: modal.querySelector("#date-picker-quick-soon"),
    quickMonth: modal.querySelector("#date-picker-quick-month"),
    quickLater: modal.querySelector("#date-picker-quick-later"),
    prevBtn: modal.querySelector("[data-date-picker-prev]"),
    nextBtn: modal.querySelector("[data-date-picker-next]"),
    jumpBtn: modal.querySelector("#date-picker-jump"),
    closeBtn: modal.querySelector("[data-date-picker-close]")
  };
}

function createDatePickerState() {
  return {
    activeInput: null,
    selectedDate: null,
    viewDate: new Date()
  };
}

function updateSubtitle(state, nodes) {
  if (!state.selectedDate) {
    setNodeText(nodes.subtitle, "");
    return;
  }
  setNodeText(nodes.subtitle, formatLongDateLabel(state.selectedDate));
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
    clearNode(wrap);
    section.options.forEach((option) => {
      wrap.appendChild(createQuickOption(option));
    });
  });
}

function renderCalendar(state, nodes) {
  if (!nodes.grid || !nodes.monthLabel) {return;}
  const { year, monthIndex, daysInMonth, startWeekday } = getMonthData(state.viewDate);
  setNodeText(nodes.monthLabel, getMonthLabel(state.viewDate));
  clearNode(nodes.grid);
  for (let i = 0; i < startWeekday; i += 1) {
    nodes.grid.appendChild(createDayPlaceholder());
  }
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    nodes.grid.appendChild(createDayButton(date, { selectedDate: state.selectedDate, today }));
  }
}

function openDatePicker(state, nodes, quickPickMap, input) {
  if (!input) {return;}
  state.activeInput = input;
  state.selectedDate = parseDateInputValue(input.value) || new Date();
  state.viewDate = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);
  renderQuickPicks(nodes, quickPickMap);
  renderCalendar(state, nodes);
  updateSubtitle(state, nodes);
  nodes.modal.classList.remove("hidden");
  nodes.modal.setAttribute("aria-hidden", "false");
}

function closeDatePicker(state, nodes) {
  nodes.modal.classList.add("hidden");
  nodes.modal.setAttribute("aria-hidden", "true");
  state.activeInput = null;
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
  [nodes.quickSoon, nodes.quickMonth, nodes.quickLater].forEach((section) => {
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
  const { onCloseClick, onOverlayClick, onKeydown, onPageHide } = handlers;
  nodes.closeBtn?.addEventListener("click", onCloseClick);
  cleanupFns.push(() => nodes.closeBtn?.removeEventListener("click", onCloseClick));

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

  function onQuickClick(event) {
    const btn = event.target.closest("[data-date-picker-quick]");
    if (!btn) {return;}
    const date = parseDateInputValue(btn.dataset.datePickerQuick);
    if (!date) {return;}
    state.selectedDate = date;
    updateInputValue(state, date);
    closeDatePicker(state, nodes);
  }

  function onDayGridClick(event) {
    const btn = event.target.closest("[data-date-picker-day]");
    if (!btn) {return;}
    const date = parseDateInputValue(btn.dataset.datePickerDay);
    if (!date) {return;}
    state.selectedDate = date;
    updateInputValue(state, date);
    closeDatePicker(state, nodes);
  }

  function onPrevClick() {
    state.viewDate = addMonths(state.viewDate, PREV_MONTH_OFFSET);
    renderCalendar(state, nodes);
  }

  function onNextClick() {
    state.viewDate = addMonths(state.viewDate, NEXT_MONTH_OFFSET);
    renderCalendar(state, nodes);
  }

  function onJumpClick() {
    const today = new Date();
    state.selectedDate = today;
    state.viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    renderCalendar(state, nodes);
    updateSubtitle(state, nodes);
    updateInputValue(state, today);
    closeDatePicker(state, nodes);
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
