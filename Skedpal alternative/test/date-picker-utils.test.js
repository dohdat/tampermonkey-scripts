import assert from "assert";
import { describe, it } from "mocha";

import {
  addMonths,
  buildQuickPickSections,
  getMonthData,
  parseDateInputValue,
  toDateInputValue
} from "../src/ui/date-picker-utils.js";

describe("date picker utils", () => {
  it("formats and parses date input values", () => {
    const date = new Date(2026, 0, 10, 12, 0, 0);
    const value = toDateInputValue(date);
    assert.strictEqual(value, "2026-01-10");

    const parsed = parseDateInputValue(value);
    assert.ok(parsed);
    assert.strictEqual(parsed.getFullYear(), 2026);
    assert.strictEqual(parsed.getMonth(), 0);
    assert.strictEqual(parsed.getDate(), 10);
    assert.strictEqual(parseDateInputValue("invalid"), null);
  });

  it("clamps addMonths to the end of the month", () => {
    const base = new Date(2025, 0, 31);
    const result = addMonths(base, 1);
    assert.strictEqual(toDateInputValue(result), "2025-02-28");
  });

  it("builds quick pick sections anchored to the base date", () => {
    const base = new Date(2026, 0, 10);
    const sections = buildQuickPickSections(base);
    assert.strictEqual(sections.length, 3);
    assert.strictEqual(sections[0].id, "soon");
    assert.strictEqual(sections[0].options[0].label, "Today");
    assert.strictEqual(toDateInputValue(sections[0].options[0].date), "2026-01-10");
  });

  it("returns month metadata for calendar rendering", () => {
    const data = getMonthData(new Date(2026, 1, 1));
    assert.strictEqual(data.year, 2026);
    assert.strictEqual(data.monthIndex, 1);
    assert.strictEqual(data.daysInMonth, 28);
  });
});
