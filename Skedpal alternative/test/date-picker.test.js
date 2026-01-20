import assert from "assert";
import { describe, it } from "mocha";
import {
  applyJumpToToday,
  buildReportDelaySuggestions,
  buildSuggestedQuickOptions,
  cleanupDatePicker,
  initDatePicker
} from "../src/ui/date-picker.js";
import { DATE_PICKER_SUGGESTED_COUNT } from "../src/ui/constants.js";
import { state as pageState } from "../src/ui/state/page-state.js";

describe("date picker suggested quick picks", () => {
  it("returns empty when task is not repeating", () => {
    const task = { id: "t1", repeat: { type: "none" } };
    const options = buildSuggestedQuickOptions(task, new Date("2026-01-17T12:00:00Z"));
    assert.strictEqual(options.length, 0);
  });

  it("returns weekend occurrences for a weekend-only repeat", () => {
    const task = {
      id: "t2",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 4,
        weeklyDays: [0, 6],
        weeklyMode: "all"
      },
      repeatAnchor: "2026-01-03T00:00:00.000Z"
    };
    const now = new Date("2026-01-17T12:00:00Z");
    const options = buildSuggestedQuickOptions(task, now, DATE_PICKER_SUGGESTED_COUNT);
    assert.ok(options.length > 0);
    options.forEach((option) => {
      const day = option.date.getDay();
      assert.ok(day === 0 || day === 6);
      assert.ok(option.date.getTime() >= now.getTime());
    });
  });

  it("suggests the next available weekend days for report delay", () => {
    const task = {
      id: "t3",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 4,
        weeklyDays: [0, 6],
        weeklyMode: "any"
      },
      repeatAnchor: "2026-01-03T00:00:00.000Z"
    };
    const now = new Date("2026-01-17T12:00:00Z");
    const options = buildReportDelaySuggestions(task, now, DATE_PICKER_SUGGESTED_COUNT);
    const labels = options.map((option) => option.label);
    const hasNextWeekend = options.some((option) =>
      option.date.toISOString().startsWith("2026-01-24")
    );
    assert.ok(labels.length > 0);
    assert.ok(hasNextWeekend);
  });

  it("returns empty report delay suggestions when no repeat is set", () => {
    const task = { id: "t4", repeat: { type: "none" } };
    const options = buildReportDelaySuggestions(task, new Date("2026-01-17T12:00:00Z"));
    assert.strictEqual(options.length, 0);
  });

  it("falls back to suggested options when weekly days are empty or invalid", () => {
    const task = {
      id: "t5",
      repeat: { type: "custom", unit: "week", interval: 1, weeklyDays: [] },
      repeatAnchor: "2026-01-03T00:00:00.000Z"
    };
    const now = new Date("2026-01-17T12:00:00Z");
    const fallback = buildSuggestedQuickOptions(task, now, 3);
    const options = buildReportDelaySuggestions(task, now, 3);
    assert.strictEqual(options.length, fallback.length);

    task.repeat.weeklyDays = ["x"];
    const invalidOptions = buildReportDelaySuggestions(task, now, 3);
    assert.strictEqual(invalidOptions.length, fallback.length);
  });

  it("jumps to today without changing the active input value", () => {
    const state = {
      activeInput: { value: "2026-01-10" },
      selectedDate: new Date(2026, 0, 10),
      viewDate: new Date(2026, 6, 1)
    };
    const now = new Date(2026, 2, 15, 10, 30, 0);
    applyJumpToToday(state, {}, now);

    assert.strictEqual(state.viewDate.getFullYear(), 2026);
    assert.strictEqual(state.viewDate.getMonth(), 2);
    assert.strictEqual(state.viewDate.getDate(), 1);
    assert.strictEqual(state.activeInput.value, "2026-01-10");
    assert.strictEqual(state.selectedDate.getMonth(), 0);
  });

  it("renders calendar placeholders when nodes are available", () => {
      class FakeElement {
        constructor() {
          this.children = [];
          this.textContent = "";
          this.attributes = {};
          this.dataset = {};
          this._classSet = new Set();
          this.classList = {
            add: (name) => this._classSet.add(name)
          };
        }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      removeChild(child) {
        this.children = this.children.filter((node) => node !== child);
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name.startsWith("data-")) {
          const key = name
            .slice(5)
            .split("-")
            .map((part, index) =>
              index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("");
          this.dataset[key] = value;
        }
      }
    }

    const originalDocument = global.document;
    global.document = {
      createElement: () => new FakeElement()
    };

    const state = {
      activeInput: null,
      selectedDate: null,
      viewDate: new Date(2026, 0, 1)
    };
    const nodes = { grid: new FakeElement(), monthLabel: new FakeElement() };
    applyJumpToToday(state, nodes, new Date(2026, 1, 15));
    assert.ok(nodes.grid.children.length > 0);

    global.document = originalDocument;
  });

  it("auto-applies quick picks when the input is not manual", () => {
    const originalDocument = global.document;
    const originalEvent = global.Event;
    const originalDate = global.Date;
    const originalWindow = global.window;

    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.textContent = "";
        this.attributes = {};
        this.dataset = {};
        this.value = "";
        this.listeners = {};
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (name) => this._classSet.add(name),
          remove: (name) => this._classSet.delete(name),
          contains: (name) => this._classSet.has(name),
          toggle: (name, force) => {
            const shouldAdd = typeof force === "boolean" ? force : !this._classSet.has(name);
            if (shouldAdd) {
              this._classSet.add(name);
            } else {
              this._classSet.delete(name);
            }
          }
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      removeChild(child) {
        this.children = this.children.filter((node) => node !== child);
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name.startsWith("data-")) {
          const key = name
            .slice(5)
            .split("-")
            .map((part, index) =>
              index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("");
          this.dataset[key] = value;
        }
      }

      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = (this.listeners[type] || []).filter((fn) => fn !== handler);
      }

      dispatchEvent(event) {
        if (!event.currentTarget) {
          event.currentTarget = this;
        }
        const handlers = this.listeners[event.type] || [];
        handlers.forEach((handler) => handler(event));
        return true;
      }

      closest(selector) {
        if (selector === "[data-date-picker-quick]" && this.dataset.datePickerQuick) {
          return this;
        }
        if (selector === "[data-date-picker-day]" && this.dataset.datePickerDay) {
          return this;
        }
        return null;
      }
    }

    global.Event = class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = init?.bubbles || false;
      }
      preventDefault() {}
    };

    const fixedNow = new originalDate(2026, 0, 17, 12, 0, 0);
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedNow.getTime());
          return;
        }
        super(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };

    const modal = new FakeElement("div");
    const subtitle = new FakeElement("div");
    const summaryValue = new FakeElement("div");
    const monthLabel = new FakeElement("div");
    const grid = new FakeElement("div");
    const quickSuggested = new FakeElement("div");
    const suggestedCard = new FakeElement("div");
    const quickSoon = new FakeElement("div");
    const quickMonth = new FakeElement("div");
    const quickLater = new FakeElement("div");
    const prevBtn = new FakeElement("button");
    const nextBtn = new FakeElement("button");
    const jumpBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");
    const cancelBtn = new FakeElement("button");
    const applyBtn = new FakeElement("button");
    const footer = new FakeElement("div");
    const summaryHint = new FakeElement("div");
    const input = new FakeElement("input");
    input.dataset.datePicker = "true";
    let changeCount = 0;
    function onInputChange() {
      changeCount += 1;
    }
    input.addEventListener("change", onInputChange);

    modal.querySelector = (selector) => {
      if (selector === "#date-picker-subtitle") {return subtitle;}
      if (selector === "#date-picker-summary-value") {return summaryValue;}
      if (selector === "#date-picker-month") {return monthLabel;}
      if (selector === "#date-picker-grid") {return grid;}
      if (selector === "#date-picker-quick-suggested") {return quickSuggested;}
      if (selector === "[data-test-skedpal='date-picker-card-suggested']") {return suggestedCard;}
      if (selector === "#date-picker-quick-soon") {return quickSoon;}
      if (selector === "#date-picker-quick-month") {return quickMonth;}
      if (selector === "#date-picker-quick-later") {return quickLater;}
      if (selector === "[data-date-picker-prev]") {return prevBtn;}
      if (selector === "[data-date-picker-next]") {return nextBtn;}
      if (selector === "#date-picker-jump") {return jumpBtn;}
      if (selector === "[data-date-picker-close]") {return closeBtn;}
      if (selector === "[data-date-picker-cancel]") {return cancelBtn;}
      if (selector === "[data-date-picker-apply]") {return applyBtn;}
      if (selector === "[data-test-skedpal='date-picker-footer']") {return footer;}
      if (selector === "[data-test-skedpal='date-picker-summary-hint']") {return summaryHint;}
      return null;
    };

    global.document = {
      getElementById: (id) => (id === "date-picker-modal" ? modal : null),
      querySelectorAll: (selector) =>
        selector === "input[data-date-picker]" ? [input] : [],
      createElement: (tagName) => new FakeElement(tagName),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    initDatePicker();
    input.dispatchEvent(new Event("click", { bubbles: true }));
    assert.strictEqual(modal.classList.contains("hidden"), false);
    assert.strictEqual(footer.classList.contains("hidden"), true);
    assert.strictEqual(summaryHint.classList.contains("hidden"), true);
    assert.ok(quickSoon.children.length > 0);

    const firstQuick = quickSoon.children[0];
    const expectedValue = firstQuick.dataset.datePickerQuick;
    quickSoon.dispatchEvent({ type: "click", target: firstQuick });

    assert.strictEqual(input.value, expectedValue);
    assert.strictEqual(changeCount > 0, true);
    assert.strictEqual(modal.classList.contains("hidden"), true);

    global.document = originalDocument;
    global.Event = originalEvent;
    global.Date = originalDate;
    global.window = originalWindow;
  });

  it("cleans up date picker listeners when requested", () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalEvent = global.Event;

    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.textContent = "";
        this.attributes = {};
        this.dataset = {};
        this.value = "";
        this.listeners = {};
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (name) => this._classSet.add(name),
          remove: (name) => this._classSet.delete(name),
          contains: (name) => this._classSet.has(name),
          toggle: (name, force) => {
            const shouldAdd = typeof force === "boolean" ? force : !this._classSet.has(name);
            if (shouldAdd) {
              this._classSet.add(name);
            } else {
              this._classSet.delete(name);
            }
          }
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
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = (this.listeners[type] || []).filter((fn) => fn !== handler);
      }
    }

    global.Event = class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = init?.bubbles || false;
      }
      preventDefault() {}
    };

    const modal = new FakeElement("div");
    const subtitle = new FakeElement("div");
    const summaryValue = new FakeElement("div");
    const monthLabel = new FakeElement("div");
    const grid = new FakeElement("div");
    const quickSuggested = new FakeElement("div");
    const suggestedCard = new FakeElement("div");
    const quickSoon = new FakeElement("div");
    const quickMonth = new FakeElement("div");
    const quickLater = new FakeElement("div");
    const prevBtn = new FakeElement("button");
    const nextBtn = new FakeElement("button");
    const jumpBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");
    const cancelBtn = new FakeElement("button");
    const applyBtn = new FakeElement("button");
    const footer = new FakeElement("div");
    const summaryHint = new FakeElement("div");
    const input = new FakeElement("input");
    input.dataset.datePicker = "true";

    modal.querySelector = (selector) => {
      if (selector === "#date-picker-subtitle") {return subtitle;}
      if (selector === "#date-picker-summary-value") {return summaryValue;}
      if (selector === "#date-picker-month") {return monthLabel;}
      if (selector === "#date-picker-grid") {return grid;}
      if (selector === "#date-picker-quick-suggested") {return quickSuggested;}
      if (selector === "[data-test-skedpal='date-picker-card-suggested']") {return suggestedCard;}
      if (selector === "#date-picker-quick-soon") {return quickSoon;}
      if (selector === "#date-picker-quick-month") {return quickMonth;}
      if (selector === "#date-picker-quick-later") {return quickLater;}
      if (selector === "[data-date-picker-prev]") {return prevBtn;}
      if (selector === "[data-date-picker-next]") {return nextBtn;}
      if (selector === "#date-picker-jump") {return jumpBtn;}
      if (selector === "[data-date-picker-close]") {return closeBtn;}
      if (selector === "[data-date-picker-cancel]") {return cancelBtn;}
      if (selector === "[data-date-picker-apply]") {return applyBtn;}
      if (selector === "[data-test-skedpal='date-picker-footer']") {return footer;}
      if (selector === "[data-test-skedpal='date-picker-summary-hint']") {return summaryHint;}
      return null;
    };

    global.document = {
      getElementById: (id) => (id === "date-picker-modal" ? modal : null),
      querySelectorAll: (selector) =>
        selector === "input[data-date-picker]" ? [input] : [],
      createElement: (tagName) => new FakeElement(tagName),
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    let pagehideHandler = null;
    global.window = {
      addEventListener: (type, handler) => {
        if (type === "pagehide") {
          pagehideHandler = handler;
        }
      },
      removeEventListener: () => {}
    };

    cleanupDatePicker();
    initDatePicker();
    pagehideHandler?.();
    initDatePicker();
    cleanupDatePicker();

    global.document = originalDocument;
    global.window = originalWindow;
    global.Event = originalEvent;
  });

  it("applies day selections and responds to jump and escape", () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalEvent = global.Event;

    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.textContent = "";
        this.attributes = {};
        this.dataset = {};
        this.value = "";
        this.listeners = {};
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (name) => this._classSet.add(name),
          remove: (name) => this._classSet.delete(name),
          contains: (name) => this._classSet.has(name),
          toggle: (name, force) => {
            const shouldAdd = typeof force === "boolean" ? force : !this._classSet.has(name);
            if (shouldAdd) {
              this._classSet.add(name);
            } else {
              this._classSet.delete(name);
            }
          }
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name.startsWith("data-")) {
          const key = name
            .slice(5)
            .split("-")
            .map((part, index) =>
              index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("");
          this.dataset[key] = value;
        }
      }

      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = (this.listeners[type] || []).filter((fn) => fn !== handler);
      }

      dispatchEvent(event) {
        if (!event.currentTarget) {
          event.currentTarget = this;
        }
        const handlers = this.listeners[event.type] || [];
        handlers.forEach((handler) => handler(event));
        return true;
      }

      closest(selector) {
        if (selector === "[data-date-picker-quick]" && this.dataset.datePickerQuick) {
          return this;
        }
        if (selector === "[data-date-picker-day]" && this.dataset.datePickerDay) {
          return this;
        }
        return null;
      }
    }

    global.Event = class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = init?.bubbles || false;
      }
      preventDefault() {}
    };

    const modal = new FakeElement("div");
    const subtitle = new FakeElement("div");
    const summaryValue = new FakeElement("div");
    const monthLabel = new FakeElement("div");
    const grid = new FakeElement("div");
    const quickSuggested = new FakeElement("div");
    const suggestedCard = new FakeElement("div");
    const quickSoon = new FakeElement("div");
    const quickMonth = new FakeElement("div");
    const quickLater = new FakeElement("div");
    const prevBtn = new FakeElement("button");
    const nextBtn = new FakeElement("button");
    const jumpBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");
    const cancelBtn = new FakeElement("button");
    const applyBtn = new FakeElement("button");
    const footer = new FakeElement("div");
    const summaryHint = new FakeElement("div");
    const input = new FakeElement("input");
    input.dataset.datePicker = "true";

    modal.querySelector = (selector) => {
      if (selector === "#date-picker-subtitle") {return subtitle;}
      if (selector === "#date-picker-summary-value") {return summaryValue;}
      if (selector === "#date-picker-month") {return monthLabel;}
      if (selector === "#date-picker-grid") {return grid;}
      if (selector === "#date-picker-quick-suggested") {return quickSuggested;}
      if (selector === "[data-test-skedpal='date-picker-card-suggested']") {return suggestedCard;}
      if (selector === "#date-picker-quick-soon") {return quickSoon;}
      if (selector === "#date-picker-quick-month") {return quickMonth;}
      if (selector === "#date-picker-quick-later") {return quickLater;}
      if (selector === "[data-date-picker-prev]") {return prevBtn;}
      if (selector === "[data-date-picker-next]") {return nextBtn;}
      if (selector === "#date-picker-jump") {return jumpBtn;}
      if (selector === "[data-date-picker-close]") {return closeBtn;}
      if (selector === "[data-date-picker-cancel]") {return cancelBtn;}
      if (selector === "[data-date-picker-apply]") {return applyBtn;}
      if (selector === "[data-test-skedpal='date-picker-footer']") {return footer;}
      if (selector === "[data-test-skedpal='date-picker-summary-hint']") {return summaryHint;}
      return null;
    };

    let keydownHandler = null;
    global.document = {
      getElementById: (id) => (id === "date-picker-modal" ? modal : null),
      querySelectorAll: (selector) =>
        selector === "input[data-date-picker]" ? [input] : [],
      createElement: (tagName) => new FakeElement(tagName),
      addEventListener: (type, handler) => {
        if (type === "keydown") {
          keydownHandler = handler;
        }
      },
      removeEventListener: () => {}
    };

    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    initDatePicker();
    input.dispatchEvent(new Event("click", { bubbles: true }));
    jumpBtn.dispatchEvent({ type: "click", currentTarget: jumpBtn });
    assert.strictEqual(footer.classList.contains("hidden"), true);
    assert.strictEqual(summaryHint.classList.contains("hidden"), true);
    prevBtn.dispatchEvent({ type: "click", currentTarget: prevBtn });
    nextBtn.dispatchEvent({ type: "click", currentTarget: nextBtn });

    const dayButton = grid.children.find((child) => child.dataset?.datePickerDay);
    grid.dispatchEvent({ type: "click", target: dayButton });
    assert.ok(input.value);

    input.dispatchEvent(new Event("click", { bubbles: true }));
    keydownHandler?.({ key: "Escape" });
    assert.strictEqual(modal.classList.contains("hidden"), true);

    input.dispatchEvent(new Event("click", { bubbles: true }));
    modal.dispatchEvent({ type: "click", target: modal });
    assert.strictEqual(modal.classList.contains("hidden"), true);

    cleanupDatePicker();
    global.document = originalDocument;
    global.window = originalWindow;
    global.Event = originalEvent;
  });

  it("keeps manual selections open until applied", () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalEvent = global.Event;
    const originalTasksCache = pageState.tasksCache;

    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.textContent = "";
        this.attributes = {};
        this.dataset = {};
        this.value = "";
        this.listeners = {};
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (name) => this._classSet.add(name),
          remove: (name) => this._classSet.delete(name),
          contains: (name) => this._classSet.has(name),
          toggle: (name, force) => {
            const shouldAdd = typeof force === "boolean" ? force : !this._classSet.has(name);
            if (shouldAdd) {
              this._classSet.add(name);
            } else {
              this._classSet.delete(name);
            }
          }
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name.startsWith("data-")) {
          const key = name
            .slice(5)
            .split("-")
            .map((part, index) =>
              index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("");
          this.dataset[key] = value;
        }
      }

      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = (this.listeners[type] || []).filter((fn) => fn !== handler);
      }

      dispatchEvent(event) {
        if (!event.currentTarget) {
          event.currentTarget = this;
        }
        const handlers = this.listeners[event.type] || [];
        handlers.forEach((handler) => handler(event));
        return true;
      }

      closest(selector) {
        if (selector === "[data-date-picker-day]" && this.dataset.datePickerDay) {
          return this;
        }
        return null;
      }
    }

    global.Event = class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = init?.bubbles || false;
        this.key = init?.key;
      }
      preventDefault() {}
    };

    const modal = new FakeElement("div");
    const subtitle = new FakeElement("div");
    const summaryValue = new FakeElement("div");
    const monthLabel = new FakeElement("div");
    const grid = new FakeElement("div");
    const quickSuggested = new FakeElement("div");
    const suggestedCard = new FakeElement("div");
    const quickSoon = new FakeElement("div");
    const quickMonth = new FakeElement("div");
    const quickLater = new FakeElement("div");
    const prevBtn = new FakeElement("button");
    const nextBtn = new FakeElement("button");
    const jumpBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");
    const cancelBtn = new FakeElement("button");
    const applyBtn = new FakeElement("button");
    const footer = new FakeElement("div");
    const summaryHint = new FakeElement("div");
    const input = new FakeElement("input");
    input.dataset.datePicker = "true";
    input.dataset.datePickerManual = "true";

    modal.querySelector = (selector) => {
      if (selector === "#date-picker-subtitle") {return subtitle;}
      if (selector === "#date-picker-summary-value") {return summaryValue;}
      if (selector === "#date-picker-month") {return monthLabel;}
      if (selector === "#date-picker-grid") {return grid;}
      if (selector === "#date-picker-quick-suggested") {return quickSuggested;}
      if (selector === "[data-test-skedpal='date-picker-card-suggested']") {return suggestedCard;}
      if (selector === "#date-picker-quick-soon") {return quickSoon;}
      if (selector === "#date-picker-quick-month") {return quickMonth;}
      if (selector === "#date-picker-quick-later") {return quickLater;}
      if (selector === "[data-date-picker-prev]") {return prevBtn;}
      if (selector === "[data-date-picker-next]") {return nextBtn;}
      if (selector === "#date-picker-jump") {return jumpBtn;}
      if (selector === "[data-date-picker-close]") {return closeBtn;}
      if (selector === "[data-date-picker-cancel]") {return cancelBtn;}
      if (selector === "[data-date-picker-apply]") {return applyBtn;}
      if (selector === "[data-test-skedpal='date-picker-footer']") {return footer;}
      if (selector === "[data-test-skedpal='date-picker-summary-hint']") {return summaryHint;}
      return null;
    };

    global.document = {
      getElementById: (id) => (id === "date-picker-modal" ? modal : null),
      querySelectorAll: (selector) =>
        selector === "input[data-date-picker]" ? [input] : [],
      createElement: (tagName) => new FakeElement(tagName),
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    initDatePicker();
    pageState.tasksCache = [
      {
        id: "task-1",
        repeat: { type: "custom", unit: "week", interval: 1, weeklyDays: [1], weeklyMode: "any" },
        repeatAnchor: "2026-01-03T00:00:00.000Z"
      }
    ];
    input.dataset.reportDelayTask = "task-1";
    applyBtn.dispatchEvent({ type: "click", currentTarget: applyBtn });
    input.dispatchEvent(new Event("keydown", { key: "Enter" }));
    assert.strictEqual(modal.classList.contains("hidden"), false);
    assert.strictEqual(footer.classList.contains("hidden"), false);
    assert.strictEqual(summaryHint.classList.contains("hidden"), false);
    assert.ok(quickSoon.children.length > 0);
    const quickButton = quickSoon.children.find((child) => child.dataset?.datePickerQuick);
    assert.ok(quickButton);
    quickSoon.dispatchEvent({ type: "click", target: quickButton });
    assert.strictEqual(modal.classList.contains("hidden"), false);
    cancelBtn.dispatchEvent({ type: "click", currentTarget: cancelBtn });
    assert.strictEqual(input.dataset.reportDelayTask, "");
    assert.strictEqual(modal.classList.contains("hidden"), true);

    input.dispatchEvent(new Event("keydown", { key: "Enter" }));
    const dayButton = grid.children.find((child) => child.dataset?.datePickerDay);
    grid.dispatchEvent({ type: "click", target: dayButton });
    assert.strictEqual(modal.classList.contains("hidden"), false);
    assert.strictEqual(input.value, "");

    closeBtn.dispatchEvent({ type: "click", currentTarget: closeBtn });
    assert.strictEqual(modal.classList.contains("hidden"), true);

    input.dispatchEvent(new Event("keydown", { key: "Enter" }));
    quickSoon.dispatchEvent({ type: "click", target: quickButton });
    applyBtn.dispatchEvent({ type: "click", currentTarget: applyBtn });
    assert.ok(input.value);
    assert.strictEqual(modal.classList.contains("hidden"), true);

    cleanupDatePicker();
    pageState.tasksCache = originalTasksCache;
    global.document = originalDocument;
    global.window = originalWindow;
    global.Event = originalEvent;
  });
});
