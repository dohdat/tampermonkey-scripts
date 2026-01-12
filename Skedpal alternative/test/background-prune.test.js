import assert from "assert";
import { describe, it } from "mocha";
import {
  COMPLETED_TASK_RETENTION_DAYS,
  getPrunableCompletedTaskIds,
  pruneSettingsCollapsedTasks,
  shouldRunDailyPrune
} from "../src/background/prune.js";

describe("background prune helpers", () => {
  const now = new Date("2026-02-15T12:00:00.000Z");

  it("prunes completed tasks older than the retention window", () => {
    const tasks = [
      {
        id: "old-completed",
        completed: true,
        completedAt: "2026-01-01T12:00:00.000Z"
      },
      {
        id: "recent-completed",
        completed: true,
        completedAt: "2026-02-10T12:00:00.000Z"
      },
      {
        id: "active",
        completed: false,
        completedAt: null
      }
    ];

    const result = getPrunableCompletedTaskIds(
      tasks,
      COMPLETED_TASK_RETENTION_DAYS,
      now
    );

    assert.deepStrictEqual(result, ["old-completed"]);
  });

  it("keeps completed tasks without a completion timestamp", () => {
    const tasks = [
      {
        id: "no-completed-at",
        completed: true,
        completedAt: null
      }
    ];

    const result = getPrunableCompletedTaskIds(
      tasks,
      COMPLETED_TASK_RETENTION_DAYS,
      now
    );

    assert.deepStrictEqual(result, []);
  });

  it("protects completed ancestors of active subtasks", () => {
    const tasks = [
      {
        id: "parent",
        completed: true,
        completedAt: "2026-01-01T12:00:00.000Z"
      },
      {
        id: "child",
        completed: false,
        subtaskParentId: "parent"
      }
    ];

    const result = getPrunableCompletedTaskIds(
      tasks,
      COMPLETED_TASK_RETENTION_DAYS,
      now
    );

    assert.deepStrictEqual(result, []);
  });

  it("removes pruned task ids from collapsed settings", () => {
    const settings = {
      collapsedTasks: ["keep", "remove"]
    };
    const next = pruneSettingsCollapsedTasks(settings, new Set(["remove"]));
    assert.deepStrictEqual(next.collapsedTasks, ["keep"]);
  });

  it("allows daily prune when there is no recorded timestamp", () => {
    assert.strictEqual(shouldRunDailyPrune(null, now), true);
  });

  it("skips daily prune within 24 hours of the last run", () => {
    const lastPrunedAt = "2026-02-15T05:00:00.000Z";
    assert.strictEqual(shouldRunDailyPrune(lastPrunedAt, now), false);
  });

  it("runs daily prune after 24 hours have passed", () => {
    const lastPrunedAt = "2026-02-14T11:59:00.000Z";
    assert.strictEqual(shouldRunDailyPrune(lastPrunedAt, now), true);
  });
});
