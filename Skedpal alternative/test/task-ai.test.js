import "fake-indexeddb/auto.js";
import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this._innerHTML = "";
    this.value = "";
    this.disabled = false;
    this.style = {};
    this.parentElement = null;
    this._handlers = new Map();
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML === "") {
      this.children = [];
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
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

  trigger(type, event = {}) {
    const handlers = this._handlers.get(type);
    if (!handlers) {return;}
    handlers.forEach((handler) => handler(event));
  }

  closest(selector) {
    if (selector?.startsWith("[data-") && selector.endsWith("]")) {
      const attr = selector.slice(6, -1);
      const key = attr
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      if (Object.prototype.hasOwnProperty.call(this.dataset, key)) {
        return this;
      }
    }
    return this.parentElement?.closest?.(selector) || null;
  }
}

const elements = new Map();
const getOrCreateElement = (id, tag = "div") => {
  if (!elements.has(id)) {
    const element = new FakeElement(tag);
    element.setAttribute("data-test-skedpal", id);
    elements.set(id, element);
  }
  return elements.get(id);
};

const originalDocument = global.document;
const originalWindow = global.window;
const originalFetch = global.fetch;
const originalHTMLElement = global.HTMLElement;

function installDomStubs() {
  getOrCreateElement("task-ai-generate", "button");
  getOrCreateElement("task-ai-status", "div");
  getOrCreateElement("task-ai-output", "div");
  getOrCreateElement("task-title", "input");

  elements.forEach((element, key) => {
    element.children = [];
    element.dataset = {};
    element.attributes = {};
    element.className = "";
    element.textContent = "";
    element.innerHTML = "";
    element.value = "";
    element.disabled = false;
    element.style = {};
    element._handlers = new Map();
    element._classSet = new Set();
    element.setAttribute("data-test-skedpal", key);
  });

  global.HTMLElement = FakeElement;
  global.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tagName) => new FakeElement(tagName)
  };
  global.window = {
    prompt: () => "",
    setTimeout: (fn) => {
      fn();
      return 1;
    }
  };
}

installDomStubs();

const taskAiModule = await import("../src/ui/tasks/task-ai.js");
const { parseTaskListResponse } = taskAiModule;
const { state } = await import("../src/ui/state/page-state.js");
const { domRefs } = await import("../src/ui/constants.js");

describe("task ai parser", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.taskAiButton = elements.get("task-ai-generate");
    domRefs.taskAiStatus = elements.get("task-ai-status");
    domRefs.taskAiOutput = elements.get("task-ai-output");
    domRefs.taskTitleInput = elements.get("task-title");
    state.taskAiList = [];
    state.settingsCache = { groqApiKey: "" };
    state.pendingSettingsSave = null;
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses fenced JSON task lists", () => {
    const input = [
      "```json",
      "{\"tasks\":[{\"title\":\"Plan\",\"subtasks\":[\"Research\",\"Outline\"]},{\"title\":\"Build\",\"subtasks\":[]}]}",
      "```"
    ].join("\n");
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [
      { title: "Plan", subtasks: ["Research", "Outline"] },
      { title: "Build", subtasks: [] }
    ]);
  });

  it("returns empty list for invalid JSON", () => {
    const result = parseTaskListResponse("Not JSON");
    assert.deepStrictEqual(result, []);
  });

  it("trims empty titles and subtasks", () => {
    const input = "{\"tasks\":[{\"title\":\"  \",\"subtasks\":[\"Keep\"]},{\"title\":\"Ship\",\"subtasks\":[\"  \",\"Test\"]}]}";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [{ title: "Ship", subtasks: ["Test"] }]);
  });

  it("recovers tasks from truncated JSON", () => {
    const input = "{\"tasks\":[{\"title\":\"Collect receipts\",\"subtasks\":[\"Get bill\"]},{\"title\":\"Submit\"";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [
      { title: "Collect receipts", subtasks: ["Get bill"] },
      { title: "Submit", subtasks: [] }
    ]);
  });

  it("builds lists, removes items, and cleans up listeners", async () => {
    state.settingsCache = { groqApiKey: "test-key" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Plan project";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "{\"tasks\":[{\"title\":\"Plan\",\"subtasks\":[\"Research\",\"Outline\"]},{\"title\":\"Build\",\"subtasks\":[]}] }"
            }
          }
        ]
      })
    });

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=1`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    assert.strictEqual(clickHandlers.length, 1);
    await clickHandlers[0]();

    assert.strictEqual(state.taskAiList.length, 2);
    const taskAiOutput = elements.get("task-ai-output");
    const outputHandlers = [...(taskAiOutput._handlers.get("click") || [])];
    assert.strictEqual(outputHandlers.length, 1);
    const outputClick = outputHandlers[0];

    const removeButton = new FakeElement("button");
    removeButton.dataset.taskAiRemove = "1";
    outputClick({ target: removeButton });
    assert.strictEqual(state.taskAiList.length, 1);

    const subremoveButton = new FakeElement("button");
    subremoveButton.dataset.taskAiSubremove = "0:0";
    outputClick({ target: subremoveButton });
    assert.strictEqual(state.taskAiList[0].subtasks.length, 1);

    const subremoveButtonSecond = new FakeElement("button");
    subremoveButtonSecond.dataset.taskAiSubremove = "0:0";
    outputClick({ target: subremoveButtonSecond });
    assert.strictEqual(state.taskAiList[0].subtasks.length, 0);

    cleanup();
  });

  it("prompts for API key, handles empty lists, and resets", async () => {
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Draft";
    global.window.prompt = () => "  new-key  ";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Not JSON"
            }
          }
        ]
      })
    });

    const { initTaskListAssistant, resetTaskListAssistant } =
      await import(`../src/ui/tasks/task-ai.js?ui=2`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();

    assert.strictEqual(state.settingsCache.groqApiKey, "new-key");
    const output = elements.get("task-ai-output");
    assert.strictEqual(output.classList.contains("hidden"), false);

    resetTaskListAssistant();
    assert.strictEqual(state.taskAiList.length, 0);

    cleanup();
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    global.fetch = originalFetch;
    global.HTMLElement = originalHTMLElement;
  });
});
