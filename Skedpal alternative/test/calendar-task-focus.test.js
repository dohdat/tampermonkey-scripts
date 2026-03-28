import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      this.dataset[key] = String(value);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      delete this.dataset[key];
    }
  }

  querySelector(selector) {
    return findFirst(this, (node) => matchesSelector(node, selector));
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

  closest(selector) {
    if (selector !== '[data-test-skedpal="calendar-grid"]') {return null;}
    let current = this;
    while (current) {
      if (current.attributes["data-test-skedpal"] === "calendar-grid") {
        return current;
      }
      current = current.parentElement;
    }
    return null;
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
  if (!node?.attributes) {return false;}
  if (selector === "[data-calendar-focus]") {
    return node.attributes["data-calendar-focus"] === "true";
  }
  if (selector.startsWith("[data-event-task-id=")) {
    const taskId = selector.split('"')[1];
    return node.attributes["data-event-task-id"] === taskId;
  }
  return false;
}

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { focusCalendarEvent } = await import("../src/ui/calendar-task-focus.js");

describe("calendar task focus", () => {
  let grid;
  let timeoutId;
  let timeoutCallback;
  let clearedTimeoutId;
  let originalWindow;

  beforeEach(() => {
    grid = new FakeElement("div");
    grid.setAttribute("data-test-skedpal", "calendar-grid");
    domRefs.calendarGrid = grid;
    state.calendarFocusTaskId = "";
    state.calendarFocusBehavior = "auto";
    state.calendarFocusClearTimer = null;
    timeoutId = 0;
    timeoutCallback = null;
    clearedTimeoutId = null;
    originalWindow = globalThis.window;
    globalThis.window = {
      setTimeout: (fn) => {
        timeoutId += 1;
        timeoutCallback = fn;
        return timeoutId;
      },
      clearTimeout: (value) => {
        clearedTimeoutId = value;
      }
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("focuses a matching event block and persists the task id", () => {
    const block = new FakeElement("div");
    block.setAttribute("data-event-task-id", "task-1");
    block.scrollIntoView = () => {};
    grid.appendChild(block);

    const result = focusCalendarEvent("task-1", { behavior: "smooth" });

    assert.strictEqual(result, true);
    assert.strictEqual(block.attributes["data-calendar-focus"], "true");
    assert.strictEqual(state.calendarFocusTaskId, "task-1");
    assert.strictEqual(state.calendarFocusBehavior, "smooth");
    assert.ok(Number.isInteger(state.calendarFocusClearTimer));
  });

  it("allows highlighting without scroll when requested", () => {
    const block = new FakeElement("div");
    block.setAttribute("data-event-task-id", "task-2");
    grid.appendChild(block);

    const result = focusCalendarEvent("task-2", { allowWithoutScroll: true, persist: false });

    assert.strictEqual(result, true);
    assert.strictEqual(block.attributes["data-calendar-focus"], "true");
    assert.strictEqual(state.calendarFocusTaskId, "");
  });

  it("replaces the previous persisted focus timer and clears focus when it expires", () => {
    const first = new FakeElement("div");
    first.setAttribute("data-event-task-id", "task-1");
    first.scrollIntoView = () => {};
    const second = new FakeElement("div");
    second.setAttribute("data-event-task-id", "task-2");
    second.scrollIntoView = () => {};
    grid.appendChild(first);
    grid.appendChild(second);

    focusCalendarEvent("task-1");
    focusCalendarEvent("task-2");
    timeoutCallback?.();

    assert.ok(Number.isInteger(clearedTimeoutId));
    assert.strictEqual(state.calendarFocusTaskId, "");
    assert.strictEqual(state.calendarFocusBehavior, "auto");
    assert.strictEqual(state.calendarFocusClearTimer, null);
  });

  it("returns false when the event block cannot be found", () => {
    assert.strictEqual(focusCalendarEvent("missing-task"), false);
  });
});
