import assert from "assert";
import { describe, it } from "mocha";

class FakeElement {
  constructor() {
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this._handlers = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this._handlers[type] === handler) {
      delete this._handlers[type];
    }
  }

  get listeners() {
    return this._handlers;
  }
}

const elements = new Map();

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => elements.get(id) || null
  };
}

describe("settings timemap collapse", () => {
  it("toggles timemap section content", async () => {
    elements.clear();
    elements.set("timemap-section-toggle", new FakeElement());
    elements.set("timemap-section-content", new FakeElement());
    installDomStubs();

    const { domRefs } = await import("../src/ui/constants.js");
    domRefs.timeMapSectionToggleBtn = elements.get("timemap-section-toggle");
    domRefs.timeMapSectionContent = elements.get("timemap-section-content");
    domRefs.timeMapSectionContent.classList.add("hidden");

    const { initTimeMapSectionToggle } = await import("../src/ui/time-map-settings-toggle.js");
    const toggle = elements.get("timemap-section-toggle");
    const content = elements.get("timemap-section-content");

    const cleanup = initTimeMapSectionToggle();
    assert.strictEqual(content.classList.contains("hidden"), true);
    assert.strictEqual(toggle.textContent, "Expand");
    assert.strictEqual(toggle.attributes["aria-expanded"], "false");

    toggle.listeners.click();
    assert.strictEqual(content.classList.contains("hidden"), false);
    assert.strictEqual(toggle.textContent, "Collapse");
    assert.strictEqual(toggle.attributes["aria-expanded"], "true");
    assert.strictEqual(toggle.dataset.collapsed, "false");

    toggle.listeners.click();
    assert.strictEqual(content.classList.contains("hidden"), true);
    assert.strictEqual(toggle.textContent, "Expand");
    assert.strictEqual(toggle.attributes["aria-expanded"], "false");
    assert.strictEqual(toggle.dataset.collapsed, "true");

    cleanup();
    assert.strictEqual(toggle.listeners.click, undefined);
  });
});
