import assert from "assert";
import { describe, it } from "mocha";

const { getActiveViewId, shouldResetScroll } = await import("../src/ui/navigation-helpers.js");

class FakeElement {
  constructor(id = "", hidden = false) {
    this.id = id;
    this._classSet = new Set(hidden ? ["hidden"] : []);
    this.classList = {
      contains: (name) => this._classSet.has(name)
    };
  }
}

describe("navigation helpers", () => {
  it("detects the active view id", () => {
    const views = [new FakeElement("calendar", true), new FakeElement("tasks", false)];
    assert.strictEqual(getActiveViewId(views), "tasks");
  });

  it("returns empty when no views are active", () => {
    const views = [new FakeElement("calendar", true), new FakeElement("tasks", true)];
    assert.strictEqual(getActiveViewId(views), "");
  });

  it("identifies when scroll should reset", () => {
    assert.strictEqual(shouldResetScroll("calendar", "tasks"), true);
    assert.strictEqual(shouldResetScroll("tasks", "calendar"), false);
  });
});
