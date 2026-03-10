import assert from "assert";
import { describe, it } from "mocha";

import { isOccurrenceWithinHorizon } from "../src/ui/tasks/occurrence-horizon.js";

describe("occurrence horizon helper", () => {
  it("treats in-horizon dates as within range", () => {
    const task = {
      repeat: { type: "custom", unit: "year", interval: 1 }
    };
    const occurrenceDate = new Date(2026, 2, 15, 23, 59, 59, 999);
    const horizonEnd = new Date(2026, 2, 23, 23, 59, 59, 999);
    assert.strictEqual(isOccurrenceWithinHorizon(task, occurrenceDate, horizonEnd), true);
  });

  it("treats yearly range overlaps as within the horizon", () => {
    const task = {
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2026-03-01",
        yearlyRangeEndDate: "2026-04-15"
      }
    };
    const occurrenceDate = new Date(2026, 3, 15, 23, 59, 59, 999);
    const horizonEnd = new Date(2026, 2, 23, 23, 59, 59, 999);
    assert.strictEqual(isOccurrenceWithinHorizon(task, occurrenceDate, horizonEnd), true);
  });

  it("keeps non-overlapping yearly ranges out of the horizon", () => {
    const task = {
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2026-06-01",
        yearlyRangeEndDate: "2026-06-30"
      }
    };
    const occurrenceDate = new Date(2026, 5, 30, 23, 59, 59, 999);
    const horizonEnd = new Date(2026, 2, 23, 23, 59, 59, 999);
    assert.strictEqual(isOccurrenceWithinHorizon(task, occurrenceDate, horizonEnd), false);
  });

  it("treats monthly range overlaps as within the horizon", () => {
    const task = {
      repeat: {
        type: "custom",
        unit: "month",
        interval: 1,
        monthlyMode: "range",
        monthlyRangeStart: 1,
        monthlyRangeEnd: 30
      }
    };
    const occurrenceDate = new Date(2026, 0, 30, 23, 59, 59, 999);
    const horizonEnd = new Date(2026, 0, 23, 23, 59, 59, 999);
    assert.strictEqual(isOccurrenceWithinHorizon(task, occurrenceDate, horizonEnd), true);
  });
});
