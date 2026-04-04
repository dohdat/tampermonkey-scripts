import "fake-indexeddb/auto.js";
import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import {
  ADD_TASK_BUTTON_TEST_ID,
  ADD_TASK_GRAMMAR_BUTTON_TEST_ID,
  ADD_TASK_GRAMMAR_WRAP_TEST_ID,
  ADD_TASK_INPUT_TEST_ID,
  ADD_TASK_ROW_TEST_ID
} from "../src/ui/constants.js";
import {
  buildAddTaskRow,
  collapseAddTaskRowForInput,
  handleAddTaskGrammarClick,
  handleAddTaskInputSubmit,
  handleAddTaskInputConversion,
  handleAddTaskInputSelection,
  handleAddTaskRowClick,
  handleAddTaskLiteralClick,
  parseClipboardTaskTitles
} from "../src/ui/tasks/task-add-row.js";
import { deleteTask, getAllTasks } from "../src/data/db.js";
import { state } from "../src/ui/state/page-state.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.innerHTML = "";
    this.textContent = "";
    this.style = {};
    this.value = "";
    this.type = "";
    this.maxLength = 0;
    this.placeholder = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.clientWidth = 220;
    this.offsetWidth = 220;
    this.scrollLeft = 0;
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

  matches(selector) {
    return this._matches.has(selector);
  }

  closest(selector) {
    return this._closest.get(selector) || null;
  }

  querySelector(selector) {
    return this._query.get(selector) || null;
  }

  focus() {
    this.focused = true;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

const originalDocument = global.document;
const originalHTMLElement = global.HTMLElement;
const originalWindow = global.window;
const originalEvent = global.Event;

describe("task add row ui helpers", () => {
  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      querySelectorAll: () => []
    };
    global.HTMLElement = FakeElement;
    global.window = {
      dispatchEvent: () => true
    };
    global.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: false };
    state.tasksCache = [];
  });

  afterEach(() => {
    global.document = originalDocument;
    global.HTMLElement = originalHTMLElement;
    global.window = originalWindow;
    global.Event = originalEvent;
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
    const grammarWrap = row.children[1];
    const preview = row.children[2];
    const input = grammarWrap.children[0];
    const grammarButton = grammarWrap.children[1];
    assert.strictEqual(button.attributes["data-test-skedpal"], ADD_TASK_BUTTON_TEST_ID);
    assert.strictEqual(input.attributes["data-test-skedpal"], ADD_TASK_INPUT_TEST_ID);
    assert.strictEqual(grammarWrap.attributes["data-test-skedpal"], ADD_TASK_GRAMMAR_WRAP_TEST_ID);
    assert.strictEqual(
      grammarButton.attributes["data-test-skedpal"],
      ADD_TASK_GRAMMAR_BUTTON_TEST_ID
    );
    assert.strictEqual(grammarButton.className.includes("absolute"), true);
    assert.strictEqual(grammarButton.className.includes("right-2"), true);
    assert.strictEqual(grammarWrap.className.includes("relative"), true);
    assert.strictEqual(grammarWrap.className.includes("w-full"), true);
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

  it("shows quick-add grammar icon whenever add-task row is active", () => {
    const row = buildAddTaskRow({ sectionId: "sec-1" });
    const grammarWrap = row.children[1];
    const input = grammarWrap.children[0];
    const grammarButton = grammarWrap.children[1];
    row.dataset.addTaskActive = "true";
    row._query.set("[data-add-task-input]", input);
    row._query.set("[data-add-task-grammar-button]", grammarButton);
    input._closest.set("[data-add-task-row]", row);
    input._matches.add("[data-add-task-input]");
    input.value = "Fix this sentence";
    handleAddTaskInputSelection({ target: input });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);

    input.selectionStart = 2;
    input.selectionEnd = 2;
    handleAddTaskInputSelection({ target: input });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);
  });

  it("ignores conversion events for non-HTMLElement targets", () => {
    assert.doesNotThrow(() => handleAddTaskInputConversion({ target: {} }));
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

  it("returns false when clicking an already-selected literal chip", () => {
    const input = new FakeElement("input");
    input.value = "Plan for Friday";
    input.dataset.titleLiterals = "[\"Friday\"]";
    const row = new FakeElement("div");
    row._query.set("[data-add-task-input]", input);
    const chip = new FakeElement("button");
    chip.dataset.titleLiteral = "Friday";
    chip._closest.set("[data-add-task-row]", row);
    const handled = handleAddTaskLiteralClick({
      target: { closest: () => chip },
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(handled, false);
  });

  it("parses clipboard titles across bullet/number/CRLF styles", () => {
    const titles = parseClipboardTaskTitles("* Alpha\r\n3) Beta\r\n- Gamma");
    assert.deepStrictEqual(titles, ["Alpha", "Beta", "Gamma"]);
  });

  it("activates clicked add-task row and collapses other active rows", () => {
    const activeRow = buildAddTaskRow({ sectionId: "s1" });
    const activeButton = activeRow.children[0];
    const activeInput = activeRow.children[1].children[0];
    activeRow._query.set("[data-add-task-button]", activeButton);
    activeRow._query.set("[data-add-task-input]", activeInput);
    activeRow._query.set('[data-test-skedpal="task-add-conversion-preview"]', activeRow.children[2]);
    activeRow._query.set("[data-add-task-grammar-wrap]", activeRow.children[1]);
    activeRow._query.set("[data-add-task-grammar-button]", activeRow.children[1].children[1]);
    const otherRow = buildAddTaskRow({ sectionId: "s2" });
    const otherButton = otherRow.children[0];
    const otherInput = otherRow.children[1].children[0];
    otherRow._query.set("[data-add-task-button]", otherButton);
    otherRow._query.set("[data-add-task-input]", otherInput);
    otherRow._query.set('[data-test-skedpal="task-add-conversion-preview"]', otherRow.children[2]);
    otherRow._query.set("[data-add-task-grammar-wrap]", otherRow.children[1]);
    otherRow._query.set("[data-add-task-grammar-button]", otherRow.children[1].children[1]);
    otherRow.dataset.addTaskActive = "true";
    otherInput.value = "old";
    otherInput.dataset.titleLiterals = '["today"]';

    global.document.querySelectorAll = () => [activeRow, otherRow];
    activeButton.closest = (selector) => (selector === "[data-add-task-row]" ? activeRow : null);

    const handled = handleAddTaskRowClick(activeButton);
    assert.strictEqual(handled, true);
    assert.strictEqual(activeRow.dataset.addTaskActive, "true");
    assert.strictEqual(activeButton.classList.contains("hidden"), true);
    assert.strictEqual(activeInput.classList.contains("hidden"), false);
    assert.strictEqual(activeRow.children[1].classList.contains("hidden"), false);
    assert.strictEqual(activeInput.focused, true);
    assert.strictEqual(otherRow.dataset.addTaskActive, undefined);
    assert.strictEqual(otherButton.classList.contains("hidden"), false);
    assert.strictEqual(otherRow.children[1].classList.contains("hidden"), true);
    assert.strictEqual(otherInput.value, "");
    assert.strictEqual(otherInput.dataset.titleLiterals, undefined);
  });

  it("returns false when add-task row click does not resolve a row", () => {
    const button = new FakeElement("button");
    button.closest = () => null;
    assert.strictEqual(handleAddTaskRowClick(button), false);
  });

  it("collapses row when input blur helper is called", () => {
    const row = buildAddTaskRow({ sectionId: "s1" });
    const button = row.children[0];
    const grammarWrap = row.children[1];
    const input = grammarWrap.children[0];
    const preview = row.children[2];
    row.dataset.addTaskActive = "true";
    input.classList.remove("hidden");
    grammarWrap.classList.remove("hidden");
    input.value = "task title";
    input.dataset.titleLiterals = '["tomorrow"]';
    preview.textContent = "preview";
    row._query.set("[data-add-task-button]", button);
    row._query.set("[data-add-task-input]", input);
    row._query.set("[data-add-task-grammar-wrap]", grammarWrap);
    row._query.set("[data-add-task-grammar-button]", grammarWrap.children[1]);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);

    collapseAddTaskRowForInput(input);
    assert.strictEqual(row.dataset.addTaskActive, undefined);
    assert.strictEqual(input.classList.contains("hidden"), true);
    assert.strictEqual(grammarWrap.classList.contains("hidden"), true);
    assert.strictEqual(input.value, "");
    assert.strictEqual(preview.textContent, "");
    assert.strictEqual(button.classList.contains("hidden"), false);
  });

  it("returns false and collapses for empty submit input", async () => {
    const row = buildAddTaskRow({ sectionId: "s1" });
    const button = row.children[0];
    const input = row.children[1].children[0];
    const preview = row.children[2];
    row._query.set("[data-add-task-button]", button);
    row._query.set("[data-add-task-input]", input);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
    input.value = "   ";
    const savedBefore = await getAllTasks();
    const result = await handleAddTaskInputSubmit(input);
    const savedAfter = await getAllTasks();
    assert.strictEqual(result, false);
    assert.deepStrictEqual(savedAfter, savedBefore);
    assert.strictEqual(input.classList.contains("hidden"), true);
  });

  it("submits non-empty quick-add input and persists a task", async () => {
    const row = buildAddTaskRow({ sectionId: "sec-1", subsectionId: "sub-1" });
    const button = row.children[0];
    const input = row.children[1].children[0];
    const preview = row.children[2];
    row._query.set("[data-add-task-button]", button);
    row._query.set("[data-add-task-input]", input);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
    input.dataset.addTaskSection = "sec-1";
    input.dataset.addTaskSubsection = "sub-1";
    input.value = "Write more tests";
    state.tasksCache = [];

    const result = await handleAddTaskInputSubmit(input);
    assert.strictEqual(result, true);
    const tasks = await getAllTasks();
    const created = tasks.find((task) => task.title === "Write more tests");
    assert.ok(created);
    assert.strictEqual(created.section, "sec-1");
    assert.strictEqual(created.subsection, "sub-1");
    await Promise.all(tasks.map((task) => deleteTask(task.id)));
  });

  it("submits a child task when add-task parent id is present", async () => {
    const row = buildAddTaskRow({ sectionId: "sec-1", subsectionId: "sub-1", parentId: "parent-1" });
    const button = row.children[0];
    const input = row.children[1].children[0];
    const preview = row.children[2];
    row._query.set("[data-add-task-button]", button);
    row._query.set("[data-add-task-input]", input);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    input.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
    input.dataset.addTaskSection = "sec-1";
    input.dataset.addTaskSubsection = "sub-1";
    input.dataset.addTaskParent = "parent-1";
    input.value = "Child follow-up";
    state.tasksCache = [
      {
        id: "parent-1",
        section: "sec-parent",
        subsection: "sub-parent",
        order: 1,
        timeMapIds: [],
        repeat: { type: "none" }
      }
    ];

    const result = await handleAddTaskInputSubmit(input);
    assert.strictEqual(result, true);
    const tasks = await getAllTasks();
    const created = tasks.find((task) => task.title === "Child follow-up");
    assert.ok(created);
    assert.strictEqual(created.subtaskParentId, "parent-1");
    await Promise.all(tasks.map((task) => deleteTask(task.id)));
  });

  it("applies grammar fixes from the quick-add grammar button", async () => {
    const row = buildAddTaskRow({ sectionId: "sec-1", subsectionId: "sub-1" });
    const grammarWrap = row.children[1];
    const input = grammarWrap.children[0];
    const grammarButton = grammarWrap.children[1];
    const preview = row.children[2];
    row.dataset.addTaskActive = "true";
    row._query.set("[data-add-task-input]", input);
    row._query.set("[data-add-task-grammar-wrap]", grammarWrap);
    row._query.set("[data-add-task-grammar-button]", grammarButton);
    row._query.set('[data-test-skedpal="task-add-conversion-preview"]', preview);
    grammarButton.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
    input.value = "fix grammar quickly";
    input.selectionStart = 0;
    input.selectionEnd = input.value.length;
    const event = {
      target: {
        closest: (selector) => (selector === "[data-add-task-grammar-button]" ? grammarButton : null)
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

    const handled = await handleAddTaskGrammarClick(event, {
      fixGrammarFn: async () => "Fix grammar quickly."
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(input.value, "Fix grammar quickly.");
    assert.strictEqual(event.preventDefaultCalled, true);
    assert.strictEqual(event.stopPropagationCalled, true);
  });

  it("keeps focus when quick-add grammar button is clicked with empty text", async () => {
    const row = buildAddTaskRow({ sectionId: "sec-1", subsectionId: "sub-1" });
    const grammarWrap = row.children[1];
    const input = grammarWrap.children[0];
    const grammarButton = grammarWrap.children[1];
    row.dataset.addTaskActive = "true";
    row._query.set("[data-add-task-input]", input);
    row._query.set("[data-add-task-grammar-button]", grammarButton);
    grammarButton.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
    const event = {
      target: {
        closest: (selector) => (selector === "[data-add-task-grammar-button]" ? grammarButton : null)
      },
      preventDefault() {},
      stopPropagation() {}
    };

    const handled = await handleAddTaskGrammarClick(event, {
      fixGrammarFn: async () => "Should not run"
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(input.focused, true);
  });

  it("returns false when quick-add grammar click does not target grammar button", async () => {
    const handled = await handleAddTaskGrammarClick({
      target: { closest: () => null },
      preventDefault() {},
      stopPropagation() {}
    });
    assert.strictEqual(handled, false);
  });

  it("keeps quick-add input stable when grammar fix fails", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const row = buildAddTaskRow({ sectionId: "sec-1", subsectionId: "sub-1" });
      const grammarWrap = row.children[1];
      const input = grammarWrap.children[0];
      const grammarButton = grammarWrap.children[1];
      row.dataset.addTaskActive = "true";
      row._query.set("[data-add-task-input]", input);
      row._query.set("[data-add-task-grammar-button]", grammarButton);
      grammarButton.closest = (selector) => (selector === "[data-add-task-row]" ? row : null);
      input.value = "fix grammar";
      input.selectionStart = 0;
      input.selectionEnd = input.value.length;
      const event = {
        target: {
          closest: (selector) => (selector === "[data-add-task-grammar-button]" ? grammarButton : null)
        },
        preventDefault() {},
        stopPropagation() {}
      };

      const handled = await handleAddTaskGrammarClick(event, {
        fixGrammarFn: async () => {
          throw new Error("boom");
        }
      });
      assert.strictEqual(handled, true);
      assert.strictEqual(input.value, "fix grammar");
      assert.strictEqual(grammarButton.dataset.loading, "false");
    } finally {
      console.error = originalConsoleError;
    }
  });
});
