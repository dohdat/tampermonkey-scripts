import assert from "assert";
import { describe, it } from "mocha";
import {
  applyJumpToToday,
  buildReportDelaySuggestions,
  buildSuggestedQuickOptions
} from "../src/ui/date-picker.js";
import { DATE_PICKER_SUGGESTED_COUNT } from "../src/ui/constants.js";

describe("date picker suggested quick picks", () => {
  it("returns empty when task is not repeating", () => {
    const task = { id: "t1", repeat: { type: "none" } };
    const options = buildSuggestedQuickOptions(task, new Date("2026-01-17T12:00:00Z"));
    assert.strictEqual(options.length, 0);
  });

  it("returns weekend occurrences for a weekend-only repeat", () => {
    const task = {
      id: "t2",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 4,
        weeklyDays: [0, 6],
        weeklyMode: "all"
      },
      repeatAnchor: "2026-01-03T00:00:00.000Z"
    };
    const now = new Date("2026-01-17T12:00:00Z");
    const options = buildSuggestedQuickOptions(task, now, DATE_PICKER_SUGGESTED_COUNT);
    assert.ok(options.length > 0);
    options.forEach((option) => {
      const day = option.date.getDay();
      assert.ok(day === 0 || day === 6);
      assert.ok(option.date.getTime() >= now.getTime());
    });
  });

  it("suggests the next available weekend days for report delay", () => {
    const task = {
      id: "t3",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 4,
        weeklyDays: [0, 6],
        weeklyMode: "any"
      },
      repeatAnchor: "2026-01-03T00:00:00.000Z"
    };
    const now = new Date("2026-01-17T12:00:00Z");
    const options = buildReportDelaySuggestions(task, now, DATE_PICKER_SUGGESTED_COUNT);
    const labels = options.map((option) => option.label);
    const hasNextWeekend = options.some((option) =>
      option.date.toISOString().startsWith("2026-01-24")
    );
    assert.ok(labels.length > 0);
    assert.ok(hasNextWeekend);
  });

  it("jumps to today without changing the active input value", () => {
    const state = {
      activeInput: { value: "2026-01-10" },
      selectedDate: new Date(2026, 0, 10),
      viewDate: new Date(2026, 6, 1)
    };
    const now = new Date(2026, 2, 15, 10, 30, 0);
    applyJumpToToday(state, {}, now);

    assert.strictEqual(state.viewDate.getFullYear(), 2026);
    assert.strictEqual(state.viewDate.getMonth(), 2);
    assert.strictEqual(state.viewDate.getDate(), 1);
    assert.strictEqual(state.activeInput.value, "2026-01-10");
    assert.strictEqual(state.selectedDate.getMonth(), 0);
  });
});
