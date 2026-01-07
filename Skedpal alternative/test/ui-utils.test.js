import assert from "assert";
import { describe, it } from "mocha";

import {
  getInheritedSubtaskFields,
  getLocalDateKey,
  toggleClearButtonVisibility
} from "../src/ui/utils.js";

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

describe("getLocalDateKey", () => {
  it("returns a yyyy-mm-dd key for valid dates", () => {
    const key = getLocalDateKey(new Date(2026, 0, 6, 15, 30, 0));
    assert.strictEqual(key, "2026-01-06");
  });

  it("returns an empty string for invalid values", () => {
    assert.strictEqual(getLocalDateKey("not-a-date"), "");
  });
});

describe("getInheritedSubtaskFields", () => {
  it("returns shared scheduling fields from a parent task", () => {
    const parent = {
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 4,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z"
    };
    assert.deepStrictEqual(getInheritedSubtaskFields(parent), {
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 4,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z"
    });
  });

  it("returns an empty object for missing parent tasks", () => {
    assert.deepStrictEqual(getInheritedSubtaskFields(null), {});
  });
});
