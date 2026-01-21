import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import {
  cleanupTaskModalSections,
  initTaskModalSections,
  resetTaskModalSections
} from "../src/ui/task-modal-sections.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this._classSet = new Set();
    this._handlers = {};
    this.parentElement = null;
    this.setAttribute("data-test-skedpal", `test-${this.tagName.toLowerCase()}`);
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this._handlers[type] === handler) {
      delete this._handlers[type];
    }
  }

  matches(selector) {
    if (!selector) {return false;}
    if (selector.startsWith(".")) {
      return this._classSet.has(selector.slice(1));
    }
    if (selector.startsWith("[data-")) {
      const match = selector.match(/\[data-([a-z-]+)="([^"]+)"\]/);
      if (!match) {return false;}
      const key = match[1]
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === match[2];
    }
    if (selector === "form") {
      return this.tagName === "FORM";
    }
    if (selector.includes(",")) {
      return selector
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .includes(this.tagName);
    }
    return this.tagName === selector.toUpperCase();
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) {return node;}
      node = node.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node.matches(selector)) {
        matches.push(node);
      }
      node.children.forEach((child) => visit(child));
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function buildSection(id, { collapsed = false, defaultSection = false } = {}) {
  const section = new FakeElement("section");
  section.setAttribute("data-collapsible", "true");
  section.dataset.collapsed = collapsed ? "true" : "false";
  if (defaultSection) {
    section.setAttribute("data-test-skedpal", "task-modal-section-time");
  }
  const header = new FakeElement("div");
  header.classList.add("task-modal__section-header");
  const toggle = new FakeElement("button");
  toggle.classList.add("task-modal__section-toggle");
  const content = new FakeElement("div");
  content.classList.add("task-modal__section-content");
  header.appendChild(toggle);
  section.appendChild(header);
  section.appendChild(content);
  section.id = id;
  return { section, header, toggle, content };
}

describe("task modal sections", () => {
  let form = null;
  let sectionA = null;
  let sectionB = null;
  const originalWindow = global.window;
  const originalDocument = global.document;

  beforeEach(() => {
    const builtA = buildSection("section-a", { collapsed: true, defaultSection: true });
    const builtB = buildSection("section-b", { collapsed: false });
    sectionA = builtA;
    sectionB = builtB;
    form = new FakeElement("form");
    form.appendChild(builtA.section);
    form.appendChild(builtB.section);

    global.document = {
      getElementById: (id) => (id === "task-form" ? form : null)
    };
    global.window = {
      _handlers: {},
      addEventListener: (type, handler) => {
        global.window._handlers[type] = handler;
      },
      removeEventListener: (type, handler) => {
        if (global.window._handlers[type] === handler) {
          delete global.window._handlers[type];
        }
      }
    };
    cleanupTaskModalSections();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it("resets modal sections to only keep the default expanded", () => {
    resetTaskModalSections();
    assert.strictEqual(sectionA.section.dataset.collapsed, "false");
    assert.strictEqual(sectionB.section.dataset.collapsed, "true");
  });

  it("toggles section collapse and collapses siblings", () => {
    const cleanup = initTaskModalSections();

    sectionA.toggle._handlers.click({ currentTarget: sectionA.toggle });

    assert.strictEqual(sectionA.section.dataset.collapsed, "false");
    assert.strictEqual(sectionB.section.dataset.collapsed, "true");
    assert.strictEqual(sectionA.content.attributes["aria-hidden"], "false");

    cleanup();
    assert.strictEqual(sectionA.toggle._handlers.click, undefined);
  });

  it("ignores header clicks that originate from buttons", () => {
    initTaskModalSections();
    const previous = sectionB.section.dataset.collapsed;

    sectionB.header._handlers.click({
      currentTarget: sectionB.header,
      target: sectionB.toggle
    });

    assert.strictEqual(sectionB.section.dataset.collapsed, previous);
  });

  it("toggles sections when header clicks are not interactive", () => {
    initTaskModalSections();
    const previous = sectionB.section.dataset.collapsed;

    sectionB.header._handlers.click({
      currentTarget: sectionB.header,
      target: sectionB.header
    });

    assert.notStrictEqual(sectionB.section.dataset.collapsed, previous);
  });

  it("ignores header clicks that target other inputs", () => {
    initTaskModalSections();
    const input = new FakeElement("input");
    sectionB.header.appendChild(input);
    const previous = sectionB.section.dataset.collapsed;

    sectionB.header._handlers.click({
      currentTarget: sectionB.header,
      target: input
    });

    assert.strictEqual(sectionB.section.dataset.collapsed, previous);
  });

  it("cleans up when the pagehide event fires", () => {
    initTaskModalSections();

    global.window._handlers.pagehide();

    assert.strictEqual(global.window._handlers.pagehide, undefined);
    assert.strictEqual(sectionA.toggle._handlers.click, undefined);
  });

  it("returns a no-op cleanup when the form is missing", () => {
    global.document.getElementById = () => null;
    const cleanup = initTaskModalSections();
    assert.strictEqual(typeof cleanup, "function");
    assert.doesNotThrow(() => cleanup());
  });
});
