import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div", ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.textContent = "";
    this.type = "";
    this.title = "";
    this.loading = "";
    this._listeners = new Map();
    this._parent = null;
    this._id = "";
    if (this.tagName === "IFRAME") {
      this.contentWindow = {};
    }
    this._focused = false;
  }

  set id(value) {
    this._id = String(value || "");
    if (this.ownerDocument) {
      this.ownerDocument._register(this);
    }
  }

  get id() {
    return this._id;
  }

  setAttribute(name, value) {
    const strValue = String(value);
    this.attributes[name] = strValue;
    if (name === "data-test-skedpal") {
      this.dataset.testSkedpal = strValue;
    }
    if (name === "id") {
      this.id = strValue;
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    if (child._parent) {
      child._parent.removeChild(child);
    }
    child._parent = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child._parent = null;
    }
  }

  remove() {
    if (this._parent) {
      this._parent.removeChild(this);
    }
    if (this.ownerDocument) {
      this.ownerDocument._unregister(this);
    }
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  focus() {
    this._focused = true;
  }
}

function installDomStubs() {
  const byId = new Map();
  const documentStub = {
    body: null,
    createElement: (tag) => new FakeElement(tag, documentStub),
    getElementById: (id) => byId.get(id) || null,
    _register: (el) => {
      if (el.id) {
        byId.set(el.id, el);
      }
    },
    _unregister: (el) => {
      if (el.id && byId.get(el.id) === el) {
        byId.delete(el.id);
      }
    },
    _reset: () => {
      byId.clear();
      if (documentStub.body) {
        documentStub.body.children = [];
      }
    }
  };
  documentStub.body = new FakeElement("body", documentStub);

  const windowListeners = new Map();
  const windowStub = {
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, new Set());
      }
      windowListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      windowListeners.get(type)?.delete(handler);
    },
    _listenerCount: (type) => windowListeners.get(type)?.size || 0,
    _dispatch: (type, event) => {
      (windowListeners.get(type) || []).forEach((handler) => handler(event));
    }
  };

  global.document = documentStub;
  global.window = windowStub;

  return { documentStub, windowStub };
}

let openCreateTaskOverlay;
let closeCreateTaskOverlay;

