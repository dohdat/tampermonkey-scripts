import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.selected = false;
    this._listeners = {};
    this._innerHTML = "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this._listeners[type] = handler;
  }

  removeEventListener(type) {
    delete this._listeners[type];
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    querySelectorAll: () => []
  };
  global.window = {
    _listeners: {},
    addEventListener(type, handler) {
      this._listeners[type] = handler;
    },
    removeEventListener(type) {
      delete this._listeners[type];
    }
  };
}

installDomStubs();
const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { initTaskTemplateSelect } = await import("../src/ui/tasks/task-template-select.js");

describe("task template select", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.taskTemplateSelect = new FakeElement("select");
    state.taskTemplatesCache = [{ id: "t1", title: "Template A" }];
    state.taskFormMode = null;
  });

  it("no-ops when the select ref is missing", () => {
    domRefs.taskTemplateSelect = null;
    const cleanup = initTaskTemplateSelect();
    assert.strictEqual(typeof cleanup, "function");
    cleanup();
  });

  it("keeps the placeholder selectable so templates can be cleared", () => {
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;
    const placeholder = select.children[0];

    assert.strictEqual(placeholder.disabled, false);
    assert.strictEqual(select.value, "");

    cleanup();
  });

  it("renders an empty option when no templates exist", () => {
    state.taskTemplatesCache = [];
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    assert.strictEqual(select.children.length, 2);
    assert.strictEqual(select.children[1].textContent, "No templates available");

    cleanup();
  });

  it("sorts template options by order before title", () => {
    state.taskTemplatesCache = [
      { id: "t1", title: "Bravo", order: 2 },
      { id: "t2", title: "Alpha", order: 2 },
      { id: "t3", title: "Charlie" },
      { id: "t4", title: "Delta", order: 1 }
    ];
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    const optionValues = select.children.slice(1).map((opt) => opt.value);
    assert.deepStrictEqual(optionValues, ["t4", "t2", "t1", "t3"]);

    cleanup();
  });

  it("sorts ordered templates ahead of unordered ones", () => {
    state.taskTemplatesCache = [
      { id: "t1", title: "Unordered" },
      { id: "t2", title: "Ordered", order: 1 }
    ];
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    const optionValues = select.children.slice(1).map((opt) => opt.value);
    assert.deepStrictEqual(optionValues, ["t2", "t1"]);

    cleanup();
  });

  it("falls back to default titles and ids when missing", () => {
    state.taskTemplatesCache = [{ title: "" }];
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    const option = select.children[1];
    assert.strictEqual(option.value, "");
    assert.strictEqual(option.textContent, "Untitled template");

    cleanup();
  });

  it("clears selections on change while editing templates", () => {
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    select.value = "t1";
    state.taskFormMode = { type: "template-parent" };
    select._listeners.change();

    assert.strictEqual(select.value, "");

    cleanup();
  });

  it("keeps selection when not editing templates", () => {
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    select.value = "t1";
    state.taskFormMode = null;
    select._listeners.change();

    assert.strictEqual(select.value, "t1");

    cleanup();
  });

  it("rerenders when template cache updates", () => {
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    state.taskTemplatesCache = [{ id: "t2", title: "Next" }];
    global.window._listeners["skedpal:templates-updated"]();

    const optionValues = select.children.slice(1).map((opt) => opt.value);
    assert.deepStrictEqual(optionValues, ["t2"]);

    cleanup();
  });

  it("rerenders when templates are loaded", () => {
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    state.taskTemplatesCache = [{ id: "t3", title: "Loaded" }];
    global.window._listeners["skedpal:templates-loaded"]();

    const optionValues = select.children.slice(1).map((opt) => opt.value);
    assert.deepStrictEqual(optionValues, ["t3"]);

    cleanup();
  });

  it("handles null template caches on updates", () => {
    state.taskTemplatesCache = null;
    const cleanup = initTaskTemplateSelect();
    const select = domRefs.taskTemplateSelect;

    global.window._listeners["skedpal:templates-updated"]();
    global.window._listeners["skedpal:templates-loaded"]();

    assert.strictEqual(select.children.length, 2);
    cleanup();
  });
});
