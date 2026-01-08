import assert from "assert";
import { describe, it } from "mocha";

import {
  applyPrioritySelectColor,
  getInheritedSubtaskFields,
  getLocalDateKey,
  normalizeHorizonDays,
  renderInBatches,
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
      minBlockMin: 45,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z"
    };
    assert.deepStrictEqual(getInheritedSubtaskFields(parent), {
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 4,
      minBlockMin: 45,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z"
    });
  });

  it("returns an empty object for missing parent tasks", () => {
    assert.deepStrictEqual(getInheritedSubtaskFields(null), {});
  });
});

describe("normalizeHorizonDays", () => {
  it("returns the parsed value when inside the range", () => {
    assert.strictEqual(normalizeHorizonDays("21", 1, 60, 14), 21);
  });

  it("clamps values below the minimum", () => {
    assert.strictEqual(normalizeHorizonDays(0, 1, 60, 14), 1);
  });

  it("clamps values above the maximum", () => {
    assert.strictEqual(normalizeHorizonDays(120, 1, 60, 14), 60);
  });

  it("falls back for invalid values", () => {
    assert.strictEqual(normalizeHorizonDays("nope", 1, 60, 14), 14);
  });
});

describe("applyPrioritySelectColor", () => {
  it("sets a data priority based on the select value", () => {
    const select = { value: "4", dataset: {} };
    applyPrioritySelectColor(select);
    assert.strictEqual(select.dataset.priority, "4");
  });

  it("clears the data priority for invalid values", () => {
    const select = { value: "nope", dataset: {} };
    applyPrioritySelectColor(select);
    assert.strictEqual(select.dataset.priority, "");
  });
});

describe("renderInBatches", () => {
  it("renders items in batches and calls onComplete", async () => {
    const items = [1, 2, 3, 4, 5];
    const batches = [];
    await new Promise((resolve) => {
      renderInBatches({
        items,
        batchSize: 2,
        renderBatch: (batch) => batches.push([...batch]),
        onComplete: resolve
      });
    });
    assert.deepStrictEqual(batches, [[1, 2], [3, 4], [5]]);
  });

  it("stops when shouldCancel returns true", (done) => {
    const items = [1, 2, 3];
    let calls = 0;
    let completed = false;
    renderInBatches({
      items,
      batchSize: 2,
      shouldCancel: () => calls > 0,
      renderBatch: () => {
        calls += 1;
      },
      onComplete: () => {
        completed = true;
      }
    });
    setTimeout(() => {
      assert.strictEqual(calls, 1);
      assert.strictEqual(completed, false);
      done();
    }, 20);
  });
});
