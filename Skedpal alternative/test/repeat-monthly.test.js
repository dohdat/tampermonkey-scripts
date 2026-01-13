import assert from "assert";
import { describe, it } from "mocha";

import {
  buildMonthDateValue,
  buildMonthlyRule,
  buildMonthlySummaryPart,
  clampDayValue,
  normalizeMonthlyRange,
  resolveMonthlyMode,
  syncMonthlyModeText,
  syncMonthlyRangeInputs,
  updateMonthlyRangeState
} from "../src/ui/repeat-monthly.js";
import { dayOptions } from "../src/ui/constants.js";

describe("repeat monthly helpers", () => {
  it("clamps day values into a valid range", () => {
    assert.strictEqual(clampDayValue(0), 1);
    assert.strictEqual(clampDayValue(40), 31);
    assert.strictEqual(clampDayValue("7"), 7);
  });

  it("builds date values within the month bounds", () => {
    const baseDate = new Date(2026, 1, 1);
    assert.strictEqual(buildMonthDateValue(baseDate, 31), "2026-02-28");
  });

  it("normalizes monthly ranges and fills missing dates", () => {
    const repeatState = {
      monthlyRangeStart: 3,
      monthlyRangeEnd: 5,
      monthlyRangeStartDate: "",
      monthlyRangeEndDate: ""
    };
    const baseDate = new Date(2026, 0, 10);
    normalizeMonthlyRange(repeatState, baseDate);
    assert.strictEqual(repeatState.monthlyRangeStart, 3);
    assert.strictEqual(repeatState.monthlyRangeEnd, 5);
    assert.strictEqual(repeatState.monthlyRangeStartDate, "2026-01-03");
    assert.strictEqual(repeatState.monthlyRangeEndDate, "2026-01-05");
  });

  it("builds monthly summary parts for each mode", () => {
    const weekdayLabel = dayOptions.find((d) => d.value === 2)?.label || "";
    assert.strictEqual(buildMonthlySummaryPart({ monthlyMode: "day", monthlyDay: 4 }, "month"), "on day 4");
    assert.strictEqual(
      buildMonthlySummaryPart({ monthlyMode: "range", monthlyRangeStart: 2, monthlyRangeEnd: 6 }, "month"),
      "between day 2 and day 6"
    );
    assert.strictEqual(
      buildMonthlySummaryPart({ monthlyMode: "nth", monthlyNth: 2, monthlyWeekday: 2 }, "month"),
      `on the 2nd ${weekdayLabel}`
    );
    assert.strictEqual(buildMonthlySummaryPart({ monthlyMode: "day" }, "week"), "");
  });

  it("syncs monthly mode option labels for range mode", () => {
    const repeatState = {
      monthlyDay: 3,
      monthlyNth: 2,
      monthlyWeekday: 1,
      monthlyRangeStart: 2,
      monthlyRangeEnd: 6
    };
    const dayOpt = { textContent: "" };
    const nthOpt = { textContent: "" };
    const rangeOpt = { textContent: "" };
    const select = {
      querySelector: (selector) => {
        if (selector === 'option[value="day"]') {return dayOpt;}
        if (selector === 'option[value="nth"]') {return nthOpt;}
        if (selector === 'option[value="range"]') {return rangeOpt;}
        return null;
      }
    };
    syncMonthlyModeText(repeatState, select);
    assert.ok(rangeOpt.textContent.includes("Monthly between day 2 and 6"));
  });

  it("syncs monthly range inputs with default values", () => {
    const repeatState = {
      monthlyRangeStart: 4,
      monthlyRangeEnd: 6,
      monthlyRangeStartDate: "",
      monthlyRangeEndDate: ""
    };
    const baseDate = new Date(2026, 0, 10);
    const rangeStartInput = { value: "" };
    const rangeEndInput = { value: "" };
    syncMonthlyRangeInputs(repeatState, baseDate, rangeStartInput, rangeEndInput);
    assert.strictEqual(rangeStartInput.value, "2026-01-04");
    assert.strictEqual(rangeEndInput.value, "2026-01-06");
  });

  it("updates monthly ranges and reflects them in inputs", () => {
    const repeatState = {
      monthlyRangeStart: 1,
      monthlyRangeEnd: 1,
      monthlyRangeStartDate: "",
      monthlyRangeEndDate: ""
    };
    const baseDate = new Date(2026, 0, 10);
    const rangeStartInput = { value: "" };
    const rangeEndInput = { value: "" };
    updateMonthlyRangeState(
      repeatState,
      baseDate,
      12,
      5,
      rangeStartInput,
      rangeEndInput,
      "2026-01-12",
      ""
    );
    assert.strictEqual(repeatState.monthlyRangeStart, 12);
    assert.strictEqual(repeatState.monthlyRangeEnd, 12);
    assert.strictEqual(repeatState.monthlyRangeStartDate, "2026-01-12");
    assert.strictEqual(repeatState.monthlyRangeEndDate, "2026-01-12");
    assert.strictEqual(rangeStartInput.value, "2026-01-12");
    assert.strictEqual(rangeEndInput.value, "2026-01-12");
  });

  it("resolves monthly modes from repeat metadata", () => {
    assert.strictEqual(resolveMonthlyMode({ monthlyMode: "nth" }), "nth");
    assert.strictEqual(resolveMonthlyMode({ monthlyMode: "range", bySetPos: 2 }), "nth");
    assert.strictEqual(resolveMonthlyMode({ monthlyMode: "range", byMonthDay: 4 }), "day");
  });

  it("builds monthly rules for each mode", () => {
    const byDayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const startDate = new Date(2026, 0, 10);
    assert.strictEqual(
      buildMonthlyRule(
        { monthlyMode: "nth", monthlyWeekday: 2, monthlyNth: 3 },
        startDate,
        2,
        byDayCodes
      ),
      "FREQ=MONTHLY;INTERVAL=2;BYDAY=TU;BYSETPOS=3"
    );
    assert.strictEqual(
      buildMonthlyRule({ monthlyMode: "range", monthlyRangeEnd: 12 }, startDate, 1, byDayCodes),
      "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=12"
    );
    assert.strictEqual(
      buildMonthlyRule({ monthlyMode: "day", monthlyDay: 4 }, startDate, 1, byDayCodes),
      "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=4"
    );
  });
});
