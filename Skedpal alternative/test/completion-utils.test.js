import assert from "assert";
import { describe, it } from "mocha";

import {
  buildCompletedOccurrenceStore,
  isOccurrenceCompleted
} from "../src/core/scheduler/completion-utils.js";

describe("completion utils", () => {
  it("handles yearly range dates provided as Date objects", () => {
    const repeat = {
      type: "custom",
      unit: "year",
      yearlyRangeStartDate: new Date(2026, 5, 15),
      yearlyRangeEndDate: new Date(2026, 5, 10)
    };
    const occurrenceDate = new Date(2026, 5, 10);
    const store = buildCompletedOccurrenceStore(["2025-12-01"]);
    assert.strictEqual(isOccurrenceCompleted(store, occurrenceDate, repeat), true);
  });

  it("returns false when yearly range dates are invalid", () => {
    const repeat = {
      type: "custom",
      unit: "year",
      yearlyRangeStartDate: "bad-date",
      yearlyRangeEndDate: "2026-02-10"
    };
    const occurrenceDate = new Date(2026, 1, 10);
    const store = buildCompletedOccurrenceStore(["2026-02-05"]);
    assert.strictEqual(isOccurrenceCompleted(store, occurrenceDate, repeat), false);
  });

  it("returns false when yearly range dates are blank strings", () => {
    const repeat = {
      type: "custom",
      unit: "year",
      yearlyRangeStartDate: "",
      yearlyRangeEndDate: ""
    };
    const occurrenceDate = new Date(2026, 1, 10);
    const store = buildCompletedOccurrenceStore(["2026-02-05"]);
    assert.strictEqual(isOccurrenceCompleted(store, occurrenceDate, repeat), false);
  });
});
