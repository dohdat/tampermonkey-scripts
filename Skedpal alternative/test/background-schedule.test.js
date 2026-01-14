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
});
