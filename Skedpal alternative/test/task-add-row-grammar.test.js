import assert from "assert";
import {
  applyAddTaskGrammarReplacement,
  resolveAddTaskGrammarSelectionContext,
  resolveAddTaskInputFromEventTarget,
  syncAddTaskGrammarButtonState
} from "../src/ui/tasks/task-add-row-grammar.js";

class FakeHTMLElement {
  constructor() {
    this.dataset = {};
    this.style = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
    this._matches = new Set();
    this._closest = null;
    this._query = new Map();
  }

  matches(selector) {
    return this._matches.has(selector);
  }

  closest() {
    return this._closest;
  }

  querySelector(selector) {
    return this._query.get(selector) || null;
  }
}

describe("task add row grammar helpers", () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalHTMLElement = global.HTMLElement;

  beforeEach(() => {
    global.HTMLElement = FakeHTMLElement;
    global.window = {
      getComputedStyle: () => ({
        font: "12px sans-serif",
        paddingLeft: "12px",
        paddingRight: "12px",
        borderLeftWidth: "1px"
      })
    };
    global.document = {
      createElement: (tagName) => {
        if (tagName !== "canvas") {
          return {};
        }
        return {
          getContext: () => ({
            font: "",
            measureText: (text) => ({ width: String(text || "").length * 8 })
          })
        };
      }
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.HTMLElement = originalHTMLElement;
  });

  it("shows grammar button on active rows", () => {
    const input = new FakeHTMLElement();
    input.value = "Fix this sentence";
    input.selectionStart = 0;
    input.selectionEnd = 4;
    input.clientWidth = 260;
    input.offsetWidth = 260;
    input.scrollLeft = 0;
    const row = new FakeHTMLElement();
    row.dataset.addTaskActive = "true";
    const grammarButton = new FakeHTMLElement();

    syncAddTaskGrammarButtonState({ input, row, grammarButton });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);
    assert.strictEqual(grammarButton.style.display, "");
  });

  it("keeps grammar button visible on active rows without selection", () => {
    const input = new FakeHTMLElement();
    input.value = "Fix this sentence";
    input.selectionStart = 2;
    input.selectionEnd = 2;
    const row = new FakeHTMLElement();
    row.dataset.addTaskActive = "true";
    const grammarButton = new FakeHTMLElement();
    syncAddTaskGrammarButtonState({ input, row, grammarButton });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);
    assert.strictEqual(grammarButton.style.display, "");
  });

  it("keeps grammar button hidden for inactive rows", () => {
    const input = new FakeHTMLElement();
    input.value = "Fix this sentence";
    input.selectionStart = 0;
    input.selectionEnd = 2;
    const row = new FakeHTMLElement();
    row.dataset.addTaskActive = "false";
    const grammarButton = new FakeHTMLElement();

    syncAddTaskGrammarButtonState({ input, row, grammarButton });
    assert.strictEqual(grammarButton.classList.contains("hidden"), true);
  });

  it("keeps grammar button visible when active row title is empty", () => {
    const input = new FakeHTMLElement();
    input.value = " ";
    input.selectionStart = 0;
    input.selectionEnd = 1;
    const row = new FakeHTMLElement();
    row.dataset.addTaskActive = "true";
    const grammarButton = new FakeHTMLElement();

    syncAddTaskGrammarButtonState({ input, row, grammarButton });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);
  });

  it("keeps grammar button visible when selection metadata is missing", () => {
    const input = new FakeHTMLElement();
    input.value = "Fix this";
    input.selectionStart = undefined;
    input.selectionEnd = undefined;
    const row = new FakeHTMLElement();
    row.dataset.addTaskActive = "true";
    const grammarButton = new FakeHTMLElement();

    syncAddTaskGrammarButtonState({ input, row, grammarButton });
    assert.strictEqual(grammarButton.classList.contains("hidden"), false);
  });

  it("resolves add-task input targets from direct and row-level nodes", () => {
    assert.strictEqual(resolveAddTaskInputFromEventTarget({}), null);

    const input = new FakeHTMLElement();
    input._matches.add("[data-add-task-input]");
    assert.strictEqual(resolveAddTaskInputFromEventTarget(input), input);

    const row = new FakeHTMLElement();
    row._query.set("[data-add-task-input]", input);
    const child = new FakeHTMLElement();
    child._closest = row;
    assert.strictEqual(resolveAddTaskInputFromEventTarget(child), input);

    const unmatched = new FakeHTMLElement();
    unmatched._closest = null;
    assert.strictEqual(resolveAddTaskInputFromEventTarget(unmatched), null);
  });

  it("builds selection context from selected and unselected input text", () => {
    const selectedInput = new FakeHTMLElement();
    selectedInput.value = "Fix grammar quickly";
    selectedInput.selectionStart = 4;
    selectedInput.selectionEnd = 11;
    const selected = resolveAddTaskGrammarSelectionContext(selectedInput);
    assert.strictEqual(selected.hasSelection, true);
    assert.strictEqual(selected.sourceTitle, "grammar");

    const unselectedInput = new FakeHTMLElement();
    unselectedInput.value = "Fix grammar quickly";
    unselectedInput.selectionStart = 3;
    unselectedInput.selectionEnd = 3;
    const unselected = resolveAddTaskGrammarSelectionContext(unselectedInput);
    assert.strictEqual(unselected.hasSelection, false);
    assert.strictEqual(unselected.sourceTitle, "Fix grammar quickly");

    const defaultedInput = new FakeHTMLElement();
    defaultedInput.value = "Fallback";
    defaultedInput.selectionStart = undefined;
    defaultedInput.selectionEnd = undefined;
    const defaulted = resolveAddTaskGrammarSelectionContext(defaultedInput);
    assert.strictEqual(defaulted.selectionStart, 0);
    assert.strictEqual(defaulted.selectionEnd, 0);
  });

  it("applies grammar replacements for selection and full-title contexts", () => {
    const withSelection = new FakeHTMLElement();
    withSelection.value = "fix grammar quickly";
    const withSelectionContext = {
      fullTitle: withSelection.value,
      selectionStart: 0,
      selectionEnd: 11,
      hasSelection: true
    };
    let setRangeCalled = false;
    withSelection.setSelectionRange = (start, end) => {
      setRangeCalled = true;
      withSelection.selectionStart = start;
      withSelection.selectionEnd = end;
    };
    applyAddTaskGrammarReplacement({
      input: withSelection,
      context: withSelectionContext,
      nextTitleSegment: "Fix grammar",
      maxTitleLength: 250
    });
    assert.strictEqual(withSelection.value, "Fix grammar quickly");
    assert.strictEqual(setRangeCalled, true);

    const noSetRange = new FakeHTMLElement();
    noSetRange.value = "fix grammar quickly";
    const noSetRangeContext = {
      fullTitle: noSetRange.value,
      selectionStart: 0,
      selectionEnd: 11,
      hasSelection: true
    };
    noSetRange.setSelectionRange = undefined;
    applyAddTaskGrammarReplacement({
      input: noSetRange,
      context: noSetRangeContext,
      nextTitleSegment: "Fix grammar",
      maxTitleLength: 250
    });
    assert.strictEqual(noSetRange.selectionStart, 11);
    assert.strictEqual(noSetRange.selectionEnd, 11);

    const fullTitle = new FakeHTMLElement();
    fullTitle.value = "fix grammar";
    applyAddTaskGrammarReplacement({
      input: fullTitle,
      context: {
        fullTitle: fullTitle.value,
        selectionStart: 0,
        selectionEnd: 0,
        hasSelection: false
      },
      nextTitleSegment: "Fix grammar.",
      maxTitleLength: 250
    });
    assert.strictEqual(fullTitle.value, "Fix grammar.");

    assert.doesNotThrow(() =>
      applyAddTaskGrammarReplacement({
        input: null,
        context: null,
        nextTitleSegment: "x",
        maxTitleLength: 10
      })
    );
  });
});
