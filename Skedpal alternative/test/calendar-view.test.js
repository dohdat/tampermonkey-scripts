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
    this._innerHTML = "";
    this.style = {
      setProperty: () => {}
    };
    this._handlers = {};
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
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  remove() {
    if (!this.parentElement) {return;}
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      this.dataset[key] = String(value);
    }
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  removeEventListener(type) {
    delete this._handlers[type];
  }

  querySelector(selector) {
    const match = findFirst(this, (node) => matchesSelector(node, selector));
    return match || null;
  }

  querySelectorAll(selector) {
    const results = [];
    walk(this, (node) => {
      if (matchesSelector(node, selector)) {
        results.push(node);
      }
    });
    return results;
  }
}

function walk(root, visitor) {
  visitor(root);
  (root.children || []).forEach((child) => walk(child, visitor));
}

function findFirst(root, predicate) {
  if (predicate(root)) {return root;}
  for (const child of root.children || []) {
    const match = findFirst(child, predicate);
    if (match) {return match;}
  }
  return null;
}

function matchesSelector(node, selector) {
  if (!selector || !node?.attributes) {return false;}
  const dataMatch = selector.match(/^\[data-([^=]+)="([^"]+)"\]$/);
  if (dataMatch) {
    const attr = `data-${dataMatch[1]}`;
    return node.attributes[attr] === dataMatch[2];
  }
  if (selector.startsWith("[data-event-task-id=")) {
    const taskId = selector.split('"')[1];
    return node.attributes["data-event-task-id"] === taskId;
  }
  if (selector.startsWith("[data-day=")) {
    const day = selector.split('"')[1];
    return node.attributes["data-day"] === day;
  }
  return false;
}

const elements = new Map();
elements.set("calendar-grid", new FakeElement("div"));
elements.set("calendar-title", new FakeElement("div"));
elements.set("calendar-day", new FakeElement("button"));
elements.set("calendar-three", new FakeElement("button"));
elements.set("calendar-week", new FakeElement("button"));
elements.set("tasks-calendar-split", new FakeElement("div"));
elements.get("calendar-grid").setAttribute("data-test-skedpal", "calendar-grid");
elements.get("calendar-title").setAttribute("data-test-skedpal", "calendar-title");
elements.get("calendar-day").setAttribute("data-test-skedpal", "calendar-day");
elements.get("calendar-three").setAttribute("data-test-skedpal", "calendar-three");
elements.get("calendar-week").setAttribute("data-test-skedpal", "calendar-week");
elements.get("tasks-calendar-split").setAttribute("data-test-skedpal", "tasks-calendar-split");

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    getElementById: (id) => elements.get(id) || null
  };
}

installDomStubs();
const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { getCalendarRange } = await import("../src/ui/calendar-utils.js");
domRefs.calendarGrid = elements.get("calendar-grid");
domRefs.calendarTitle = elements.get("calendar-title");
domRefs.calendarDayBtn = elements.get("calendar-day");
domRefs.calendarThreeBtn = elements.get("calendar-three");
domRefs.calendarWeekBtn = elements.get("calendar-week");
domRefs.tasksCalendarSplitWrap = elements.get("tasks-calendar-split");

const calendar = await import("../src/ui/calendar.js");
const {
  focusCalendarNow,
  focusCalendarEvent,
  renderCalendar,
  initCalendarView
} = calendar;
const { ensureExternalEvents } = await import("../src/ui/calendar-external.js");

