import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null
};

const {
  buildRepeatEndPart,
  buildRepeatFrequencyPart,
  buildWeeklySummaryPart,
  buildYearlySummaryPart,
  resolveWeeklyDays
} = await import("../src/ui/repeat-summary.js");

describe("repeat summary helpers", () => {
  it("resolves weekly day arrays from multiple fields", () => {
    assert.deepStrictEqual(resolveWeeklyDays({ weeklyDays: [1, 3] }, [2]), [1, 3]);
    assert.deepStrictEqual(resolveWeeklyDays({ byWeekdays: [4, 5] }, [2]), [4, 5]);
    assert.deepStrictEqual(resolveWeeklyDays({}, [2]), [2]);
  });

  it("builds repeat frequency label with singular/plural unit", () => {
    assert.strictEqual(buildRepeatFrequencyPart("week", 1), "Every 1 week");
    assert.strictEqual(buildRepeatFrequencyPart("week", 2), "Every 2 weeks");
  });

  it("builds weekly summary part for all and any modes", () => {
    assert.strictEqual(
      buildWeeklySummaryPart({ weeklyDays: [1, 3], weeklyMode: "all" }, "week", []),
      "on Mon, Wed"
    );
    assert.strictEqual(
      buildWeeklySummaryPart({ weeklyDays: [1, 3], weeklyMode: "any" }, "week", []),
      "on any of Mon, Wed"
    );
    assert.strictEqual(buildWeeklySummaryPart({ weeklyDays: [] }, "week", [9]), "");
    assert.strictEqual(buildWeeklySummaryPart({ weeklyDays: [1] }, "day", []), "");
  });

  it("builds yearly summary for range and fixed day modes", () => {
    const range = buildYearlySummaryPart(
      { yearlyRangeStartDate: "2026-03-01", yearlyRangeEndDate: "2026-03-10" },
      "year"
    );
    assert.ok(range.includes("between"));
    const fixed = buildYearlySummaryPart({ yearlyMonth: 4, yearlyDay: 21 }, "year");
    assert.strictEqual(fixed, "on 4/21");
    assert.strictEqual(buildYearlySummaryPart({}, "month"), "");
  });

  it("builds repeat end labels for on-date and after-count", () => {
    const onDate = buildRepeatEndPart({ type: "on", date: "2026-04-09" });
    assert.ok(onDate.startsWith("until "));
    assert.strictEqual(buildRepeatEndPart({ type: "after", count: 1 }), "for 1 time");
    assert.strictEqual(buildRepeatEndPart({ type: "after", count: 3 }), "for 3 times");
    assert.strictEqual(buildRepeatEndPart({ type: "never" }), "");
  });
});
