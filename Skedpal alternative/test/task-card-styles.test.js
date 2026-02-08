import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { applyTaskBackgroundStyle } from "../src/ui/tasks/task-card-styles.js";
import { themeColors } from "../src/ui/theme.js";
import { state } from "../src/ui/state/page-state.js";

class FakeElement {
  constructor() {
    this.style = {};
    this.attributes = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

const originalSettings = state.settingsCache;

describe("task card styles", () => {
  beforeEach(() => {
    state.settingsCache = { ...state.settingsCache };
  });

  afterEach(() => {
    state.settingsCache = originalSettings;
  });

  it("applies timemap background colors when enabled", () => {
    state.settingsCache.taskBackgroundMode = "timemap";
    const card = new FakeElement();
    card.setAttribute("data-test-skedpal", "task-card");
    const task = { timeMapIds: ["tm-1"] };
    const timeMapById = new Map([["tm-1", { color: "#123456" }]]);
    applyTaskBackgroundStyle(card, task, timeMapById);
    assert.strictEqual(card.style.backgroundColor, "#1234561a");
  });

  it("falls back to priority colors for invalid modes", () => {
    state.settingsCache.taskBackgroundMode = "unknown";
    const card = new FakeElement();
    card.setAttribute("data-test-skedpal", "task-card");
    const task = { priority: 2 };
    applyTaskBackgroundStyle(card, task, new Map());
    assert.strictEqual(card.style.backgroundColor, `${themeColors.blue400}1a`);
  });

  it("applies the neutral background when disabled", () => {
    state.settingsCache.taskBackgroundMode = "none";
    const card = new FakeElement();
    card.setAttribute("data-test-skedpal", "task-card");
    const task = { priority: 1 };
    applyTaskBackgroundStyle(card, task, new Map());
    assert.strictEqual(card.style.backgroundColor, `${themeColors.slate400}1a`);
  });

  it("no-ops on missing card or task and handles non-array timemap ids", () => {
    state.settingsCache.taskBackgroundMode = "timemap";
    assert.doesNotThrow(() => applyTaskBackgroundStyle(null, { timeMapIds: [] }, new Map()));
    assert.doesNotThrow(() => applyTaskBackgroundStyle(new FakeElement(), null, new Map()));

    const card = new FakeElement();
    card.setAttribute("data-test-skedpal", "task-card");
    const task = { timeMapIds: "bad" };
    applyTaskBackgroundStyle(card, task, new Map());
    assert.strictEqual(card.style.backgroundColor, undefined);
  });
});
