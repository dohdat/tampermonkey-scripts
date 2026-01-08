import assert from "assert";
import { describe, it } from "mocha";

import { getCalendarRange, getCalendarTitle } from "../src/ui/calendar-utils.js";

describe("calendar helpers", () => {
  it("builds a Sunday-starting week range", () => {
    const anchor = new Date(2026, 0, 7, 10, 0, 0);
    const range = getCalendarRange(anchor, "week");
    assert.strictEqual(range.days, 7);
    assert.strictEqual(range.start.getDay(), 0);
  });

  it("builds a single day range", () => {
    const anchor = new Date(2026, 0, 7, 10, 0, 0);
    const range = getCalendarRange(anchor, "day");
    assert.strictEqual(range.days, 1);
    assert.strictEqual(range.start.getDate(), 7);
  });

  it("builds a three day range", () => {
    const anchor = new Date(2026, 0, 7, 10, 0, 0);
    const range = getCalendarRange(anchor, "three");
    assert.strictEqual(range.days, 3);
    assert.strictEqual(range.start.getDate(), 7);
    assert.strictEqual(range.end.getDate(), 10);
  });

  it("formats calendar titles for day and week", () => {
    const anchor = new Date(2026, 0, 7, 10, 0, 0);
    const dayTitle = getCalendarTitle(anchor, "day");
    const weekTitle = getCalendarTitle(anchor, "week");
    assert.ok(dayTitle.includes("2026"));
    assert.ok(weekTitle.includes("2026"));
  });

  it("formats calendar titles for three day range", () => {
    const anchor = new Date(2026, 0, 7, 10, 0, 0);
    const threeTitle = getCalendarTitle(anchor, "three");
    assert.ok(threeTitle.includes("2026"));
    assert.ok(threeTitle.includes("Jan"));
  });
});
