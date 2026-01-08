import assert from "assert";
import { describe, it } from "mocha";

import { getActiveViewId } from "../src/ui/navigation-helpers.js";

function buildView(id, hidden) {
  return {
    id,
    classList: {
      contains: (name) => (name === "hidden" ? hidden : false)
    }
  };
}

describe("navigation helpers", () => {
  it("returns the first visible view id", () => {
    const views = [buildView("tasks", true), buildView("calendar", false)];
    assert.strictEqual(getActiveViewId(views), "calendar");
  });

  it("returns empty string when no visible view exists", () => {
    const views = [buildView("tasks", true), buildView("calendar", true)];
    assert.strictEqual(getActiveViewId(views), "");
  });
});
