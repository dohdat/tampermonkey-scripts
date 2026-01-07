import assert from "assert";
import { describe, it } from "mocha";

import { toggleClearButtonVisibility } from "../src/ui/utils.js";

function createInput(value = "") {
  return { value };
}

function createButton() {
  const classes = new Set();
  return {
    classList: {
      toggle: (name, force) => {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains: (name) => classes.has(name)
    }
  };
}

describe("toggleClearButtonVisibility", () => {
  it("hides the button when the input is empty", () => {
    const input = createInput("");
    const button = createButton();
    const result = toggleClearButtonVisibility(input, button);
    assert.strictEqual(result, false);
    assert.strictEqual(button.classList.contains("hidden"), true);
  });

  it("shows the button when the input has content", () => {
    const input = createInput("https://example.com");
    const button = createButton();
    const result = toggleClearButtonVisibility(input, button);
    assert.strictEqual(result, true);
    assert.strictEqual(button.classList.contains("hidden"), false);
  });

  it("returns false when elements are missing", () => {
    const result = toggleClearButtonVisibility(null, null);
    assert.strictEqual(result, false);
  });
});
