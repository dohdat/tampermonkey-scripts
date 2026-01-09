import assert from "assert";
import { describe, it } from "mocha";

import { themeColors } from "../src/ui/theme.js";
import {
  clearCalendarEventFocus,
  focusCalendarEventBlock
} from "../src/ui/calendar-focus.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.attributes = {};
    this.parentElement = null;
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
        .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
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
        .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      delete this.dataset[key];
    }
  }

  querySelectorAll(selector) {
    if (selector !== "[data-calendar-focus]") {return [];}
    return this.children.filter((child) => child.attributes["data-calendar-focus"]);
  }

  closest(selector) {
    if (selector !== '[data-test-skedpal="calendar-grid"]') {return null;}
    let node = this;
    while (node) {
      if (node.attributes?.["data-test-skedpal"] === "calendar-grid") {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
}

describe("calendar focus", () => {
  it("returns false when no event block is provided", () => {
    assert.strictEqual(focusCalendarEventBlock(null), false);
  });

  it("applies focus without pulse and auto clear", () => {
    const originalSlate100 = themeColors.slate100;
    const originalBlack = themeColors.black;
    themeColors.slate100 = "#fff";
    themeColors.black = "#000000";
    const block = new FakeElement("div");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    const result = focusCalendarEventBlock(block, { autoClearMs: 0, pulse: false });
    assert.strictEqual(result, true);
    assert.strictEqual(block.attributes["data-calendar-focus"], "true");
    assert.ok(block.style.outline.includes("2px solid"));
    assert.strictEqual(Boolean(block.dataset.calendarFocusTimeout), false);
    assert.strictEqual(Boolean(block.dataset.calendarFocusPulseTimeout), false);
    themeColors.slate100 = originalSlate100;
    themeColors.black = originalBlack;
  });

  it("clears focus and restores prior styles", () => {
    const originalWindow = globalThis.window;
    globalThis.window = globalThis.window || globalThis;
    const originalClearTimeout = globalThis.window.clearTimeout;
    globalThis.window.clearTimeout = globalThis.window.clearTimeout || (() => {});
    const grid = new FakeElement("div");
    grid.setAttribute("data-test-skedpal", "calendar-grid");
    const block = new FakeElement("div");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    block.setAttribute("data-calendar-focus", "true");
    block.dataset.calendarFocusBoxShadow = "shadow";
    block.dataset.calendarFocusOutline = "outline";
    block.dataset.calendarFocusZIndex = "2";
    block.dataset.calendarFocusFilter = "filter";
    block.dataset.calendarFocusTransition = "transition";
    block.dataset.calendarFocusTimeout = "101";
    block.dataset.calendarFocusPulseTimeout = "202";
    block.style.boxShadow = "new-shadow";
    block.style.outline = "new-outline";
    block.style.zIndex = "4";
    block.style.filter = "new-filter";
    block.style.transition = "new-transition";
    grid.appendChild(block);
    clearCalendarEventFocus(grid);
    assert.strictEqual(block.attributes["data-calendar-focus"], undefined);
    assert.strictEqual(block.style.boxShadow, "shadow");
    assert.strictEqual(block.style.outline, "outline");
    assert.strictEqual(block.style.zIndex, "2");
    assert.strictEqual(block.style.filter, "filter");
    assert.strictEqual(block.style.transition, "transition");
    assert.strictEqual(block.dataset.calendarFocusTimeout, undefined);
    assert.strictEqual(block.dataset.calendarFocusPulseTimeout, undefined);
    globalThis.window.clearTimeout = originalClearTimeout;
    globalThis.window = originalWindow;
  });

  it("handles empty and non-hex colors without crashing", () => {
    const originalSlate100 = themeColors.slate100;
    const originalBlack = themeColors.black;
    themeColors.slate100 = "#ffff";
    themeColors.black = "";
    const block = new FakeElement("div");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    const result = focusCalendarEventBlock(block, { autoClearMs: 0, pulse: false });
    assert.strictEqual(result, true);
    themeColors.slate100 = originalSlate100;
    themeColors.black = originalBlack;
  });

  it("returns early when clearing without a grid", () => {
    assert.doesNotThrow(() => clearCalendarEventFocus(null));
  });

  it("keeps custom color strings unchanged", () => {
    const originalSlate100 = themeColors.slate100;
    const originalBlack = themeColors.black;
    themeColors.slate100 = "#zzzzzz";
    themeColors.black = "blue";
    const block = new FakeElement("div");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    const result = focusCalendarEventBlock(block, { autoClearMs: 0, pulse: false });
    assert.strictEqual(result, true);
    themeColors.slate100 = originalSlate100;
    themeColors.black = originalBlack;
  });

  it("applies pulse and auto clear when enabled", () => {
    const originalSlate100 = themeColors.slate100;
    const originalBlack = themeColors.black;
    const originalWindow = globalThis.window;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.window = globalThis.window || globalThis;
    let timeoutCounter = 0;
    globalThis.window.setTimeout = (fn) => {
      timeoutCounter += 1;
      if (typeof fn === "function") {
        fn();
      }
      return timeoutCounter;
    };
    globalThis.window.clearTimeout = () => {};
    themeColors.slate100 = "rgb(1, 2, 3)";
    themeColors.black = "rgba(4, 5, 6, 0.5)";
    const grid = new FakeElement("div");
    grid.setAttribute("data-test-skedpal", "calendar-grid");
    const block = new FakeElement("div");
    block.setAttribute("data-test-skedpal", "calendar-event-block");
    grid.appendChild(block);
    const result = focusCalendarEventBlock(block, { autoClearMs: 500, pulse: true });
    assert.strictEqual(result, true);
    assert.ok(timeoutCounter >= 3);
    themeColors.slate100 = originalSlate100;
    themeColors.black = originalBlack;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });
});
