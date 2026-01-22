import assert from "assert";
import { describe, it } from "mocha";
import { buildSequentialSingleDeferredIds } from "../src/background/deferred-utils.js";

describe("deferred utils", () => {
  it("defers remaining sequential-single siblings when one is scheduled", () => {
    const tasks = [
      { id: "parent", subtaskScheduleMode: "sequential-single" },
      { id: "child-1", subtaskParentId: "parent" },
      { id: "child-2", subtaskParentId: "parent" },
      { id: "child-3", subtaskParentId: "parent" },
      { id: "other-parent", subtaskScheduleMode: "parallel" },
      { id: "other-child", subtaskParentId: "other-parent" }
    ];
    const placements = [{ taskId: "child-2" }];
    const deferred = buildSequentialSingleDeferredIds(tasks, placements);
    assert.ok(deferred.has("child-1"));
    assert.ok(deferred.has("child-3"));
    assert.strictEqual(deferred.has("child-2"), false);
    assert.strictEqual(deferred.has("other-child"), false);
  });

  it("returns empty when no sequential-single child is scheduled", () => {
    const tasks = [
      { id: "parent", subtaskScheduleMode: "sequential-single" },
      { id: "child-1", subtaskParentId: "parent" }
    ];
    const deferred = buildSequentialSingleDeferredIds(tasks, []);
    assert.strictEqual(deferred.size, 0);
  });

  it("ignores parents that are not sequential-single", () => {
    const tasks = [
      { id: "parent", subtaskScheduleMode: "parallel" },
      { id: "child-1", subtaskParentId: "parent" }
    ];
    const placements = [{ taskId: "child-1" }];
    const deferred = buildSequentialSingleDeferredIds(tasks, placements);
    assert.strictEqual(deferred.size, 0);
  });

  it("handles missing inputs without throwing", () => {
    const deferred = buildSequentialSingleDeferredIds();
    assert.strictEqual(deferred.size, 0);
  });

  it("treats null tasks and placements as empty collections", () => {
    const deferred = buildSequentialSingleDeferredIds(null, null);
    assert.strictEqual(deferred.size, 0);
  });

  it("skips tasks without ids and falls back to empty mode", () => {
    const tasks = [
      { id: "parent", subtaskScheduleMode: "sequential-single" },
      { subtaskScheduleMode: "parallel" },
      { id: "child-1", subtaskParentId: "parent" },
      { id: "child-2", subtaskParentId: "parent" },
      { id: "no-mode-parent" }
    ];
    const placements = [{ taskId: "child-1" }];
    const deferred = buildSequentialSingleDeferredIds(tasks, placements);
    assert.deepStrictEqual(Array.from(deferred), ["child-2"]);
    assert.strictEqual(deferred.size, 1);
  });
});