describe("calendar view", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.calendarGrid = elements.get("calendar-grid");
    domRefs.calendarTitle = elements.get("calendar-title");
    domRefs.calendarDayBtn = elements.get("calendar-day");
    domRefs.calendarThreeBtn = elements.get("calendar-three");
    domRefs.calendarWeekBtn = elements.get("calendar-week");
    domRefs.tasksCalendarSplitWrap = elements.get("tasks-calendar-split");
    domRefs.calendarGrid.children = [];
    domRefs.calendarGrid.querySelectorAll = FakeElement.prototype.querySelectorAll;
    domRefs.calendarGrid.querySelector = FakeElement.prototype.querySelector;
    state.calendarAnchorDate = new Date(2026, 0, 6);
    state.calendarViewMode = "week";
    state.tasksTimeMapsCache = [];
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = "";
    state.calendarExternalPendingKey = "";
  });

  it("returns false when no grid is available for focus", () => {
    domRefs.calendarGrid = null;
    assert.strictEqual(focusCalendarNow(), false);
  });

  it("returns false when no indicator exists", () => {
    const result = focusCalendarNow();
    assert.strictEqual(result, false);
  });

  it("scrolls to the now indicator when available", () => {
    const indicator = new FakeElement("div");
    indicator.setAttribute("data-test-skedpal", "calendar-now-indicator");
    let called = false;
    indicator.scrollIntoView = () => {
      called = true;
    };
    domRefs.calendarGrid.appendChild(indicator);
    const result = focusCalendarNow({ behavior: "auto", block: "center" });
    assert.strictEqual(result, true);
    assert.strictEqual(called, true);
  });

  it("returns false when the indicator cannot scroll", () => {
    const indicator = new FakeElement("div");
    indicator.setAttribute("data-test-skedpal", "calendar-now-indicator");
    domRefs.calendarGrid.appendChild(indicator);
    const result = focusCalendarNow({ behavior: "auto", block: "center" });
    assert.strictEqual(result, false);
  });

  it("returns false when focusing without a task id", () => {
    assert.strictEqual(focusCalendarEvent(""), false);
  });

  it("returns false when no calendar grid exists", () => {
    domRefs.calendarGrid = null;
    assert.strictEqual(focusCalendarEvent("task-1"), false);
  });

  it("focuses a calendar event block when present", () => {
    const block = new FakeElement("div");
    block.setAttribute("data-event-task-id", "task-1");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    block.scrollIntoView = () => {};
    domRefs.calendarGrid.appendChild(block);
    const result = focusCalendarEvent("task-1", { behavior: "auto" });
    assert.strictEqual(result, true);
  });

  it("returns false when no calendar event block matches", () => {
    const result = focusCalendarEvent("missing-task", { behavior: "auto" });
    assert.strictEqual(result, false);
  });

  it("returns false when event blocks cannot scroll into view", () => {
    const block = new FakeElement("div");
    block.setAttribute("data-event-task-id", "task-2");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    domRefs.calendarGrid.appendChild(block);
    const result = focusCalendarEvent("task-2", { behavior: "auto" });
    assert.strictEqual(result, false);
  });

  it("renders an empty state when no events exist", async () => {
    await renderCalendar([]);
    const empty = domRefs.calendarGrid.querySelector('[data-test-skedpal="calendar-empty"]');
    assert.ok(empty);
  });

  it("renders with a scheduled event and split view", async () => {
    domRefs.tasksCalendarSplitWrap.dataset.split = "true";
    state.calendarAnchorDate = new Date();
    const now = new Date();
    const task = {
      id: "task-3",
      title: "Scheduled",
      scheduledInstances: [
        { start: new Date(now.getTime() - 30 * 60000).toISOString(), end: now.toISOString() }
      ],
      scheduleStatus: "scheduled"
    };
    const overlapping = {
      id: "task-4",
      title: "Overlap",
      scheduledInstances: [
        { start: new Date(now.getTime() - 20 * 60000).toISOString(), end: now.toISOString() }
      ],
      scheduleStatus: "scheduled"
    };
    await renderCalendar([task, overlapping]);
    const empty = domRefs.calendarGrid.querySelector('[data-test-skedpal="calendar-empty"]');
    assert.strictEqual(Boolean(empty), false);
    const blocks = domRefs.calendarGrid.querySelectorAll('[data-test-skedpal="calendar-event"]');
    assert.ok(blocks.length >= 2);
  });

  it("rerenders when external fetch signals updates", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    const originalChrome = globalThis.chrome;
    globalThis.chrome = {
      runtime: {
        sendMessage: (_payload, callback) => callback({ ok: false, error: "bad" })
      }
    };
    const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
    await ensureExternalEvents(range);
    assert.strictEqual(state.calendarExternalPendingKey, "");
    globalThis.chrome = originalChrome;
    console.warn = originalWarn;
  });

  it("initializes the calendar view once", () => {
    const originalWindow = globalThis.window;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.addEventListener = () => {};
    globalThis.window.removeEventListener = () => {};
    globalThis.setInterval = () => 1;
    globalThis.clearInterval = () => {};
    globalThis.window.setInterval = globalThis.setInterval;
    globalThis.window.clearInterval = globalThis.clearInterval;
    initCalendarView();
    initCalendarView();
    globalThis.window = originalWindow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });
});
