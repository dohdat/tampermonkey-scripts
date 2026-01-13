import assert from "assert";
import { describe, it } from "mocha";

import {
  normalizeDeadline,
  nthWeekdayOfMonth
} from "../src/core/scheduler/date-utils.js";
import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_SECOND,
  INDEX_NOT_FOUND
} from "../src/constants.js";

describe("date utils", () => {
  it("returns the fallback end-of-day when no deadline is provided", () => {
    const fallback = new Date(2026, 0, 3);
    const result = normalizeDeadline(null, fallback);
    assert.strictEqual(result.getHours(), END_OF_DAY_HOUR);
    assert.strictEqual(result.getMinutes(), END_OF_DAY_MINUTE);
    assert.strictEqual(result.getSeconds(), END_OF_DAY_SECOND);
  });

  it("returns the fallback end-of-day for invalid deadlines", () => {
    const fallback = new Date(2026, 0, 3);
    const result = normalizeDeadline("invalid-date", fallback);
    assert.strictEqual(result.getHours(), END_OF_DAY_HOUR);
    assert.strictEqual(result.getMinutes(), END_OF_DAY_MINUTE);
    assert.strictEqual(result.getSeconds(), END_OF_DAY_SECOND);
  });

  it("normalizes midnight deadlines to end-of-day", () => {
    const value = new Date(2026, 0, 5, 0, 0, 0);
    const fallback = new Date(2026, 0, 1);
    const result = normalizeDeadline(value, fallback);
    assert.strictEqual(result.getHours(), END_OF_DAY_HOUR);
    assert.strictEqual(result.getMinutes(), END_OF_DAY_MINUTE);
  });

  it("returns the exact deadline when time is not midnight", () => {
    const value = new Date(2026, 0, 5, 9, 30, 0);
    const fallback = new Date(2026, 0, 1);
    const result = normalizeDeadline(value, fallback);
    assert.strictEqual(result.getHours(), 9);
    assert.strictEqual(result.getMinutes(), 30);
  });

  it("returns the last matching weekday when nth is INDEX_NOT_FOUND", () => {
    const result = nthWeekdayOfMonth(2026, 0, 1, INDEX_NOT_FOUND);
    assert.strictEqual(result.getMonth(), 0);
    assert.strictEqual(result.getDay(), 1);
    assert.strictEqual(result.getDate(), 26);
  });

  it("returns the nth weekday when requested", () => {
    const result = nthWeekdayOfMonth(2026, 0, 1, 2);
    assert.strictEqual(result.getMonth(), 0);
    assert.strictEqual(result.getDay(), 1);
    assert.strictEqual(result.getDate(), 12);
  });
});
