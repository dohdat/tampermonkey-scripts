import assert from "assert";
import { describe, it } from "mocha";

import {
  buildCompletedOccurrenceStore,
  isOccurrenceCompleted
} from "../src/core/scheduler/completion-utils.js";

describe("completion utils", () => {
  it("treats weekly any completions within the selected week window as completed", () => {
    const repeat = {
      type: "custom",
      unit: "week",
      weeklyMode: "any",
      weeklyDays: [0, 1, 2, 3, 4, 5, 6]
    };
    const occurrenceDate = new Date(2026, 1, 12);
    const store = buildCompletedOccurrenceStore(["2026-02-11"]);
    assert.strictEqual(isOccurrenceCompleted(store, occurrenceDate, repeat), true);
  });

  it("does not complete weekly any occurrences from a different week", () => {
    const repeat = {
      type: "custom",
      unit: "week",
      weeklyMode: "any",
      weeklyDays: [0, 1, 2, 3, 4, 5, 6]
    };
    const occurrenceDate = new Date(2026, 1, 12);
    const store = buildCompletedOccurrenceStore(["2026-02-01"]);
    assert.strictEqual(isOccurrenceCompleted(store, occurrenceDate, repeat), false);
  });

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
