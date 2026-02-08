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

  it("handles empty titles and missing API keys", async () => {
    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=3`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    const click = clickHandlers[0];

    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "   ";
    await click();
    assert.ok(elements.get("task-ai-status").textContent.includes("Add a task title"));

    taskTitleInput.value = "Plan";
    global.window.prompt = () => "   ";
    await click();
    assert.ok(elements.get("task-ai-status").textContent.includes("Groq API key required"));

    cleanup();
  });

  it("renders raw output when Groq returns no JSON", async () => {
    state.settingsCache = { groqApiKey: "raw-key" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Draft";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: ""
            }
          }
        ]
      })
    });

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=4`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();

    const output = elements.get("task-ai-output");
    const raw = output.children.find(
      (child) => child.attributes?.["data-test-skedpal"] === "task-ai-raw"
    );
    assert.ok(raw);
    assert.strictEqual(raw.textContent, "No response");

    cleanup();
  });

  it("handles Groq error responses and invalid removals", async () => {
    state.settingsCache = { groqApiKey: "bad-key" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Fix";
    global.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => {
        throw new Error("no-json");
      }
    });

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=5`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();
    assert.ok(elements.get("task-ai-status").textContent.includes("Groq request failed"));

    state.taskAiList = [{ title: "One", subtasks: [] }];
    const output = elements.get("task-ai-output");
    const outputHandlers = [...(output._handlers.get("click") || [])];
    const outputClick = outputHandlers[0];
    outputClick({ target: {} });
    assert.strictEqual(state.taskAiList.length, 1);

    const badRemove = new FakeElement("button");
    badRemove.dataset.taskAiRemove = "nope";
    outputClick({ target: badRemove });
    assert.strictEqual(state.taskAiList.length, 1);

    const removeButton = new FakeElement("button");
    removeButton.dataset.taskAiRemove = "0";
    outputClick({ target: removeButton });
    assert.strictEqual(state.taskAiList.length, 0);
    assert.ok(elements.get("task-ai-status").textContent.includes("No suggestions left"));

    cleanup();
  });

  it("handles empty prompt entries and Groq error details", async () => {
    state.settingsCache = { groqApiKey: "" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Draft";
    global.window.prompt = () => "";

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=6`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();
    assert.ok(elements.get("task-ai-status").textContent.includes("Groq API key required"));

    global.window.prompt = () => "key";
    global.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "Invalid" } })
    });
    await clickHandlers[0]();
    assert.ok(elements.get("task-ai-status").textContent.includes("Groq request failed"));

    cleanup();
  });

  it("surfaces Groq error details when JSON is returned", async () => {
    state.settingsCache = { groqApiKey: "detail-key" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Detail";
    global.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: "Server",
      json: async () => ({ detail: "Unavailable" })
    });

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=10`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();
    assert.ok(elements.get("task-ai-status").textContent.includes("Groq request failed"));
    cleanup();
  });

  it("normalizes mixed task list payloads", () => {
    const input = "{\"tasks\":[{\"title\":123,\"subtasks\":[\" Keep \",42]},{\"title\":\"Ship\",\"subtasks\":\"nope\"}]}";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [{ title: "Ship", subtasks: [] }]);
  });

  it("returns empty lists when tasks payload is not an array", () => {
    const input = "{\"tasks\":\"nope\"}";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, []);
  });

  it("recovers loose task lists from truncated text", () => {
    const input = "\"title\":\"One\",\"subtasks\":[\"A\",\"B\" \"title\":\"Two\"";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [
      { title: "One", subtasks: ["A", "B"] },
      { title: "Two", subtasks: [] }
    ]);
  });

  it("returns empty lists when loose parsing has no closing title quote", () => {
    const input = "\"title\":\"Broken";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, []);
  });

  it("parses loose tasks with open subtasks blocks", () => {
    const input = "\"title\":\"One\",\"subtasks\":[A,B";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [{ title: "One", subtasks: [] }]);
  });

  it("uses loose parsing status when JSON is truncated", async () => {
    state.settingsCache = { groqApiKey: "loose-key" };
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "Draft";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "\"title\":\"Loose\",\"subtasks\":[\"A\"]"
            }
          }
        ]
      })
    });

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=7`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();
    assert.ok(elements.get("task-ai-status").textContent.includes("truncated"));
    cleanup();
  });

  it("ignores invalid subtask removals", async () => {
    state.taskAiList = [{ title: "One", subtasks: ["Sub"] }];
    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=8`);
    const cleanup = initTaskListAssistant();
    const output = elements.get("task-ai-output");
    const outputHandlers = [...(output._handlers.get("click") || [])];
    const outputClick = outputHandlers[0];

    const invalid = new FakeElement("button");
    invalid.dataset.taskAiSubremove = "bad";
    outputClick({ target: invalid });
    assert.strictEqual(state.taskAiList[0].subtasks.length, 1);

    const invalidParts = new FakeElement("button");
    invalidParts.dataset.taskAiSubremove = "1:two";
    outputClick({ target: invalidParts });
    assert.strictEqual(state.taskAiList[0].subtasks.length, 1);

    cleanup();
  });

  it("ignores subtask removals for missing task entries", async () => {
    state.taskAiList = [];
    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=11`);
    const cleanup = initTaskListAssistant();
    const output = elements.get("task-ai-output");
    const outputHandlers = [...(output._handlers.get("click") || [])];
    const outputClick = outputHandlers[0];

    const missingTaskRemove = new FakeElement("button");
    missingTaskRemove.dataset.taskAiSubremove = "1:0";
    outputClick({ target: missingTaskRemove });
    assert.strictEqual(state.taskAiList.length, 0);

    cleanup();
  });

  it("short-circuits button clicks when outputs are missing", async () => {
    domRefs.taskAiButton = elements.get("task-ai-generate");
    domRefs.taskAiStatus = elements.get("task-ai-status");
    domRefs.taskAiOutput = null;
    domRefs.taskTitleInput = elements.get("task-title");
    const taskTitleInput = elements.get("task-title");
    taskTitleInput.value = "No output";

    const { initTaskListAssistant } = await import(`../src/ui/tasks/task-ai.js?ui=12`);
    const cleanup = initTaskListAssistant();
    const taskAiButton = elements.get("task-ai-generate");
    const clickHandlers = [...(taskAiButton._handlers.get("click") || [])];
    await clickHandlers[0]();
    assert.strictEqual(elements.get("task-ai-status").textContent, "");
    cleanup();
  });

  it("no-ops status and loading updates when elements are missing", async () => {
    domRefs.taskAiButton = null;
    domRefs.taskAiStatus = null;
    domRefs.taskAiOutput = null;
    domRefs.taskTitleInput = null;
    const { resetTaskListAssistant, initTaskListAssistant } =
      await import(`../src/ui/tasks/task-ai.js?ui=13`);
    assert.doesNotThrow(() => resetTaskListAssistant());
    const cleanup = initTaskListAssistant();
    cleanup();
  });

  it("no-ops when task ai elements are missing", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: (id) => (id === "task-ai-generate" ? null : null),
      createElement: (tagName) => new FakeElement(tagName)
    };
    const { initTaskListAssistant, resetTaskListAssistant } =
      await import(`../src/ui/tasks/task-ai.js?ui=9`);
    assert.doesNotThrow(() => resetTaskListAssistant());
    const cleanup = initTaskListAssistant();
    cleanup();
    global.document = originalDocument;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    global.fetch = originalFetch;
    global.HTMLElement = originalHTMLElement;
  });
});
