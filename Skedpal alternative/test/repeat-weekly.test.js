import assert from "assert";
import { describe, it } from "mocha";

function createFakeButton() {
  const classes = new Set();
  return {
    type: "",
    dataset: {},
    className: "",
    textContent: "",
    classList: {
      add: (...tokens) => tokens.forEach((token) => classes.add(token)),
      contains: (token) => classes.has(token)
    }
  };
}

global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  createElement: () => createFakeButton()
};

const {
  renderRepeatWeekdayOptions,
  resolveWeeklyMode,
  syncWeeklyModeInputs,
  syncWeeklyModeLabels
} = await import("../src/ui/repeat-weekly.js");

describe("repeat weekly helpers", () => {
  it("renders weekday buttons with data-test and selection styles", () => {
    const appended = [];
    const container = {
      innerHTML: "old",
      appendChild: (node) => appended.push(node)
    };
    renderRepeatWeekdayOptions(container, [1, 3]);
    assert.strictEqual(container.innerHTML, "");
    assert.strictEqual(appended.length, 7);
    assert.strictEqual(appended[0].dataset.testSkedpal, "task-repeat-weekday-btn");
    assert.strictEqual(appended[1].dataset.dayValue, "1");
    assert.ok(appended[1].classList.contains("border-lime-400"));
    assert.ok(!appended[2].classList.contains("border-lime-400"));
  });

  it("is a no-op when render container is missing", () => {
    assert.doesNotThrow(() => renderRepeatWeekdayOptions(null, [1]));
  });

  it("resolves weekly mode from state with fallback", () => {
    assert.strictEqual(resolveWeeklyMode({ weeklyMode: "any" }), "any");
    assert.strictEqual(resolveWeeklyMode({}, "all"), "all");
  });

  it("syncs weekly radio inputs from repeat state", () => {
    const anyInput = { checked: false };
    const allInput = { checked: false };
    syncWeeklyModeInputs({ weeklyMode: "any" }, anyInput, allInput);
    assert.strictEqual(anyInput.checked, true);
    assert.strictEqual(allInput.checked, false);
    syncWeeklyModeInputs({ weeklyMode: "all" }, anyInput, allInput);
    assert.strictEqual(anyInput.checked, false);
    assert.strictEqual(allInput.checked, true);
  });

  it("syncs weekly mode labels with static count value", () => {
    const anyCountEl = { textContent: "" };
    const allCountEl = { textContent: "" };
    syncWeeklyModeLabels({ weeklyMode: "any" }, anyCountEl, allCountEl);
    assert.strictEqual(anyCountEl.textContent, "1");
    assert.strictEqual(allCountEl.textContent, "1");
    assert.doesNotThrow(() => syncWeeklyModeLabels({}, null, null));
  });
});
