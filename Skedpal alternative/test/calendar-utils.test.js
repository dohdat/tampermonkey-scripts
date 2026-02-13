import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null
};

const {
  addCalendarDays,
  clampMinutes,
  getCalendarRange,
  getCalendarTitle,
  getDateFromDayKey,
  getDayKey,
  getMinutesIntoDay,
  roundMinutesToStep
} = await import("../src/ui/calendar-utils.js");

describe("calendar utils", () => {
  it("builds week ranges from Sunday through next Sunday", () => {
    const anchor = new Date("2026-01-07T15:30:00Z");
    const range = getCalendarRange(anchor, "week");
    assert.strictEqual(range.days, 7);
    assert.strictEqual(range.start.getDay(), 0);
    assert.strictEqual(range.end.getTime(), addCalendarDays(range.start, 7).getTime());
  });

  it("builds day and three-day ranges from anchor date", () => {
    const anchor = new Date("2026-01-07T15:30:00");
    const dayRange = getCalendarRange(anchor, "day");
    const threeRange = getCalendarRange(anchor, "three");
    assert.strictEqual(dayRange.days, 1);
    assert.strictEqual(threeRange.days, 3);
    assert.strictEqual(dayRange.start.getHours(), 0);
    assert.strictEqual(threeRange.start.getHours(), 0);
  });

  it("builds titles for day, three-day, and default modes", () => {
    const anchor = new Date("2026-01-07T10:00:00");
    const dayTitle = getCalendarTitle(anchor, "day");
    const threeTitle = getCalendarTitle(anchor, "three");
    const defaultTitle = getCalendarTitle(anchor, "week");
    assert.ok(dayTitle.includes("2026"));
    assert.ok(threeTitle.includes(" - "));
    assert.ok(defaultTitle.includes("2026"));
  });

  it("returns stable day keys and parses day keys safely", () => {
    const date = new Date(2026, 0, 9, 13, 45, 0);
    const key = getDayKey(date);
    assert.strictEqual(key, "2026-01-09");
    const parsed = getDateFromDayKey(key);
    assert.ok(parsed instanceof Date);
    assert.strictEqual(parsed.getHours(), 0);
    assert.strictEqual(getDateFromDayKey("bad"), null);
    assert.strictEqual(getDateFromDayKey(null), null);
  });

  it("computes minutes into day and rounds to configured steps", () => {
    const date = new Date(2026, 0, 1, 2, 35, 0);
    assert.strictEqual(getMinutesIntoDay(date), 155);
    assert.strictEqual(roundMinutesToStep(38, 15), 45);
    assert.strictEqual(roundMinutesToStep(38, 0), 45);
    assert.strictEqual(roundMinutesToStep(Number.NaN, 15), 0);
  });

  it("clamps minutes defensively", () => {
    assert.strictEqual(clampMinutes(50, 10, 40), 40);
    assert.strictEqual(clampMinutes(5, 10, 40), 10);
    assert.strictEqual(clampMinutes(20, 10, 40), 20);
    assert.strictEqual(clampMinutes(Number.NaN, 10, 40), 10);
    assert.strictEqual(clampMinutes(20, Number.NaN, 40), 20);
    assert.strictEqual(clampMinutes(20, 10, Number.NaN), 20);
  });
});
