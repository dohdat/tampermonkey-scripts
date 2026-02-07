import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import {
  buildPriorityDetailItem,
  buildDurationDetailItem,
  buildTimeMapDetailItem,
  buildStartFromDetailItem,
  buildDeadlineDetailItem,
  buildRepeatDetailItem
} from "../src/ui/tasks/task-card-detail-edit.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
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

function installDomStubs() {
  global.document = {
    createElement: (tagName) => {
      const element = new FakeElement(tagName);
      element.setAttribute("data-test-skedpal", `test-${tagName}`);
      return element;
    }
  };
}

function buildDetailItemElement() {
  const item = new FakeElement("div");
  const valueEl = new FakeElement("div");
  item.setAttribute("data-test-skedpal", "detail-item");
  valueEl.setAttribute("data-test-skedpal", "detail-value");
  item.appendChild(valueEl);
  item.valueEl = valueEl;
  return { item, valueEl };
}

describe("task card detail edit builders", () => {
  beforeEach(() => {
    installDomStubs();
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it("builds priority detail items and cleans up listeners", async () => {
    let updateCalls = 0;
    let applied = 0;
    const task = { priority: 2 };
    const result = buildPriorityDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      applyPrioritySelectColor: (select) => {
        select.dataset.priority = select.value;
        applied += 1;
      },
      onUpdate: async (payload) => {
        updateCalls += 1;
        assert.deepStrictEqual(payload, { priority: 3 });
      }
    });

    const select = result.item.valueEl.children[0];
    select.value = "3";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(updateCalls, 1);
    assert.strictEqual(applied > 0, true);

    result.cleanup();
  });

  it("reverts priority selection when updates fail", async () => {
    const originalError = console.error;
    console.error = () => {};
    const task = { priority: 1 };
    const result = buildPriorityDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      applyPrioritySelectColor: () => {},
      onUpdate: async () => {
        throw new Error("fail");
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "2";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(select.value, "1");
    result.cleanup();
    console.error = originalError;
  });

  it("builds duration detail items", async () => {
    let updateCalls = 0;
    const task = { durationMin: 30 };
    const result = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async (payload) => {
        updateCalls += 1;
        assert.deepStrictEqual(payload, { durationMin: 45 });
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "45";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(updateCalls, 1);
    result.cleanup();
  });

  it("builds timemap detail items", async () => {
    let updateCalls = 0;
    const task = { timeMapIds: ["tm-1"] };
    const result = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: [
        { id: "tm-1", label: "Focus" },
        { id: "tm-2", label: "Deep work" }
      ],
      onUpdate: async (payload) => {
        updateCalls += 1;
        assert.deepStrictEqual(payload, { timeMapIds: ["tm-2"] });
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "tm-2";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(updateCalls, 1);
    result.cleanup();
  });

  it("builds start and deadline detail items", () => {
    let cleared = 0;
    const task = { startFrom: "2026-02-01T09:00:00.000Z", deadline: "2026-02-02T10:00:00.000Z" };
    const startResult = buildStartFromDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {
        cleared += 1;
      }
    });
    const startButton = startResult.item.valueEl.children[1];
    const startHandlers = [...(startButton._handlers.get("click") || [])];
    startHandlers[0]({ preventDefault: () => {} });
    startResult.cleanup();

    const deadlineResult = buildDeadlineDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {
        cleared += 1;
      }
    });
    const deadlineButton = deadlineResult.item.valueEl.children[1];
    const deadlineHandlers = [...(deadlineButton._handlers.get("click") || [])];
    deadlineHandlers[0]({ preventDefault: () => {} });
    deadlineResult.cleanup();

    assert.strictEqual(cleared, 2);
  });

  it("builds repeat detail items when repeating", () => {
    let cleared = 0;
    const result = buildRepeatDetailItem({
      buildDetailItemElement,
      iconSvg: "<svg />",
      repeatSummary: "Every week",
      isRepeating: true,
      onClear: () => {
        cleared += 1;
      }
    });
    const clearButton = result.item.valueEl.children[1];
    const handlers = [...(clearButton._handlers.get("click") || [])];
    handlers[0]({ preventDefault: () => {} });
    result.cleanup();
    assert.strictEqual(cleared, 1);
  });
});
