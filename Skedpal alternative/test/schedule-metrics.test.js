import assert from "assert";
import { describe, it } from "mocha";

import {
  shouldCountMiss,
  shouldIncrementMissedCount
} from "../src/background/schedule-metrics.js";

describe("schedule metrics", () => {
  it("counts misses only for eligible task statuses", () => {
    const task = { id: "task-1", completed: false };
    assert.strictEqual(shouldCountMiss(null, "unscheduled"), false);
    assert.strictEqual(shouldCountMiss({ ...task, completed: true }, "unscheduled"), false);
    assert.strictEqual(shouldCountMiss(task, "scheduled"), false);
    assert.strictEqual(shouldCountMiss(task, "ignored"), false);
    assert.strictEqual(shouldCountMiss(task, "unscheduled", new Set(["task-1"])), false);
    assert.strictEqual(shouldCountMiss(task, "unscheduled", new Set()), true);
  });

  it("increments missed count when existing missed occurrences are already present", () => {
    const increment = shouldIncrementMissedCount({
      task: { id: "task-1" },
      status: "unscheduled",
      parentIds: new Set(),
      missedOccurrences: 2
    });
    assert.strictEqual(increment, true);
  });

  it("skips missed increments for future startFrom tasks, deferred ids, and ignored status", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    assert.strictEqual(
      shouldIncrementMissedCount({
        task: { id: "task-1", startFrom: "2026-01-11T00:00:00.000Z" },
        status: "unscheduled",
        parentIds: new Set(),
        missedOccurrences: 0,
        now
      }),
      false
    );
    assert.strictEqual(
      shouldIncrementMissedCount({
        task: { id: "task-2" },
        status: "unscheduled",
        parentIds: new Set(),
        deferredIds: new Set(["task-2"]),
        missedOccurrences: 0
      }),
      false
    );
    assert.strictEqual(
      shouldIncrementMissedCount({
        task: { id: "task-3" },
        status: "ignored",
        parentIds: new Set(),
        missedOccurrences: 0
      }),
      false
    );
  });

  it("skips repeat misses when expected or due counts indicate nothing due", () => {
    const repeatingTask = { id: "task-1", repeat: { type: "custom" } };
    assert.strictEqual(
      shouldIncrementMissedCount({
        task: repeatingTask,
        status: "unscheduled",
        parentIds: new Set(),
        expectedCount: 0,
        missedOccurrences: 0
      }),
      false
    );
    assert.strictEqual(
      shouldIncrementMissedCount({
        task: repeatingTask,
        status: "unscheduled",
        parentIds: new Set(),
        expectedCount: 2,
        dueCount: 0,
        missedOccurrences: 0
      }),
      false
    );
  });

  it("increments missed count for eligible non-repeating unscheduled tasks", () => {
    const increment = shouldIncrementMissedCount({
      task: { id: "task-1", completed: false },
      status: "unscheduled",
      parentIds: new Set(),
      missedOccurrences: 0
    });
    assert.strictEqual(increment, true);
  });
});
