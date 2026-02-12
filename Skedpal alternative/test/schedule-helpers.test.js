import assert from "assert";
import { describe, it } from "mocha";
import { getDueOccurrenceCount } from "../src/background/schedule-helpers.js";

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
});
