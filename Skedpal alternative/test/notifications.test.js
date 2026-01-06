import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this.onclick = null;
    this._handlers = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classSet.add(n)),
      remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classSet.has(name)) this._classSet.delete(name);
          else this._classSet.add(name);
          return;
        }
        if (force) this._classSet.add(name);
        else this._classSet.delete(name);
      },
      contains: (name) => this._classSet.has(name)
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

const elements = new Map();
elements.set("notification-banner", new FakeElement("div"));
elements.set("notification-message", new FakeElement("div"));
elements.set("notification-undo", new FakeElement("button"));

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, new FakeElement("div"));
      }
      return elements.get(id);
    }
  };
  global.window = {
    setTimeout: (fn) => {
      global.__testTimeout = fn;
      return 1;
    }
  };
  global.clearTimeout = () => {};
}

installDomStubs();

const notifications = await import("../src/ui/notifications.js");
const { isTypingTarget, hideNotificationBanner, showUndoBanner } = notifications;
const { state } = await import("../src/ui/state/page-state.js");

describe("notifications", () => {
  beforeEach(() => {
    installDomStubs();
    elements.get("notification-banner").classList.remove("hidden");
    elements.get("notification-message").textContent = "";
    elements.get("notification-undo").disabled = false;
    state.notificationHideTimeout = null;
    state.notificationUndoHandler = null;
  });

  it("detects typing targets", () => {
    assert.strictEqual(isTypingTarget(null), false);
    assert.strictEqual(isTypingTarget({ tagName: "INPUT" }), true);
    assert.strictEqual(isTypingTarget({ tagName: "TEXTAREA" }), true);
    assert.strictEqual(isTypingTarget({ tagName: "SELECT" }), true);
    assert.strictEqual(isTypingTarget({ tagName: "OPTION" }), true);
    assert.strictEqual(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.strictEqual(isTypingTarget({ tagName: "DIV" }), false);
  });

  it("shows and hides undo banner", async () => {
    let undoCalled = 0;
    showUndoBanner("Saved!", async () => {
      undoCalled += 1;
    });

    const banner = elements.get("notification-banner");
    const message = elements.get("notification-message");
    const undoButton = elements.get("notification-undo");

    assert.strictEqual(message.textContent, "Saved!");
    assert.strictEqual(banner.classList.contains("hidden"), false);
    assert.ok(state.notificationHideTimeout);

    await undoButton.onclick();
    assert.strictEqual(undoCalled, 1);
    assert.strictEqual(state.notificationUndoHandler, null);
    assert.strictEqual(banner.classList.contains("hidden"), true);

    hideNotificationBanner();
    assert.strictEqual(banner.classList.contains("hidden"), true);
  });
});
