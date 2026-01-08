import assert from "assert";
import { describe, it } from "mocha";
import {
  shouldCountMiss,
  shouldIncrementMissedCount
} from "../src/background/schedule-metrics.js";

describe("background missed metrics", () => {
  it("does not count missed runs for ignored tasks", () => {
    const task = { id: "ignored-task", completed: false };
    const parentIds = new Set();
    assert.strictEqual(shouldCountMiss(task, "ignored", parentIds), false);
  });

  it("counts missed runs for unscheduled tasks", () => {
    const task = { id: "unscheduled-task", completed: false };
    const parentIds = new Set();
    assert.strictEqual(shouldCountMiss(task, "unscheduled", parentIds), true);
  });

  it("does not increment when ignored even with expected misses", () => {
    const task = { id: "ignored-task", completed: false };
    const parentIds = new Set();
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "ignored",
      parentIds,
      missedOccurrences: 2
    });
    assert.strictEqual(shouldIncrement, false);
  });
});
