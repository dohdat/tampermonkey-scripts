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
      missedOccurrences: 2,
      expectedCount: 2
    });
    assert.strictEqual(shouldIncrement, false);
  });

  it("does not increment for repeat tasks outside the horizon", () => {
    const task = { id: "repeat-task", completed: false, repeat: { type: "custom" } };
    const parentIds = new Set();
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "unscheduled",
      parentIds,
      missedOccurrences: 0,
      expectedCount: 0
    });
    assert.strictEqual(shouldIncrement, false);
  });

  it("does not increment when deferred", () => {
    const task = { id: "deferred-task", completed: false };
    const parentIds = new Set();
    const deferredIds = new Set(["deferred-task"]);
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "unscheduled",
      parentIds,
      missedOccurrences: 2,
      expectedCount: 2,
      deferredIds
    });
    assert.strictEqual(shouldIncrement, false);
  });

  it("does not increment when startFrom is in the future", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const task = {
      id: "future-task",
      completed: false,
      startFrom: "2026-02-10T10:00:00.000Z"
    };
    const parentIds = new Set();
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "unscheduled",
      parentIds,
      missedOccurrences: 0,
      expectedCount: 0,
      now
    });
    assert.strictEqual(shouldIncrement, false);
  });

  it("does not increment repeating tasks with no due occurrences", () => {
    const task = { id: "repeat-task", completed: false, repeat: { type: "custom" } };
    const parentIds = new Set();
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "unscheduled",
      parentIds,
      missedOccurrences: 0,
      expectedCount: 5,
      dueCount: 0
    });
    assert.strictEqual(shouldIncrement, false);
  });

  it("increments repeating tasks with due occurrences", () => {
    const task = { id: "repeat-task", completed: false, repeat: { type: "custom" } };
    const parentIds = new Set();
    const shouldIncrement = shouldIncrementMissedCount({
      task,
      status: "unscheduled",
      parentIds,
      missedOccurrences: 2,
      expectedCount: 5,
      dueCount: 2
    });
    assert.strictEqual(shouldIncrement, true);
  });
});
