import assert from "assert";
import { describe, it } from "mocha";
import { getExpectedOccurrenceCount } from "../src/background/schedule-helpers.js";

describe("background scheduling horizon", () => {
  it("coerces string horizon days when computing expected occurrences", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const task = {
      id: "repeat-yearly-range",
      startFrom: "2026-03-01T00:00:00.000Z",
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2026-03-01",
        yearlyRangeEndDate: "2026-04-15"
      }
    };
    const expected = getExpectedOccurrenceCount(task, now, "14");
    assert.strictEqual(expected, 0);
  });

  it("returns zero for non-repeating tasks", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const task = { id: "no-repeat", repeat: { type: "none" } };
    assert.strictEqual(getExpectedOccurrenceCount(task, now, 7), 0);
  });

  it("uses default horizon when the provided value is invalid", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const task = {
      id: "repeat-weekly",
      repeat: { type: "custom", unit: "week", interval: 1, weeklyDays: [1] },
      repeatAnchor: "2025-12-15T00:00:00.000Z"
    };
    const invalid = getExpectedOccurrenceCount(task, now, 0);
    const fallback = getExpectedOccurrenceCount(task, now, undefined);
    assert.strictEqual(invalid, fallback);
  });
});
