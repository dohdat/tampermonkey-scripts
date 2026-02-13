import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null
};

const { getDateParts, syncYearlyRangeInputs } = await import("../src/ui/repeat-yearly.js");

describe("repeat yearly helpers", () => {
  it("extracts month/day from date-like values", () => {
    assert.deepStrictEqual(getDateParts("2026-04-09"), { month: 4, day: 9 });
    assert.deepStrictEqual(getDateParts("2026-04-09T08:00:00.000Z"), { month: 4, day: 9 });
    assert.deepStrictEqual(getDateParts(new Date(2026, 6, 14)), { month: 7, day: 14 });
    assert.strictEqual(getDateParts("bad"), null);
    assert.ok(getDateParts("2026-05"));
    assert.strictEqual(getDateParts(""), null);
  });

  it("syncs yearly range inputs with state values or fallback date", () => {
    const startInput = { value: "" };
    const endInput = { value: "" };
    syncYearlyRangeInputs(
      { yearlyRangeStartDate: "2026-03-01", yearlyRangeEndDate: "2026-03-10" },
      new Date(2026, 2, 5),
      startInput,
      endInput
    );
    assert.strictEqual(startInput.value, "2026-03-01");
    assert.strictEqual(endInput.value, "2026-03-10");
  });

  it("falls back to base date when yearly range values are missing", () => {
    const startInput = { value: "" };
    const endInput = { value: "" };
    syncYearlyRangeInputs({}, new Date(2026, 0, 6), startInput, endInput);
    assert.strictEqual(startInput.value, "2026-01-06");
    assert.strictEqual(endInput.value, "2026-01-06");
  });
});
