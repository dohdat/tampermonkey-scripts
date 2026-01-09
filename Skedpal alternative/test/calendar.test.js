import assert from "assert";
import { describe, it } from "mocha";

import {
  addCalendarDays,
  clampMinutes,
  getCalendarRange,
  getCalendarTitle,
  getDateFromDayKey,
  getDayKey,
  getMinutesIntoDay,
  roundMinutesToStep
} from "../src/ui/calendar-utils.js";

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

  it("returns day keys and rejects invalid dates", () => {
    const key = getDayKey(new Date(2026, 0, 7));
    assert.strictEqual(key, "2026-01-07");
    assert.strictEqual(getDayKey("not-a-date"), "");
  });

  it("parses day keys and rejects invalid inputs", () => {
    const date = getDateFromDayKey("2026-01-07");
    assert.strictEqual(date.getFullYear(), 2026);
    assert.strictEqual(date.getMonth(), 0);
    assert.strictEqual(date.getDate(), 7);
    assert.strictEqual(getDateFromDayKey(null), null);
    assert.strictEqual(getDateFromDayKey("2026-00-10"), null);
  });

  it("adds calendar days and computes minutes into day", () => {
    const anchor = new Date(2026, 0, 7, 1, 30, 0);
    const next = addCalendarDays(anchor, 2);
    assert.strictEqual(next.getDate(), 9);
    assert.strictEqual(getMinutesIntoDay(anchor), 90);
  });

  it("rounds minutes with safe steps and clamps minutes", () => {
    assert.strictEqual(roundMinutesToStep(46, 15), 45);
    assert.strictEqual(roundMinutesToStep(46, 0), 45);
    assert.strictEqual(roundMinutesToStep("bad", 15), 0);

    assert.strictEqual(clampMinutes(50, 15, 45), 45);
    assert.strictEqual(clampMinutes("bad", 15, 45), 15);
    assert.strictEqual(clampMinutes(30, null, 45), 30);
    assert.strictEqual(clampMinutes(30, 15, null), 30);
  });
});
