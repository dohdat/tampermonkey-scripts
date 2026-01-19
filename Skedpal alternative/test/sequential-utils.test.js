import assert from "assert";
import { describe, it } from "mocha";

import { INDEX_NOT_FOUND } from "../src/constants.js";
import {
  buildSequentialInfoMap,
  buildSequentialPath,
  buildTaskMap,
  compareSequentialIndex,
  getSequentialAncestors,
} from "../src/core/scheduler/sequential-utils.js";

describe("sequential-utils", () => {
  it("compares sequential indices across missing and numeric values", () => {
    assert.strictEqual(compareSequentialIndex(undefined, undefined), 0);
    assert.strictEqual(compareSequentialIndex(undefined, 1), 1);
    assert.strictEqual(compareSequentialIndex(1, undefined), INDEX_NOT_FOUND);
    assert.strictEqual(compareSequentialIndex(1, 2), INDEX_NOT_FOUND);
    assert.strictEqual(compareSequentialIndex(2, 1), 1);
    assert.strictEqual(compareSequentialIndex(2, 2), 0);
  });

  it("builds task maps defensively", () => {
    const map = buildTaskMap([{ id: "task-1" }, { title: "Missing id" }, null]);
    assert.strictEqual(map.size, 1);
    assert.strictEqual(map.get("task-1").id, "task-1");
  });

  it("collects sequential ancestors and stops on missing parents", () => {
    const tasksById = new Map([
      ["parent-1", { id: "parent-1", subtaskParentId: "missing-parent" }],
      ["parent-2", { id: "parent-2", subtaskParentId: "parent-1" }],
      ["child", { id: "child", subtaskParentId: "parent-2" }],
    ]);
    const parentModeById = new Map([
      ["parent-2", "sequential"],
      ["parent-1", "parallel"],
    ]);

    const ancestors = getSequentialAncestors(
      tasksById.get("child"),
      tasksById,
      parentModeById
    );

    assert.deepStrictEqual(ancestors, [{ id: "parent-2", mode: "sequential" }]);
  });

  it("builds sequential paths with missing links and subtask order", () => {
    const tasksById = new Map([
      ["parent", { id: "parent", subtaskParentId: "" }],
      ["child", { id: "child", subtaskParentId: "parent" }],
    ]);
    const subtaskOrderById = new Map([
      ["child", 4],
      ["parent", 2],
    ]);

    assert.deepStrictEqual(
      buildSequentialPath("child", "parent", tasksById, subtaskOrderById),
      [4]
    );
    assert.deepStrictEqual(
      buildSequentialPath("child", "", tasksById, subtaskOrderById),
      []
    );
    assert.deepStrictEqual(
      buildSequentialPath("missing", "parent", tasksById, subtaskOrderById),
      []
    );
  });

  it("builds sequential info maps with flat ordering", () => {
    const tasks = [
      { id: "group", title: "Group", subtaskParentId: "" },
      { id: "a", title: "Bravo", subtaskParentId: "group", order: 2 },
      { id: "b", title: "Alpha", subtaskParentId: "group", order: 2 },
      { id: "c", title: "Charlie", subtaskParentId: "group", order: "" },
      { id: "d", title: "Delta", subtaskParentId: "group", order: "bad" },
      { id: "e", title: "Echo", subtaskParentId: "group", order: 1 },
      { id: "f", title: "Foxtrot", subtaskParentId: "group", order: null },
      { id: "g", title: "Golf", subtaskParentId: "group" },
    ];
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const parentModeById = new Map([["group", "sequential"]]);
    const subtaskOrderById = new Map([
      ["a", 2],
      ["b", 1],
    ]);

    const infoMap = buildSequentialInfoMap(
      tasks,
      tasksById,
      parentModeById,
      subtaskOrderById
    );

    const order = ["e", "b", "a", "c", "d", "f", "g"].map((id) => [
      id,
      infoMap.get(id).flatIndex,
    ]);
    const sortedByIndex = [...order].sort(([, a], [, b]) => a - b).map(([id]) => id);
    assert.deepStrictEqual(sortedByIndex, ["e", "b", "a", "c", "d", "f", "g"]);
  });
});
