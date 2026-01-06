import assert from "assert";
import { describe, it, beforeEach } from "mocha";

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (set.has(name)) set.delete(name);
        else set.add(name);
        return;
      }
      if (force) set.add(name);
      else set.delete(name);
    },
    contains: (name) => set.has(name)
  };
}

function createStubElement() {
  return {
    classList: createClassList(),
    textContent: "",
    disabled: false,
    onclick: null
  };
}

const elements = new Map();
elements.set("notification-banner", createStubElement());
elements.set("notification-message", createStubElement());
elements.set("notification-undo", createStubElement());

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => elements.get(id) || null
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
