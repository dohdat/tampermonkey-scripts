import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import {
  ADD_TASK_BUTTON_TEST_ID,
  ADD_TASK_INPUT_TEST_ID,
  ADD_TASK_ROW_TEST_ID
} from "../src/ui/constants.js";
import {
  buildAddTaskRow,
  handleAddTaskInputConversion,
  handleAddTaskLiteralClick,
  parseClipboardTaskTitles
} from "../src/ui/tasks/task-add-row.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.type = "";
    this.maxLength = 0;
    this.placeholder = "";
    this._matches = new Set();
    this._closest = new Map();
    this._query = new Map();
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

  matches(selector) {
    return this._matches.has(selector);
  }

  closest(selector) {
    return this._closest.get(selector) || null;
  }

  querySelector(selector) {
    return this._query.get(selector) || null;
  }
}

const originalDocument = global.document;
const originalHTMLElement = global.HTMLElement;

describe("task add row ui helpers", () => {
  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName)
    };
    global.HTMLElement = FakeElement;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.HTMLElement = originalHTMLElement;
  });

  it("builds add-task row structure with expected data-test hooks", () => {
    const row = buildAddTaskRow({
      sectionId: "sec-1",
      subsectionId: "sub-1",
      parentId: "parent-1"
    });
    assert.strictEqual(row.dataset.addTaskRow, "true");
    assert.strictEqual(row.attributes["data-test-skedpal"], ADD_TASK_ROW_TEST_ID);
    const button = row.children[0];
    const input = row.children[1];
    const preview = row.children[2];
    assert.strictEqual(button.attributes["data-test-skedpal"], ADD_TASK_BUTTON_TEST_ID);
    assert.strictEqual(input.attributes["data-test-skedpal"], ADD_TASK_INPUT_TEST_ID);
    assert.strictEqual(preview.attributes["data-test-skedpal"], "task-add-conversion-preview");
    assert.strictEqual(button.dataset.addTaskParent, "parent-1");
    assert.strictEqual(input.dataset.addTaskSubsection, "sub-1");
  });

  it("updates conversion preview only for matching add-task input elements", () => {
    const input = new FakeElement("input");
    input._matches.add("[data-add-task-input]");
    input.value = "Pay bills tomorrow";
    const row = new FakeElement("div");
    const preview = new FakeElement("div");
    preview.classList.add("opacity-0", "pointer-events-none");
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input._closest.set("[data-add-task-row]", row);

    handleAddTaskInputConversion({ target: input });
    assert.ok(preview.innerHTML || preview.textContent === "");
    assert.strictEqual(preview.classList.contains("opacity-0"), false);

    const other = new FakeElement("input");
    handleAddTaskInputConversion({ target: other });
    assert.strictEqual(other.dataset.titleLiterals, undefined);
  });

  it("adds literal chips to title parsing context and prevents default event", () => {
    const input = new FakeElement("input");
    input.value = "Start project by Friday";
    const preview = new FakeElement("div");
    const row = new FakeElement("div");
    row._query.set("[data-add-task-input]", input);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input._closest.set("[data-add-task-row]", row);

    const chip = new FakeElement("button");
    chip.dataset.titleLiteral = "Friday";
    chip._closest.set("[data-add-task-row]", row);
    const event = {
      target: {
        closest: (selector) => (selector === "[data-title-literal]" ? chip : null)
      },
      preventDefaultCalled: false,
      stopPropagationCalled: false,
      preventDefault() {
        this.preventDefaultCalled = true;
      },
      stopPropagation() {
        this.stopPropagationCalled = true;
      }
    };

    const handled = handleAddTaskLiteralClick(event);
    assert.strictEqual(handled, true);
    assert.ok(input.dataset.titleLiterals);
    assert.strictEqual(event.preventDefaultCalled, true);
    assert.strictEqual(event.stopPropagationCalled, true);
  });

  it("returns false for literal clicks without valid chips/inputs", () => {
    assert.strictEqual(
      handleAddTaskLiteralClick({ target: { closest: () => null } }),
      false
    );
    assert.strictEqual(
      handleAddTaskLiteralClick({
        target: {
          closest: () => ({
            dataset: { titleLiteral: "x" },
            closest: () => ({ querySelector: () => null })
          })
        }
      }),
      false
    );
  });

  it("parses clipboard titles across bullet/number/CRLF styles", () => {
    const titles = parseClipboardTaskTitles("* Alpha\r\n3) Beta\r\n- Gamma");
    assert.deepStrictEqual(titles, ["Alpha", "Beta", "Gamma"]);
  });
});
