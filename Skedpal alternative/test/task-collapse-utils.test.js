import assert from "assert";
import { describe, it } from "mocha";

import {
  computeSingleExpandedCollapsedSet,
  getParentTaskIds
} from "../src/ui/tasks/task-collapse-utils.js";

describe("task collapse utils", () => {
  it("extracts parent task ids from task list", () => {
    const parentIds = getParentTaskIds([
      { id: "a" },
      { id: "b", subtaskParentId: "a" },
      { id: "c", subtaskParentId: "a" },
      { id: "d", subtaskParentId: "b" }
    ]);
    assert.deepStrictEqual([...parentIds].sort(), ["a", "b"]);
  });

  it("returns copy of collapsed set when taskId is empty or not a parent", () => {
    const base = new Set(["x"]);
    const tasks = [{ id: "a" }, { id: "b", subtaskParentId: "a" }];
    const noId = computeSingleExpandedCollapsedSet(base, "", tasks);
    const leaf = computeSingleExpandedCollapsedSet(base, "b", tasks);
    assert.deepStrictEqual([...noId], ["x"]);
    assert.deepStrictEqual([...leaf], ["x"]);
    assert.notStrictEqual(noId, base);
  });

  it("collapses selected parent task when it is not currently collapsed", () => {
    const tasks = [{ id: "a" }, { id: "b", subtaskParentId: "a" }];
    const next = computeSingleExpandedCollapsedSet(new Set(), "a", tasks);
    assert.deepStrictEqual([...next], ["a"]);
  });

  it("expands selected parent and collapses sibling branches", () => {
    const tasks = [
      { id: "a" },
      { id: "a-child", subtaskParentId: "a" },
      { id: "b" },
      { id: "b-child", subtaskParentId: "b" }
    ];
    const current = new Set(["a", "a-child"]);
    const next = computeSingleExpandedCollapsedSet(current, "a", tasks);
    assert.ok(!next.has("a"));
    assert.ok(next.has("a-child"));
    assert.ok(next.has("b"));
  });

  it("expands nested parent and clears ancestor collapsed state", () => {
    const tasks = [
      { id: "root" },
      { id: "parent", subtaskParentId: "root" },
      { id: "child", subtaskParentId: "parent" }
    ];
    const current = new Set(["parent", "root"]);
    const next = computeSingleExpandedCollapsedSet(current, "parent", tasks);
    assert.ok(!next.has("parent"));
    assert.ok(!next.has("root"));
  });
});
