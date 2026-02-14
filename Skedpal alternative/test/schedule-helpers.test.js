import assert from "assert";
import { describe, it } from "mocha";
import {
  getDueOccurrenceCount,
  getExpectedOccurrenceCount
} from "../src/background/schedule-helpers.js";

describe("schedule helpers", () => {
  it("does not count due occurrences before the end of the day", () => {
    const now = new Date(2026, 1, 12, 12, 0, 0);
    const task = {
      id: "t1",
      repeat: { type: "custom", unit: "day", interval: 1 },
      repeatAnchor: new Date(2026, 1, 12, 0, 0, 0)
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 0);
  });

  it("counts due occurrences after the day passes", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "t1",
      repeat: { type: "custom", unit: "day", interval: 1 },
      repeatAnchor: new Date(2026, 1, 12, 0, 0, 0)
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 1);
  });

  it("skips completed occurrences", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "t1",
      repeat: { type: "custom", unit: "day", interval: 1 },
      repeatAnchor: new Date(2026, 1, 12, 0, 0, 0),
      completedOccurrences: ["2026-02-12"]
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 0);
  });

  it("limits due occurrences to runs since last schedule", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "t1",
      repeat: { type: "custom", unit: "day", interval: 1 },
      repeatAnchor: new Date(2026, 1, 10, 0, 0, 0),
      lastScheduledRun: "2026-02-12T09:00:00.000Z"
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 1);
  });

  it("treats a weekly any completion on another selected day as already completed for that week", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "weekly-any-window",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 1,
        weeklyMode: "any",
        weeklyDays: [0, 1, 2, 3, 4, 5, 6]
      },
      repeatAnchor: new Date(2026, 1, 9, 0, 0, 0),
      completedOccurrences: ["2026-02-11"]
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 0);
  });

  it("returns zero expected occurrences for non-repeat tasks", () => {
    const count = getExpectedOccurrenceCount({ id: "t1", repeat: { type: "none" } }, new Date(), 14);
    assert.strictEqual(count, 0);
  });

  it("uses default horizon when provided horizon is invalid", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "weekly-default-horizon",
      repeat: { type: "custom", unit: "week", interval: 1, weeklyDays: [5] },
      repeatAnchor: new Date(2026, 1, 1, 0, 0, 0)
    };
    const count = getExpectedOccurrenceCount(task, now, Number.NaN);
    assert.ok(count > 0);
  });

  it("does not count weekly-any occurrences before the selected end day", () => {
    const now = new Date(2026, 1, 11, 10, 0, 0);
    const task = {
      id: "weekly-any-friday",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 1,
        weeklyMode: "any",
        weeklyDays: [5]
      },
      repeatAnchor: new Date(2026, 1, 8, 0, 0, 0)
    };

    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 0);
  });

  it("falls back to occurrence day when weeklyDays values are invalid", () => {
    const now = new Date(2026, 1, 13, 10, 0, 0);
    const task = {
      id: "weekly-any-invalid-days",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 1,
        weeklyMode: "any",
        weeklyDays: ["x"]
      },
      repeatAnchor: new Date(2026, 1, 9, 0, 0, 0)
    };

    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 1);
  });

  it("clamps weekly-any due date to repeat end date", () => {
    const now = new Date(2026, 1, 13, 10, 0, 0);
    const task = {
      id: "weekly-any-end-clamp",
      repeat: {
        type: "custom",
        unit: "week",
        interval: 1,
        weeklyMode: "any",
        weeklyDays: [6],
        end: { type: "on", date: "2026-02-12" }
      },
      repeatAnchor: new Date(2026, 1, 9, 0, 0, 0)
    };

    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 0);
  });

  it("falls back to window start when lastScheduledRun is invalid", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const task = {
      id: "invalid-last-run",
      repeat: { type: "custom", unit: "day", interval: 1 },
      repeatAnchor: new Date(2026, 1, 10, 0, 0, 0),
      lastScheduledRun: "not-a-date"
    };
    const count = getDueOccurrenceCount(task, now, 14);
    assert.strictEqual(count, 3);
  });
});
