import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._handlers = {};
    this._options = new Map();
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classSet.add(n)),
      remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classSet.has(name)) {this._classSet.delete(name);}
          else {this._classSet.add(name);}
          return;
        }
        if (force) {this._classSet.add(name);}
        else {this._classSet.delete(name);}
      },
      contains: (name) => this._classSet.has(name)
    };
    this.setAttribute("data-test-skedpal", `test-${this.tagName.toLowerCase()}`);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this._handlers[type] === handler) {
      delete this._handlers[type];
    }
  }

  querySelector(selector) {
    if (selector?.startsWith('option[value="')) {
      const value = selector.slice(15, -2);
      return this._options.get(value) || null;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  focus() {
    this._focused = true;
  }
}

global.document = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  querySelectorAll: () => [],
  getElementById: () => null
};

const { domRefs } = await import("../src/ui/constants.js");
const initRef = (key, tag = "div") => {
  domRefs[key] = new FakeElement(tag);
};

initRef("taskDeadlineInput", "input");
initRef("taskStartFromInput", "input");
initRef("taskRepeatSelect", "select");
initRef("taskRepeatCustom", "div");
initRef("taskRepeatUnit", "select");
initRef("taskRepeatInterval", "input");
initRef("taskRepeatWeekdays", "div");
initRef("taskRepeatWeeklyModeAny", "input");
initRef("taskRepeatWeeklyModeAll", "input");
initRef("taskRepeatWeeklyAnyCount", "span");
initRef("taskRepeatWeeklyAllCount", "span");
initRef("taskRepeatMonthlyMode", "select");
initRef("taskRepeatMonthlyDay", "input");
initRef("taskRepeatMonthlyNth", "select");
initRef("taskRepeatMonthlyWeekday", "select");
initRef("taskRepeatMonthlyRangeStart", "input");
initRef("taskRepeatMonthlyRangeEnd", "input");
initRef("taskRepeatWeeklySection", "div");
initRef("taskRepeatMonthlySection", "div");
initRef("taskRepeatYearlySection", "div");
initRef("taskRepeatYearlyRangeStart", "input");
initRef("taskRepeatYearlyRangeEnd", "input");
initRef("taskRepeatYearlyRangeWrap", "div");
initRef("taskRepeatMonthlyDayWrap", "div");
initRef("taskRepeatMonthlyNthWrap", "div");
initRef("taskRepeatMonthlyRangeWrap", "div");
initRef("taskRepeatEndNever", "input");
initRef("taskRepeatEndOn", "input");
initRef("taskRepeatEndAfter", "input");
initRef("taskRepeatEndDate", "input");
initRef("taskRepeatEndCount", "input");
initRef("repeatModal", "div");
initRef("repeatModalSaveBtn", "button");
initRef("subsectionTaskRepeatSelect", "select");
domRefs.repeatModalCloseBtns = [new FakeElement("button"), new FakeElement("button")];

const repeat = await import("../src/ui/repeat.js");
const {
  getRepeatSummary,
  buildRepeatFromState,
  repeatStore,
  renderRepeatUI,
  setRepeatFromSelection,
  registerRepeatEventHandlers,
  enableDeadlinePicker
} = repeat;

