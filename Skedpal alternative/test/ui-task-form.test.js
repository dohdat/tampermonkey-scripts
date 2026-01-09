import assert from "assert";
import { beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this._innerHTML = "";
    this.style = {};
    this.value = "";
    this.disabled = false;
    this.checked = false;
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classSet.add(n)),
      remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
      contains: (name) => this._classSet.has(name)
    };
  }

  focus() {
    this._focused = true;
  }
}

const elementMap = new Map([
  ["task-form-wrap", new FakeElement("div")],
  ["task-title", new FakeElement("input")]
]);

function resetElements() {
  for (const el of elementMap.values()) {
    el.children = [];
    el.dataset = {};
    el.attributes = {};
    el.className = "";
    el.textContent = "";
    el._innerHTML = "";
    el.style = {};
    el.value = "";
    el.disabled = false;
    el.checked = false;
    el._classSet = new Set();
  }
}

function installDomStubs() {
  global.document = {
    body: new FakeElement("body"),
    querySelectorAll: () => [],
    getElementById: (id) => elementMap.get(id) || null
  };
}

installDomStubs();
const { domRefs } = await import("../src/ui/constants.js");
const { openTaskForm, closeTaskForm } = await import("../src/ui/ui.js");

describe("task form ui", () => {
  beforeEach(() => {
    installDomStubs();
    resetElements();
    domRefs.taskFormWrap = elementMap.get("task-form-wrap");
    domRefs.taskToggle = null;
    global.setTimeout = (handler) => {
      handler();
      return 0;
    };
  });

  it("opens and closes without a task toggle button", () => {
    const wrap = elementMap.get("task-form-wrap");
    wrap.classList.add("hidden");

    assert.doesNotThrow(() => openTaskForm());
    assert.strictEqual(wrap.classList.contains("hidden"), false);
    assert.strictEqual(global.document.body.classList.contains("modal-open"), true);

    assert.doesNotThrow(() => closeTaskForm());
    assert.strictEqual(wrap.classList.contains("hidden"), true);
    assert.strictEqual(global.document.body.classList.contains("modal-open"), false);
  });

  it("updates the task toggle label when present", () => {
    const wrap = elementMap.get("task-form-wrap");
    const toggle = new FakeElement("button");
    toggle.textContent = "Create";
    domRefs.taskToggle = toggle;

    openTaskForm();
    assert.strictEqual(wrap.classList.contains("hidden"), false);
    assert.strictEqual(toggle.textContent, "Add task");
    assert.strictEqual(
      elementMap.get("task-title")._focused,
      true
    );

    closeTaskForm();
    assert.strictEqual(wrap.classList.contains("hidden"), true);
    assert.strictEqual(toggle.textContent, "Add task");
  });
});