describe("create task overlay", () => {
  let windowStub;
  let documentStub;
  let originalWindow;
  let originalDocument;
  let originalSetTimeout;

  beforeEach(async () => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalSetTimeout = global.setTimeout;
    const env = installDomStubs();
    windowStub = env.windowStub;
    documentStub = env.documentStub;
    if (!openCreateTaskOverlay || !closeCreateTaskOverlay) {
      windowStub.__skedpalCreateTaskOverlayLoaded = false;
      await import("../src/content/create-task-overlay.js");
      openCreateTaskOverlay = windowStub.skedpalCreateTaskOverlayOpen;
      closeCreateTaskOverlay = windowStub.skedpalCreateTaskOverlayClose;
    } else {
      windowStub.skedpalCreateTaskOverlayOpen = openCreateTaskOverlay;
      windowStub.skedpalCreateTaskOverlayClose = closeCreateTaskOverlay;
    }
    closeCreateTaskOverlay();
    documentStub._reset();
  });

  afterEach(() => {
    closeCreateTaskOverlay();
    global.window = originalWindow;
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  });

  it("creates an overlay with an iframe", () => {
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    assert.strictEqual(openCreateTaskOverlay(url), true);

    const overlay = documentStub.getElementById("skedpal-create-task-overlay");
    const iframe = documentStub.getElementById("skedpal-create-task-iframe");

    assert.ok(overlay);
    assert.ok(iframe);
    assert.strictEqual(overlay.getAttribute("data-test-skedpal"), "create-task-overlay");
    assert.strictEqual(iframe.getAttribute("data-test-skedpal"), "create-task-iframe");
    assert.strictEqual(iframe.src, url);
  });

  it("updates the existing overlay instead of duplicating", () => {
    const urlA = "chrome-extension://test/pages/index.html?newTask=1&title=A";
    const urlB = "chrome-extension://test/pages/index.html?newTask=1&title=B";

    openCreateTaskOverlay(urlA);
    const overlay = documentStub.getElementById("skedpal-create-task-overlay");
    openCreateTaskOverlay(urlB);

    const overlayAgain = documentStub.getElementById("skedpal-create-task-overlay");
    const iframe = documentStub.getElementById("skedpal-create-task-iframe");

    assert.strictEqual(overlayAgain, overlay);
    assert.strictEqual(iframe.src, urlB);
    assert.strictEqual(documentStub.body.children.length, 1);
  });

  it("cleans up listeners and DOM on close", () => {
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    openCreateTaskOverlay(url);

    const closeButton = documentStub.getElementById("skedpal-create-task-close");
    const iframe = documentStub.getElementById("skedpal-create-task-iframe");
    const overlay = documentStub.getElementById("skedpal-create-task-overlay");
    assert.strictEqual(windowStub._listenerCount("keydown"), 1);
    assert.strictEqual(windowStub._listenerCount("message"), 1);
    assert.strictEqual(windowStub._listenerCount("focusin"), 1);
    assert.strictEqual(windowStub._listenerCount("focus"), 1);
    assert.strictEqual(overlay._listeners.get("click")?.size || 0, 1);

    assert.strictEqual(closeCreateTaskOverlay(), true);

    assert.strictEqual(documentStub.getElementById("skedpal-create-task-overlay"), null);
    assert.strictEqual(iframe.src, "about:blank");
    assert.strictEqual(windowStub._listenerCount("keydown"), 0);
    assert.strictEqual(windowStub._listenerCount("message"), 0);
    assert.strictEqual(windowStub._listenerCount("focusin"), 0);
    assert.strictEqual(windowStub._listenerCount("focus"), 0);
    assert.strictEqual(overlay._listeners.get("click")?.size || 0, 0);
    assert.strictEqual(closeButton._listeners.get("click")?.size || 0, 0);
  });

  it("closes when the iframe posts a close message", () => {
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    openCreateTaskOverlay(url);

    const iframe = documentStub.getElementById("skedpal-create-task-iframe");
    const source = iframe?.contentWindow || {};

    windowStub._dispatch("message", {
      data: { type: "skedpal:create-task-close" },
      source
    });

    assert.strictEqual(documentStub.getElementById("skedpal-create-task-overlay"), null);
    assert.strictEqual(windowStub._listenerCount("message"), 0);
  });

  it("closes when clicking the overlay backdrop", () => {
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    openCreateTaskOverlay(url);

    const overlay = documentStub.getElementById("skedpal-create-task-overlay");
    const handler = [...(overlay._listeners.get("click") || [])][0];
    handler({ target: overlay });

    assert.strictEqual(documentStub.getElementById("skedpal-create-task-overlay"), null);
  });

  it("stops focus traps from seeing iframe focus", () => {
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    openCreateTaskOverlay(url);

    const iframe = documentStub.getElementById("skedpal-create-task-iframe");
    let stopped = false;
    const event = {
      target: iframe,
      stopImmediatePropagation: () => {
        stopped = true;
      },
      stopPropagation: () => {}
    };

    windowStub._dispatch("focusin", event);
    assert.strictEqual(stopped, true);
  });

  it("restores iframe focus after focus traps run", () => {
    global.setTimeout = (handler) => {
      handler();
      return 0;
    };
    const url = "chrome-extension://test/pages/index.html?newTask=1";
    openCreateTaskOverlay(url);

    const iframe = documentStub.getElementById("skedpal-create-task-iframe");
    const event = {
      target: iframe,
      stopImmediatePropagation: () => {},
      stopPropagation: () => {}
    };

    windowStub._dispatch("focusin", event);
    assert.strictEqual(iframe._focused, true);
  });
});