describe("repeat utils", () => {
  beforeEach(() => {
    global.document = {
      createElement: (tag) => new FakeElement(tag),
      createTextNode: (text) => ({ nodeType: 3, textContent: text }),
      querySelectorAll: () => [],
      getElementById: () => null
    };
    const selectSetup = (el, options) => {
      if (!el) {return;}
      el._options = new Map();
      options.forEach((opt) => {
        const option = new FakeElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        el._options.set(opt.value, option);
      });
      el.querySelector = (selector) => {
        if (selector?.startsWith('option[value="')) {
          const value = selector.slice(14, -2);
          return el._options.get(value) || null;
        }
        return null;
      };
    };

    const reset = (el) => {
      if (!el) {return;}
      el.value = "";
      el.checked = false;
      el.disabled = false;
      el.textContent = "";
      el.innerHTML = "";
      el.children = [];
      el._handlers = {};
      el._classSet?.clear();
    };

    [
      "taskDeadlineInput",
      "taskStartFromInput",
      "taskRepeatSelect",
      "taskRepeatCustom",
      "taskRepeatUnit",
      "taskRepeatInterval",
      "taskRepeatWeekdays",
      "taskRepeatWeeklyModeAny",
      "taskRepeatWeeklyModeAll",
      "taskRepeatWeeklyAnyCount",
      "taskRepeatWeeklyAllCount",
      "taskRepeatMonthlyMode",
      "taskRepeatMonthlyDay",
      "taskRepeatMonthlyNth",
      "taskRepeatMonthlyWeekday",
      "taskRepeatMonthlyRangeStart",
      "taskRepeatMonthlyRangeEnd",
      "taskRepeatWeeklySection",
      "taskRepeatMonthlySection",
      "taskRepeatYearlySection",
      "taskRepeatYearlyRangeStart",
      "taskRepeatYearlyRangeEnd",
      "taskRepeatYearlyRangeWrap",
      "taskRepeatMonthlyDayWrap",
      "taskRepeatMonthlyNthWrap",
      "taskRepeatMonthlyRangeWrap",
      "taskRepeatEndNever",
      "taskRepeatEndOn",
      "taskRepeatEndAfter",
      "taskRepeatEndDate",
      "taskRepeatEndCount",
      "repeatModal",
      "repeatModalSaveBtn",
      "subsectionTaskRepeatSelect"
    ].forEach((key) => reset(domRefs[key]));
    domRefs.repeatModalCloseBtns.forEach((btn) => reset(btn));

    selectSetup(domRefs.taskRepeatSelect, [
      { value: "none", label: "" },
      { value: "custom", label: "" },
      { value: "custom-new", label: "" }
    ]);
    selectSetup(domRefs.subsectionTaskRepeatSelect, [
      { value: "none", label: "" },
      { value: "custom", label: "" },
      { value: "custom-new", label: "" }
    ]);
    selectSetup(domRefs.taskRepeatUnit, [
      { value: "week", label: "Week" },
      { value: "month", label: "Month" },
      { value: "year", label: "Year" }
    ]);
    selectSetup(domRefs.taskRepeatMonthlyMode, [
      { value: "day", label: "" },
      { value: "nth", label: "" },
      { value: "range", label: "" }
    ]);
    selectSetup(domRefs.taskRepeatMonthlyNth, [
      { value: "1", label: "" },
      { value: "2", label: "" }
    ]);
    selectSetup(domRefs.taskRepeatMonthlyWeekday, [
      { value: "1", label: "Mon" },
      { value: "4", label: "Thu" }
    ]);
    domRefs.repeatModal.classList.add("hidden");
  });

  it("summarizes weekly and monthly repeats", () => {
    const weekly = {
      type: "custom",
      unit: "week",
      interval: 2,
      weeklyDays: [1, 3],
      end: { type: "after", count: 3 }
    };
    const weeklySummary = getRepeatSummary(weekly);
    assert.ok(weeklySummary.includes("Every 2 weeks"));
    assert.ok(weeklySummary.includes("on Mon, Wed"));
    assert.ok(weeklySummary.includes("for 3 times"));

    const weeklyAny = {
      type: "custom",
      unit: "week",
      interval: 1,
      weeklyDays: [2, 4],
      weeklyMode: "any"
    };
    const weeklyAnySummary = getRepeatSummary(weeklyAny);
    assert.ok(weeklyAnySummary.includes("on any of"));

    const monthly = {
      type: "custom",
      unit: "month",
      interval: 1,
      monthlyMode: "nth",
      monthlyNth: 2,
      monthlyWeekday: 4
    };
    const monthlySummary = getRepeatSummary(monthly);
    assert.ok(monthlySummary.includes("Every 1 month"));
    assert.ok(monthlySummary.includes("on the 2nd Thu"));
  });

  it("summarizes yearly and day-based repeats", () => {
    assert.strictEqual(getRepeatSummary(null), "Does not repeat");
    const monthlyDay = {
      type: "custom",
      unit: "month",
      interval: 1,
      monthlyMode: "day",
      monthlyDay: 5
    };
    const yearly = {
      type: "custom",
      unit: "year",
      interval: 1,
      yearlyMonth: 12,
      yearlyDay: 31,
      end: { type: "on", date: "2026-12-31T00:00:00" }
    };
    const yearlyRange = {
      type: "custom",
      unit: "year",
      interval: 1,
      yearlyRangeStartDate: "2026-02-01",
      yearlyRangeEndDate: "2026-03-15"
    };
    const monthlySummary = getRepeatSummary(monthlyDay);
    const yearlySummary = getRepeatSummary(yearly);
    const yearlyRangeSummary = getRepeatSummary(yearlyRange);
    assert.ok(monthlySummary.includes("on day 5"));
    assert.ok(yearlySummary.includes("on 12/31"));
    assert.ok(yearlySummary.includes("until"));
    assert.ok(yearlyRangeSummary.includes("between"));
  });

  it("builds rrule strings from state", () => {
    repeatStore.repeatState = {
      unit: "week",
      interval: 2,
      weeklyDays: [1, 3],
      end: { type: "after", count: 3 }
    };
    let built = buildRepeatFromState();
    assert.strictEqual(built.rrule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3");

    repeatStore.repeatState = {
      unit: "month",
      interval: 1,
      monthlyMode: "nth",
      monthlyNth: 2,
      monthlyWeekday: 4,
      end: { type: "on", date: "2026-02-10T12:00:00" }
    };
    built = buildRepeatFromState();
    assert.strictEqual(
      built.rrule,
      "FREQ=MONTHLY;INTERVAL=1;BYDAY=TH;BYSETPOS=2;UNTIL=20260210"
    );
  });

  it("builds daily and yearly rrule strings", () => {
    repeatStore.repeatState = {
      unit: "day",
      interval: 3,
      end: { type: "never" }
    };
    let built = buildRepeatFromState();
    assert.strictEqual(built.rrule, "FREQ=DAILY;INTERVAL=3");

    repeatStore.repeatState = {
      unit: "year",
      interval: 2,
      yearlyMonth: 12,
      yearlyDay: 31,
      yearlyRangeEndDate: "2026-12-31",
      end: { type: "on", date: "2026-12-31T00:00:00" }
    };
    built = buildRepeatFromState();
    assert.strictEqual(
      built.rrule,
      "FREQ=YEARLY;INTERVAL=2;BYMONTH=12;BYMONTHDAY=31;UNTIL=20261231"
    );
  });

  it("renders repeat UI for monthly mode", () => {
    repeatStore.repeatState = {
      unit: "month",
      interval: 2,
      weeklyDays: [1],
      monthlyMode: "nth",
      monthlyNth: 2,
      monthlyWeekday: 4,
      end: { type: "never", date: "", count: 1 }
    };
    renderRepeatUI("task");
    const monthlySection = domRefs.taskRepeatMonthlySection;
    const weeklySection = domRefs.taskRepeatWeeklySection;
    assert.strictEqual(monthlySection.classList.contains("hidden"), false);
    assert.strictEqual(weeklySection.classList.contains("hidden"), true);
    const modeSelect = domRefs.taskRepeatMonthlyMode;
    const nthOpt = modeSelect.querySelector('option[value="nth"]');
    assert.ok(nthOpt.textContent.includes("2nd Thu"));
  });

  it("keeps weekly mode counts at one per week", () => {
    repeatStore.repeatState = {
      unit: "week",
      interval: 4,
      weeklyDays: [1, 3],
      weeklyMode: "any"
    };
    renderRepeatUI("task");
    assert.strictEqual(domRefs.taskRepeatWeeklyAnyCount.textContent, "1");
    assert.strictEqual(domRefs.taskRepeatWeeklyAllCount.textContent, "1");
  });

  it("renders range fields for yearly mode", () => {
    repeatStore.repeatState = {
      unit: "year",
      interval: 1,
      yearlyRangeStartDate: "2026-01-05",
      yearlyRangeEndDate: "2026-01-10",
      end: { type: "never", date: "", count: 1 }
    };
    renderRepeatUI("task");
    assert.strictEqual(domRefs.taskRepeatYearlySection.classList.contains("hidden"), false);
    assert.strictEqual(domRefs.taskRepeatMonthlySection.classList.contains("hidden"), true);
  });

  it("renders range fields for monthly mode", () => {
    repeatStore.repeatState = {
      unit: "month",
      interval: 1,
      monthlyMode: "range",
      monthlyRangeStart: 2,
      monthlyRangeEnd: 6,
      monthlyRangeStartDate: "2026-01-02",
      monthlyRangeEndDate: "2026-01-06",
      end: { type: "never", date: "", count: 1 }
    };
    renderRepeatUI("task");
    assert.strictEqual(domRefs.taskRepeatMonthlySection.classList.contains("hidden"), false);
    assert.strictEqual(domRefs.taskRepeatMonthlyRangeWrap.classList.contains("hidden"), false);
    assert.strictEqual(domRefs.taskRepeatMonthlyDayWrap.classList.contains("hidden"), true);
    assert.strictEqual(domRefs.taskRepeatMonthlyNthWrap.classList.contains("hidden"), true);
  });

  it("sets repeat from selection for subsection target", () => {
    setRepeatFromSelection(
      {
        type: "custom",
        unit: "week",
        interval: 1,
        byWeekdays: [2, 4],
        end: { type: "after", count: 2 }
      },
      "subsection"
    );
    assert.strictEqual(repeatStore.subsectionRepeatSelection.type, "custom");
    assert.deepStrictEqual(repeatStore.repeatState.weeklyDays, [2, 4]);
  });

  it("registers handlers for repeat modal actions", () => {
    const repeatModal = domRefs.repeatModal;
    repeatModal.classList.add("hidden");
    registerRepeatEventHandlers();
    const repeatSelect = domRefs.taskRepeatSelect;
    repeatSelect.value = "custom";
    repeatSelect._handlers.change();
    assert.strictEqual(repeatModal.classList.contains("hidden"), false);
  });

  it("handles repeat select and end conditions", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();

    domRefs.taskRepeatSelect.value = "none";
    domRefs.taskRepeatSelect._handlers.change();
    assert.strictEqual(repeatStore.lastRepeatSelection.type, "none");

    domRefs.taskRepeatSelect.value = "custom-new";
    domRefs.taskRepeatSelect._handlers.change();
    assert.strictEqual(domRefs.repeatModal.classList.contains("hidden"), false);

    domRefs.taskRepeatEndAfter.checked = true;
    domRefs.taskRepeatEndCount.value = 2;
    domRefs.taskRepeatEndAfter._handlers.change();
    assert.strictEqual(repeatStore.repeatState.end.type, "after");

    domRefs.taskRepeatEndAfter.checked = false;
    domRefs.taskRepeatEndOn.checked = true;
    domRefs.taskRepeatEndDate.value = "2026-01-01";
    domRefs.taskRepeatEndOn._handlers.change();
    assert.strictEqual(repeatStore.repeatState.end.type, "on");

    domRefs.taskRepeatEndOn.checked = false;
    domRefs.taskRepeatEndNever.checked = true;
    domRefs.taskRepeatEndNever._handlers.change();
    assert.strictEqual(repeatStore.repeatState.end.type, "never");
  });

  it("handles subsection repeat selections and modal actions", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatTarget = "subsection";
    repeatStore.subsectionRepeatBeforeModal = { type: "none" };
    domRefs.repeatModalCloseBtns[0]._handlers.click();
    assert.strictEqual(repeatStore.repeatTarget, "task");

    repeatStore.repeatTarget = "subsection";
    domRefs.repeatModalSaveBtn._handlers.click();
    assert.strictEqual(repeatStore.repeatTarget, "task");
  });

  it("handles task repeat modal actions", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatTarget = "task";
    repeatStore.repeatSelectionBeforeModal = { type: "custom" };
    domRefs.taskRepeatSelect.value = "custom";
    domRefs.repeatModalCloseBtns[0]._handlers.click();
    assert.strictEqual(repeatStore.repeatTarget, "task");

    repeatStore.repeatTarget = "task";
    domRefs.repeatModalSaveBtn._handlers.click();
    assert.strictEqual(repeatStore.repeatTarget, "task");
  });

  it("updates repeat state from unit and weekday changes", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();

    domRefs.taskRepeatUnit.value = "year";
    domRefs.taskRepeatUnit._handlers.change();
    assert.strictEqual(repeatStore.repeatState.yearlyMonth, 1);

    repeatStore.repeatState.weeklyDays = [1];
    domRefs.taskRepeatWeekdays._handlers.click({
      target: {
        closest: () => ({ dataset: { dayValue: "1" } })
      }
    });
    assert.ok(repeatStore.repeatState.weeklyDays.length > 0);
  });

  it("falls back when removing the last weekly day", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();
    repeatStore.repeatState.weeklyDays = [1];

    domRefs.taskRepeatWeekdays._handlers.click({
      target: {
        closest: () => ({ dataset: { dayValue: "1" } })
      }
    });

    assert.strictEqual(repeatStore.repeatState.weeklyDays.length, 1);
    assert.notStrictEqual(repeatStore.repeatState.weeklyDays[0], 1);
  });

  it("respects weekly mode toggles", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatState.weeklyMode = "all";

    domRefs.taskRepeatWeeklyModeAny.checked = false;
    domRefs.taskRepeatWeeklyModeAny._handlers.change();
    assert.strictEqual(repeatStore.repeatState.weeklyMode, "all");

    domRefs.taskRepeatWeeklyModeAny.checked = true;
    domRefs.taskRepeatWeeklyModeAny._handlers.change();
    assert.strictEqual(repeatStore.repeatState.weeklyMode, "any");

    domRefs.taskRepeatWeeklyModeAll.checked = false;
    domRefs.taskRepeatWeeklyModeAll._handlers.change();
    assert.strictEqual(repeatStore.repeatState.weeklyMode, "any");

    domRefs.taskRepeatWeeklyModeAll.checked = true;
    domRefs.taskRepeatWeeklyModeAll._handlers.change();
    assert.strictEqual(repeatStore.repeatState.weeklyMode, "all");
  });

  it("updates yearly range fields and keeps invalid values", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();

    repeatStore.repeatState.yearlyMonth = 5;
    repeatStore.repeatState.yearlyDay = 20;

    domRefs.taskRepeatYearlyRangeEnd.value = "2026-02-14";
    domRefs.taskRepeatYearlyRangeEnd._handlers.input();
    assert.strictEqual(repeatStore.repeatState.yearlyMonth, 2);
    assert.strictEqual(repeatStore.repeatState.yearlyDay, 14);

    domRefs.taskRepeatYearlyRangeEnd.value = "bad";
    domRefs.taskRepeatYearlyRangeEnd._handlers.input();
    assert.strictEqual(repeatStore.repeatState.yearlyMonth, 2);
    assert.strictEqual(repeatStore.repeatState.yearlyDay, 14);
  });

  it("updates monthly range values from inputs", () => {
    domRefs.taskDeadlineInput.value = "2026-01-10";
    registerRepeatEventHandlers();
    repeatStore.repeatState.monthlyRangeStart = 1;
    repeatStore.repeatState.monthlyRangeEnd = 1;

    domRefs.taskRepeatMonthlyRangeStart.value = "2026-01-03";
    domRefs.taskRepeatMonthlyRangeEnd.value = "2026-01-05";
    domRefs.taskRepeatMonthlyRangeStart._handlers.input();

    assert.strictEqual(repeatStore.repeatState.monthlyRangeStart, 3);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEnd, 5);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeStartDate, "2026-01-03");
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEndDate, "2026-01-05");
  });

  it("handles numeric monthly range values with fallbacks", () => {
    domRefs.taskDeadlineInput.value = "2026-01-10";
    registerRepeatEventHandlers();
    repeatStore.repeatState.monthlyRangeStart = 4;
    repeatStore.repeatState.monthlyRangeEnd = 6;
    repeatStore.repeatState.monthlyRangeStartDate = "";
    repeatStore.repeatState.monthlyRangeEndDate = "";

    domRefs.taskRepeatMonthlyRangeStart.value = "";
    domRefs.taskRepeatMonthlyRangeEnd.value = "8";
    domRefs.taskRepeatMonthlyRangeEnd._handlers.input();

    assert.strictEqual(repeatStore.repeatState.monthlyRangeStart, 4);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEnd, 8);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeStartDate, "2026-01-04");
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEndDate, "2026-01-08");
  });

  it("accepts date objects in monthly range inputs", () => {
    domRefs.taskDeadlineInput.value = "2026-01-10";
    registerRepeatEventHandlers();
    repeatStore.repeatState.monthlyRangeStart = 1;
    repeatStore.repeatState.monthlyRangeEnd = 1;
    repeatStore.repeatState.monthlyRangeStartDate = "";
    repeatStore.repeatState.monthlyRangeEndDate = "";

    domRefs.taskRepeatMonthlyRangeStart.value = new Date(2026, 0, 2);
    domRefs.taskRepeatMonthlyRangeEnd.value = new Date(2026, 0, 4);
    domRefs.taskRepeatMonthlyRangeStart._handlers.input();

    assert.strictEqual(repeatStore.repeatState.monthlyRangeStart, 2);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEnd, 4);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeStartDate, "2026-01-02");
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEndDate, "2026-01-04");
  });

  it("falls back on invalid monthly range inputs", () => {
    domRefs.taskDeadlineInput.value = "2026-01-10";
    registerRepeatEventHandlers();
    repeatStore.repeatState.monthlyRangeStart = 5;
    repeatStore.repeatState.monthlyRangeEnd = 7;
    repeatStore.repeatState.monthlyRangeStartDate = "";
    repeatStore.repeatState.monthlyRangeEndDate = "";

    domRefs.taskRepeatMonthlyRangeStart.value = "bad";
    domRefs.taskRepeatMonthlyRangeEnd.value = "";
    domRefs.taskRepeatMonthlyRangeStart._handlers.input();

    assert.strictEqual(repeatStore.repeatState.monthlyRangeStart, 5);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEnd, 7);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeStartDate, "2026-01-05");
    assert.strictEqual(repeatStore.repeatState.monthlyRangeEndDate, "2026-01-07");
  });

  it("updates repeat unit and interval inputs", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();
    const expectedDay = new Date(domRefs.taskDeadlineInput.value).getDate();

    repeatStore.repeatState.weeklyDays = [];
    domRefs.taskRepeatUnit.value = "week";
    domRefs.taskRepeatUnit._handlers.change();
    assert.strictEqual(repeatStore.repeatState.weeklyDays.length, 1);

    domRefs.taskRepeatUnit.value = "month";
    domRefs.taskRepeatUnit._handlers.change();
    assert.strictEqual(repeatStore.repeatState.monthlyDay, expectedDay);
    assert.strictEqual(repeatStore.repeatState.monthlyRangeStart, expectedDay);

    domRefs.taskRepeatInterval.value = 0;
    domRefs.taskRepeatInterval._handlers.input();
    assert.strictEqual(repeatStore.repeatState.interval, 1);
    assert.strictEqual(domRefs.taskRepeatInterval.value, 1);
  });

  it("updates monthly inputs and yearly range start", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();

    domRefs.taskRepeatMonthlyMode.value = "range";
    domRefs.taskRepeatMonthlyMode._handlers.change();
    assert.strictEqual(repeatStore.repeatState.monthlyMode, "range");

    domRefs.taskRepeatMonthlyDay.value = "40";
    domRefs.taskRepeatMonthlyDay._handlers.input();
    assert.strictEqual(repeatStore.repeatState.monthlyDay, 31);
    assert.strictEqual(domRefs.taskRepeatMonthlyDay.value, 31);

    domRefs.taskRepeatMonthlyNth.value = "2";
    domRefs.taskRepeatMonthlyNth._handlers.change();
    assert.strictEqual(repeatStore.repeatState.monthlyNth, 2);

    domRefs.taskRepeatMonthlyWeekday.value = "4";
    domRefs.taskRepeatMonthlyWeekday._handlers.change();
    assert.strictEqual(repeatStore.repeatState.monthlyWeekday, 4);

    domRefs.taskRepeatYearlyRangeStart.value = "2026-02-01";
    domRefs.taskRepeatYearlyRangeStart._handlers.input();
    assert.strictEqual(repeatStore.repeatState.yearlyRangeStartDate, "2026-02-01");
  });

  it("ignores weekday clicks without matching buttons", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatState.weeklyDays = [1];

    domRefs.taskRepeatWeekdays._handlers.click({
      target: {
        closest: () => null
      }
    });

    assert.deepStrictEqual(repeatStore.repeatState.weeklyDays, [1]);
  });

  it("updates repeat end from date input and cleans up handlers", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    const cleanup = registerRepeatEventHandlers();

    domRefs.taskRepeatEndOn.checked = true;
    domRefs.taskRepeatEndDate.value = "2026-03-03";
    domRefs.taskRepeatEndDate._handlers.input();
    assert.strictEqual(repeatStore.repeatState.end.type, "on");

    cleanup();
    assert.strictEqual(domRefs.taskRepeatSelect._handlers.change, undefined);
    assert.strictEqual(domRefs.taskRepeatEndDate._handlers.input, undefined);
  });

  it("handles repeat end count changes", () => {
    registerRepeatEventHandlers();

    domRefs.taskRepeatEndAfter.checked = true;
    domRefs.taskRepeatEndCount.value = 0;
    domRefs.taskRepeatEndCount._handlers.input();
    assert.strictEqual(domRefs.taskRepeatEndCount.value, 1);
    assert.strictEqual(repeatStore.repeatState.end.type, "after");
  });

  it("adds weekly days on repeat weekday clicks", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatState.weeklyDays = [1];

    domRefs.taskRepeatWeekdays._handlers.click({
      target: {
        closest: () => ({ dataset: { dayValue: "2" } })
      }
    });

    assert.ok(repeatStore.repeatState.weeklyDays.includes(2));
  });

  it("handles subsection repeat selection changes", () => {
    registerRepeatEventHandlers();

    domRefs.subsectionTaskRepeatSelect.value = "custom-new";
    domRefs.subsectionTaskRepeatSelect._handlers.change();
    assert.strictEqual(repeatStore.repeatTarget, "subsection");
    assert.strictEqual(domRefs.repeatModal.classList.contains("hidden"), false);

    domRefs.subsectionTaskRepeatSelect.value = "none";
    domRefs.subsectionTaskRepeatSelect._handlers.change();
    assert.strictEqual(repeatStore.subsectionRepeatSelection.type, "none");
  });

  it("syncs subsection modal close and save actions", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatTarget = "subsection";
    repeatStore.subsectionRepeatBeforeModal = {
      type: "custom",
      unit: "week",
      interval: 1,
      weeklyDays: [1],
      end: { type: "never" }
    };
    domRefs.subsectionTaskRepeatSelect.value = "none";
    domRefs.repeatModalCloseBtns[0]._handlers.click();
    assert.strictEqual(domRefs.subsectionTaskRepeatSelect.value, "custom");
    assert.strictEqual(repeatStore.repeatTarget, "task");

    repeatStore.repeatTarget = "subsection";
    domRefs.subsectionTaskRepeatSelect.value = "none";
    domRefs.repeatModalSaveBtn._handlers.click();
    assert.strictEqual(domRefs.subsectionTaskRepeatSelect.value, "custom");
  });

  it("restores task repeat selections on modal close", () => {
    registerRepeatEventHandlers();
    repeatStore.repeatTarget = "task";
    repeatStore.repeatSelectionBeforeModal = {
      type: "custom",
      unit: "week",
      interval: 1,
      weeklyDays: [1],
      end: { type: "never" }
    };
    domRefs.taskRepeatSelect.value = "none";
    domRefs.repeatModalCloseBtns[0]._handlers.click();
    assert.strictEqual(domRefs.taskRepeatSelect.value, "custom");
  });

  it("updates repeat end count from the after toggle", () => {
    registerRepeatEventHandlers();
    domRefs.taskRepeatEndAfter.checked = true;
    domRefs.taskRepeatEndCount.value = 5;
    domRefs.taskRepeatEndAfter._handlers.change();
    assert.strictEqual(repeatStore.repeatState.end.count, 5);
  });

  it("updates yearly range inputs with fallbacks", () => {
    domRefs.taskDeadlineInput.value = "2026-01-07";
    registerRepeatEventHandlers();

    domRefs.taskRepeatYearlyRangeStart.value = "";
    domRefs.taskRepeatYearlyRangeStart._handlers.input();
    assert.ok(repeatStore.repeatState.yearlyRangeStartDate);

    domRefs.taskRepeatYearlyRangeEnd.value = "";
    domRefs.taskRepeatYearlyRangeEnd._handlers.input();
    assert.ok(repeatStore.repeatState.yearlyRangeEndDate);
  });

  it("enables the deadline picker with showPicker and focus fallbacks", () => {
    let showPickerCalled = 0;
    let focusCalled = 0;
    domRefs.taskDeadlineInput.showPicker = () => {
      showPickerCalled += 1;
    };
    domRefs.taskDeadlineInput.focus = () => {
      focusCalled += 1;
    };

    const cleanup = enableDeadlinePicker();
    domRefs.taskDeadlineInput._handlers.click({ isTrusted: true });
    assert.strictEqual(showPickerCalled, 1);

    domRefs.taskDeadlineInput.showPicker = null;
    domRefs.taskDeadlineInput._handlers.keydown({ key: "Enter", isTrusted: true });
    assert.strictEqual(focusCalled, 1);

    cleanup();
    assert.strictEqual(domRefs.taskDeadlineInput._handlers.click, undefined);
    assert.strictEqual(domRefs.taskDeadlineInput._handlers.keydown, undefined);
  });
});
