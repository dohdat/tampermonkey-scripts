import assert from "assert";
import { describe, it } from "mocha";
import { initSidebarToggle } from "../src/ui/sidebar-toggle.js";

class FakeElement {
  constructor() {
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }
}

describe("sidebar toggle", () => {
  it("toggles expanded state and aria labels", () => {
    const appShell = new FakeElement();
    const toggleBtn = new FakeElement();
    const backdrop = new FakeElement();
    const sidebar = new FakeElement();
    const cleanup = initSidebarToggle({
      appShell,
      sidebarToggleBtn: toggleBtn,
      sidebarBackdrop: backdrop,
      sidebar
    });

    assert.strictEqual(toggleBtn.attributes["aria-expanded"], "false");
    assert.strictEqual(toggleBtn.attributes["aria-label"], "Expand sidebar");

    toggleBtn.listeners.click();
    assert.strictEqual(appShell.dataset.sidebarExpanded, "true");
    assert.strictEqual(toggleBtn.attributes["aria-expanded"], "true");
    assert.strictEqual(toggleBtn.attributes["aria-label"], "Collapse sidebar");

    toggleBtn.listeners.click();
    assert.ok(!("sidebarExpanded" in appShell.dataset));

    backdrop.listeners.click();
    assert.ok(!("sidebarExpanded" in appShell.dataset));

    toggleBtn.listeners.click();
    assert.strictEqual(appShell.dataset.sidebarExpanded, "true");
    sidebar.listeners.click();
    assert.ok(!("sidebarExpanded" in appShell.dataset));

    cleanup();
    assert.strictEqual(toggleBtn.listeners.click, undefined);
    assert.strictEqual(backdrop.listeners.click, undefined);
    assert.strictEqual(sidebar.listeners.click, undefined);
  });
});
