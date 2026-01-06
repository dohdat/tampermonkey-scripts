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
          if (this._classSet.has(name)) this._classSet.delete(name);
          else this._classSet.add(name);
          return;
        }
        if (force) this._classSet.add(name);
        else this._classSet.delete(name);
      },
      contains: (name) => this._classSet.has(name)
    };
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
}

function createSelect(options = []) {
  const select = new FakeElement("select");
  options.forEach((opt) => {
    const option = new FakeElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    select._options.set(opt.value, option);
  });
  return select;
}

global.document = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  querySelectorAll: () => [],
  getElementById: () => null
};

const { domRefs } = await import("../src/ui/constants.js");
const repeat = await import("../src/ui/repeat.js");
const {
  getRepeatSummary,
  buildRepeatFromState,
  repeatStore,
  renderRepeatUI,
  setRepeatFromSelection,
  registerRepeatEventHandlers
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
      if (!el) return;
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
      if (!el) return;
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
      "taskRepeatMonthlyMode",
      "taskRepeatMonthlyDay",
      "taskRepeatMonthlyNth",
      "taskRepeatMonthlyWeekday",
      "taskRepeatWeeklySection",
      "taskRepeatMonthlySection",
      "taskRepeatMonthlyDayWrap",
      "taskRepeatMonthlyNthWrap",
      "taskRepeatEndNever",
      "taskRepeatEndOn",
      "taskRepeatEndAfter",
      "taskRepeatEndDate",
      "taskRepeatEndCount",
      "repeatModal",
      "repeatModalSaveBtn",
      "subsectionTaskRepeatSelect"
    ].forEach((key) => reset(domRefs[key]));

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
      { value: "nth", label: "" }
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
});
