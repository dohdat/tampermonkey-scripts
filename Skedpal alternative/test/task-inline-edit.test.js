import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

describe("inline edit parsing guard", () => {
  const originalDocument = global.document;
  const originalWindow = global.window;

  function findByTestAttr(root, value) {
    if (!root) {return null;}
    if (root.attributes?.["data-test-skedpal"] === value) {return root;}
    for (const child of root.children || []) {
      const found = findByTestAttr(child, value);
      if (found) {return found;}
    }
    return null;
  }

  beforeEach(() => {
    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.style = {};
        this.className = "";
        this._textContent = "";
        this.innerHTML = "";
        this.parentElement = null;
        this.listeners = {};
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

      get textContent() {
        return this._textContent;
      }

      set textContent(value) {
        this._textContent = value;
        this.children = [];
      }

      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name.startsWith("data-")) {
          const key = name
            .slice("data-".length)
            .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
          this.dataset[key] = value;
        }
      }

      addEventListener(type, handler) {
        this.listeners[type] = handler;
      }

      removeEventListener(type, handler) {
        if (this.listeners[type] === handler) {
          delete this.listeners[type];
        }
      }

      dispatchEvent(event) {
        const handler = this.listeners[event.type];
        if (handler) {
          handler(event);
        }
        return true;
      }

      focus() {}

      remove() {
        if (!this.parentElement) {return;}
        this.parentElement.children = (this.parentElement.children || []).filter(
          (child) => child !== this
        );
        this.parentElement = null;
      }

      getBoundingClientRect() {
        return { left: 0, width: 0 };
      }

      setSelectionRange() {}

      closest(selector) {
        let current = this;
        while (current) {
          if (selector.startsWith(".")) {
            const className = selector.slice(1);
            if (current.classList.contains(className)) {return current;}
          } else if (selector.startsWith("[")) {
            const match = selector.match(/\[data-(.+?)=["']?(.+?)["']?\]/);
            if (match) {
              const key = match[1].replace(/-([a-z])/g, (_m, l) => l.toUpperCase());
              if (current.dataset?.[key] === match[2]) {return current;}
            }
            if (selector === "[data-task-id]" && current.dataset?.taskId) {return current;}
          } else if (selector === "a" && current.tagName === "A") {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      }
    }
    global.document = {
      createElement: (tag) => {
        if (tag === "canvas") {
          return {
            getContext: () => ({
              measureText: () => ({ width: 0 })
            })
          };
        }
        return new FakeElement(tag);
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      getComputedStyle: () => ({
        paddingLeft: "0",
        font: "12px sans-serif",
        fontStyle: "normal",
        fontVariant: "normal",
        fontWeight: "400",
        fontSize: "12px",
        fontFamily: "sans-serif"
      })
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  it("skips parsing when parsing is inactive", async () => {
    const { buildTitleUpdateFromInput } = await import(
      "../src/ui/title-date-utils.js"
    );
    const task = {
      title: "Setup weekly",
      deadline: null,
      startFrom: null,
      repeat: { type: "none" }
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "Setup weekly",
      originalTitle: "Setup weekly",
      parsingActive: false,
      literals: [],
      maxLength: 200
    });
    assert.strictEqual(update.shouldSave, false);
    assert.strictEqual(update.nextTitle, "Setup weekly");
    assert.strictEqual(update.nextRepeat, task.repeat);
  });

  it("parses when parsing is active", async () => {
    const { buildTitleUpdateFromInput } = await import(
      "../src/ui/title-date-utils.js"
    );
    const task = {
      title: "Setup weekly",
      deadline: null,
      startFrom: null,
      repeat: { type: "none" }
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "Setup weekly",
      originalTitle: "Setup weekly",
      parsingActive: true,
      literals: [],
      maxLength: 200
    });
    assert.strictEqual(update.shouldSave, true);
    assert.strictEqual(update.nextTitle, "Setup");
  });

  it("allows inline edit for linked task titles", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-link", title: "Linked task", link: "https://example.com" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const anchor = document.createElement("a");
    anchor.href = task.link;
    titleEl.appendChild(anchor);
    row.appendChild(titleEl);
    card.appendChild(row);

    let prevented = false;
    let stopped = false;
    handleTaskTitleDoubleClick({
      target: anchor,
      clientX: 0,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; }
    });

    const input = titleEl.children.find?.(
      (child) => child.attributes?.["data-test-skedpal"] === "task-title-inline-input"
    );
    assert.strictEqual(prevented, true);
    assert.strictEqual(stopped, true);
    assert.ok(input);
  });

  it("restores linked title markup on cancel", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-cancel", title: "Link cancel", link: "https://example.com" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const anchor = document.createElement("a");
    anchor.href = task.link;
    titleEl.appendChild(anchor);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: anchor,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = titleEl.children.find?.(
      (child) => child.attributes?.["data-test-skedpal"] === "task-title-inline-input"
    );
    assert.ok(input);
    input.dispatchEvent({ type: "keydown", key: "Escape", preventDefault: () => {} });
    const restoredAnchor = findByTestAttr(titleEl, "task-title-link");
    assert.ok(restoredAnchor);
  });

  it("starts inline edit for plain titles without preventing default", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-plain", title: "Plain task" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    let prevented = false;
    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.strictEqual(prevented, false);
    assert.ok(input);
  });

  it("restores plain title text on cancel", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-plain-cancel", title: "Plain cancel" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.ok(input);
    input.dispatchEvent({ type: "keydown", key: "Escape", preventDefault: () => {} });
    assert.strictEqual(titleEl.textContent, task.title);
  });

  it("ignores double click outside title", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const orphan = document.createElement("div");
    handleTaskTitleDoubleClick({
      target: orphan,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(orphan.children.length, 0);
  });

  it("ignores double click when task is missing", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    state.tasksCache = [];

    const card = document.createElement("div");
    card.dataset.taskId = "missing-task";
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.strictEqual(input, null);
  });

  it("ignores double click when already editing", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-editing", title: "Already editing" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    titleEl.dataset.inlineEditing = "true";
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.strictEqual(input, null);
  });

  it("ignores double click when task id is missing", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.strictEqual(input, null);
  });

  it("shows conversion preview when title has dates", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-preview", title: "Pay bill tomorrow" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    const preview = findByTestAttr(titleEl, "task-title-inline-conversion-preview");
    assert.ok(input);
    assert.ok(preview);
    input.dispatchEvent({ type: "input" });
    assert.ok(preview.innerHTML.includes("Will convert"));
  });

  it("commits inline edit with Enter when no changes", async () => {
    const { handleTaskTitleDoubleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const { state } = await import("../src/ui/state/page-state.js");
    const task = { id: "t-enter", title: "No change" };
    state.tasksCache = [task];

    const card = document.createElement("div");
    card.dataset.taskId = task.id;
    const row = document.createElement("div");
    row.classList.add("task-title-row");
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const span = document.createElement("span");
    titleEl.appendChild(span);
    row.appendChild(titleEl);
    card.appendChild(row);

    handleTaskTitleDoubleClick({
      target: span,
      clientX: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    const input = findByTestAttr(titleEl, "task-title-inline-input");
    assert.ok(input);
    input.dispatchEvent({ type: "keydown", key: "Enter", preventDefault: () => {} });
    assert.strictEqual(titleEl.textContent, task.title);
  });

  it("prevents link clicks inside titles without modifier keys", async () => {
    const { handleTaskTitleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const anchor = document.createElement("a");
    titleEl.appendChild(anchor);

    let prevented = false;
    let stopped = false;
    const handled = handleTaskTitleClick({
      target: anchor,
      metaKey: false,
      ctrlKey: false,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; }
    });

    assert.strictEqual(handled, true);
    assert.strictEqual(prevented, true);
    assert.strictEqual(stopped, true);
  });

  it("allows link clicks inside titles with modifier keys", async () => {
    const { handleTaskTitleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const titleEl = document.createElement("div");
    titleEl.setAttribute("data-test-skedpal", "task-title");
    const anchor = document.createElement("a");
    titleEl.appendChild(anchor);

    const handled = handleTaskTitleClick({
      target: anchor,
      metaKey: true,
      ctrlKey: false,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    assert.strictEqual(handled, false);
  });

  it("ignores clicks without anchors or outside titles", async () => {
    const { handleTaskTitleClick } = await import(
      "../src/ui/tasks/task-inline-edit.js"
    );
    const span = document.createElement("span");
    const handledNoAnchor = handleTaskTitleClick({
      target: span,
      metaKey: false,
      ctrlKey: false,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(handledNoAnchor, false);

    const anchor = document.createElement("a");
    const handledNoTitle = handleTaskTitleClick({
      target: anchor,
      metaKey: false,
      ctrlKey: false,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(handledNoTitle, false);
  });
});
