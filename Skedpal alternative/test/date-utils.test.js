import assert from "assert";
import { describe, it } from "mocha";

import {
  getLocalDateKey,
  nthWeekdayOfMonth,
  normalizeDeadline
} from "../src/core/scheduler/date-utils.js";
import { INDEX_NOT_FOUND } from "../src/constants.js";

describe("date utils", () => {
  it("returns a local date key for valid dates", () => {
    const key = getLocalDateKey(new Date(2026, 0, 5, 10, 0, 0));
    assert.strictEqual(key, "2026-01-05");
  });

  it("returns an empty string for invalid values", () => {
    assert.strictEqual(getLocalDateKey("not-a-date"), "");
  });

  it("returns an empty string for missing values", () => {
    assert.strictEqual(getLocalDateKey(null), "");
  });

  it("returns the last weekday when nth is INDEX_NOT_FOUND", () => {
    const result = nthWeekdayOfMonth(2026, 0, 1, INDEX_NOT_FOUND);
    assert.strictEqual(result.getMonth(), 0);
    assert.strictEqual(result.getDay(), 1);
    const nextWeek = new Date(result);
    nextWeek.setDate(result.getDate() + 7);
    assert.strictEqual(nextWeek.getMonth(), 1);
  });

  it("normalizes invalid deadlines to the fallback end of day", () => {
    const fallback = new Date(2026, 0, 8, 10, 0, 0, 0);
    const normalized = normalizeDeadline("bad-date", fallback);
    assert.strictEqual(normalized.getFullYear(), 2026);
    assert.strictEqual(normalized.getMonth(), 0);
    assert.strictEqual(normalized.getDate(), 8);
    assert.strictEqual(normalized.getHours(), 23);
    assert.strictEqual(normalized.getMinutes(), 59);
  });

  it("normalizes midnight deadlines to end of day", () => {
    const midnight = new Date(2026, 0, 9, 0, 0, 0, 0);
    const normalized = normalizeDeadline(midnight, new Date());
    assert.strictEqual(normalized.getDate(), 9);
    assert.strictEqual(normalized.getHours(), 23);
    assert.strictEqual(normalized.getMinutes(), 59);
  });

  it("preserves non-midnight deadlines", () => {
    const deadline = new Date(2026, 0, 10, 15, 30, 0, 0);
    const normalized = normalizeDeadline(deadline, new Date());
    assert.strictEqual(normalized.getHours(), 15);
    assert.strictEqual(normalized.getMinutes(), 30);
  });
});
