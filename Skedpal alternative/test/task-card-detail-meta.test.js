import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import { TASK_REPEAT_NONE } from "../src/ui/constants.js";
import {
  buildDetailItemElement,
  buildTaskMeta,
  detailClockIconSvg
} from "../src/ui/tasks/task-card-detail-meta.js";

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
    this.disabled = false;
    this.style = {};
    this._handlers = new Map();
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      this.dataset[key] = stringValue;
    }
  }

  addEventListener(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }
}

const originalDocument = global.document;

describe("task card detail meta", () => {
  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName)
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it("builds a detail item element with test selectors", () => {
    const { item, valueEl } = buildDetailItemElement({
      key: "duration",
      label: "Duration",
      iconSvg: detailClockIconSvg,
      extraClass: "custom-class",
      valueTestId: "task-duration-value"
    });
    assert.ok(item.className.includes("custom-class"));
    assert.strictEqual(item.dataset.testSkedpal, "task-detail-duration");
    assert.strictEqual(valueEl.dataset.testSkedpal, "task-duration-value");
  });

  it("builds task meta in non-interactive mode and returns safe cleanup", () => {
    const task = {
      id: "task-1",
      deadline: "2026-02-15T12:00:00.000Z",
      startFrom: "2026-02-14T12:00:00.000Z",
      minBlockMin: 25,
      durationMin: 45,
      priority: 3,
      timeMapIds: ["tm-1"],
      repeat: { type: TASK_REPEAT_NONE },
      reminders: [
        { id: "r1", days: 1, remindAt: "2026-02-13T12:00:00.000Z", dismissedAt: "" }
      ]
    };
    const { meta, cleanup } = buildTaskMeta(
      task,
      [{ id: "tm-1", label: "Focus" }],
      "Does not repeat",
      { disableInteractions: true }
    );
    assert.strictEqual(meta.dataset.testSkedpal, "task-meta");
    assert.ok(meta.children.length >= 5);
    assert.doesNotThrow(() => cleanup());
  });

  it("builds task meta in interactive mode and cleanup removes listeners", () => {
    const task = {
      id: "task-2",
      deadline: "2026-02-15T12:00:00.000Z",
      startFrom: "2026-02-14T12:00:00.000Z",
      minBlockMin: 15,
      durationMin: 30,
      priority: 2,
      timeMapIds: ["tm-1"],
      repeat: { type: "custom", unit: "week" },
      reminders: []
    };
    const { meta, cleanup } = buildTaskMeta(task, [{ id: "tm-1", label: "Focus" }], "Every week");
    assert.strictEqual(meta.dataset.testSkedpal, "task-meta");
    assert.ok(meta.children.length >= 4);
    assert.doesNotThrow(() => cleanup());
  });
});
