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
import { PRIORITY_MIN } from "../src/ui/constants.js";

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

  it("falls back to minimum priority when priority is missing", async () => {
    const originalError = console.error;
    console.error = () => {};
    const task = { priority: 0 };
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
    assert.strictEqual(select.value, String(PRIORITY_MIN));
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

  it("adds a custom duration option when missing", () => {
    const task = { durationMin: 75 };
    const result = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async () => {}
    });
    const select = result.item.valueEl.children[0];
    const customOption = select.children.find?.(
      (child) => child.value === "75"
    );
    assert.ok(customOption);
    assert.strictEqual(customOption.textContent, "1h15");
    result.cleanup();
  });

  it("skips invalid duration updates and restores on failure", async () => {
    const originalError = console.error;
    console.error = () => {};
    const task = { durationMin: 30 };
    const result = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async () => {
        throw new Error("fail");
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "bad";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    select.value = "45";
    await handlers[0]();
    assert.strictEqual(select.value, "30");
    result.cleanup();
    console.error = originalError;
  });

  it("skips updates when values are unchanged or invalid", async () => {
    let updateCalls = 0;
    const task = { priority: 2, durationMin: 30 };
    const priorityResult = buildPriorityDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      applyPrioritySelectColor: () => {},
      onUpdate: async () => {
        updateCalls += 1;
      }
    });
    const prioritySelect = priorityResult.item.valueEl.children[0];
    prioritySelect.value = "2";
    const priorityHandlers = [...(prioritySelect._handlers.get("change") || [])];
    await priorityHandlers[0]();

    prioritySelect.value = "nope";
    await priorityHandlers[0]();
    assert.strictEqual(updateCalls, 0);
    priorityResult.cleanup();

    const durationResult = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async () => {
        updateCalls += 1;
      }
    });
    const durationSelect = durationResult.item.valueEl.children[0];
    durationSelect.value = "30";
    const durationHandlers = [...(durationSelect._handlers.get("change") || [])];
    await durationHandlers[0]();
    assert.strictEqual(updateCalls, 0);
    durationResult.cleanup();
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

  it("handles multiple timemap selections and update failures", async () => {
    let updateCalls = 0;
    const originalError = console.error;
    console.error = () => {};
    const task = { timeMapIds: ["tm-1", "tm-2"] };
    const result = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: [
        { id: "tm-1", label: "Focus" },
        { id: "tm-2", label: "Deep work" }
      ],
      onUpdate: async () => {
        updateCalls += 1;
        throw new Error("fail");
      }
    });
    const select = result.item.valueEl.children[0];
    assert.strictEqual(select.value, "__multiple__");
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(updateCalls, 0);

    select.value = "tm-1";
    await handlers[0]();
    assert.strictEqual(select.value, "tm-1");
    result.cleanup();
    console.error = originalError;
  });

  it("handles empty timemap options and empty selections", async () => {
    let updateCalls = 0;
    const task = { timeMapIds: "nope" };
    const result = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: null,
      onUpdate: async () => {
        updateCalls += 1;
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(updateCalls, 0);
    result.cleanup();
  });

  it("creates timemap options with empty ids", () => {
    const task = { timeMapIds: [] };
    const result = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: [{ id: "", label: "Empty" }],
      onUpdate: async () => {}
    });
    const select = result.item.valueEl.children[0];
    const option = select.children.find?.(
      (child) => child.attributes?.["data-test-skedpal"] === "task-detail-timemap-option-"
    );
    assert.ok(option);
    result.cleanup();
  });

  it("falls back to default duration when missing", async () => {
    const originalError = console.error;
    console.error = () => {};
    const task = { durationMin: 0 };
    const result = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async () => {
        throw new Error("fail");
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "45";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(select.value, "30");
    result.cleanup();
    console.error = originalError;
  });

  it("restores timemap selections after failed updates", async () => {
    const originalError = console.error;
    console.error = () => {};
    const task = { timeMapIds: [] };
    const result = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: [{ id: "tm-1", label: "Focus" }],
      onUpdate: async () => {
        throw new Error("fail");
      }
    });
    const select = result.item.valueEl.children[0];
    select.value = "tm-1";
    const handlers = [...(select._handlers.get("change") || [])];
    await handlers[0]();
    assert.strictEqual(select.value, "");
    result.cleanup();
    console.error = originalError;
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

  it("returns empty detail items when values are missing", () => {
    const task = { startFrom: "", deadline: "" };
    const startResult = buildStartFromDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {}
    });
    const deadlineResult = buildDeadlineDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {}
    });
    assert.strictEqual(startResult.item, null);
    assert.strictEqual(deadlineResult.item, null);
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

  it("skips clear actions when not repeating", () => {
    const result = buildRepeatDetailItem({
      buildDetailItemElement,
      iconSvg: "<svg />",
      repeatSummary: "Does not repeat",
      isRepeating: false,
      onClear: () => {}
    });
    assert.strictEqual(result.item.valueEl.children.length, 1);
    result.cleanup();
  });

  it("skips cleanup work when interactions are disabled", () => {
    const task = {
      startFrom: "2026-02-01T09:00:00.000Z",
      deadline: "2026-02-02T10:00:00.000Z"
    };
    const startResult = buildStartFromDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {},
      disableInteractions: true
    });
    const deadlineResult = buildDeadlineDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      formatDateTime: (value) => value,
      onClear: () => {},
      disableInteractions: true
    });
    const repeatResult = buildRepeatDetailItem({
      buildDetailItemElement,
      iconSvg: "<svg />",
      repeatSummary: "Every week",
      isRepeating: true,
      onClear: () => {},
      disableInteractions: true
    });
    startResult.cleanup();
    deadlineResult.cleanup();
    repeatResult.cleanup();
  });

  it("skips listeners when interactions are disabled", () => {
    const task = { priority: 1, durationMin: 30, timeMapIds: [] };
    const priorityResult = buildPriorityDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      applyPrioritySelectColor: () => {},
      onUpdate: async () => {},
      disableInteractions: true
    });
    const durationResult = buildDurationDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      onUpdate: async () => {},
      disableInteractions: true
    });
    const timeMapResult = buildTimeMapDetailItem({
      task,
      buildDetailItemElement,
      iconSvg: "<svg />",
      timeMapOptions: [],
      onUpdate: async () => {},
      disableInteractions: true
    });
    const prioritySelect = priorityResult.item.valueEl.children[0];
    const durationSelect = durationResult.item.valueEl.children[0];
    const timeMapSelect = timeMapResult.item.valueEl.children[0];
    assert.strictEqual(prioritySelect._handlers.size, 0);
    assert.strictEqual(durationSelect._handlers.size, 0);
    assert.strictEqual(timeMapSelect._handlers.size, 0);
    priorityResult.cleanup();
    durationResult.cleanup();
    timeMapResult.cleanup();
  });
});
