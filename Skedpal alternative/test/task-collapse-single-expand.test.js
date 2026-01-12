import assert from "assert";
import { describe, it } from "mocha";
import { computeSingleExpandedCollapsedSet } from "../src/ui/tasks/task-collapse-utils.js";

function toSortedArray(set) {
  return Array.from(set || []).sort();
}

describe("task collapse single-expand behavior", () => {
  const tasks = [
    { id: "parent-a" },
    { id: "child-a", subtaskParentId: "parent-a" },
    { id: "parent-b" },
    { id: "child-b", subtaskParentId: "parent-b" },
    { id: "child-b-1", subtaskParentId: "child-b" }
  ];

  it("expands one parent while collapsing the rest", () => {
    const collapsed = new Set(["parent-a", "parent-b"]);
    const result = computeSingleExpandedCollapsedSet(collapsed, "parent-a", tasks);
    assert.deepStrictEqual(toSortedArray(result), ["child-b", "parent-b"]);
  });

  it("keeps ancestor parents expanded when expanding a nested parent", () => {
    const collapsed = new Set(["parent-b", "child-b"]);
    const result = computeSingleExpandedCollapsedSet(collapsed, "child-b", tasks);
    assert.deepStrictEqual(toSortedArray(result), ["parent-a"]);
  });

  it("collapses a parent when it is currently expanded", () => {
    const collapsed = new Set(["parent-b"]);
    const result = computeSingleExpandedCollapsedSet(collapsed, "parent-a", tasks);
    assert.deepStrictEqual(toSortedArray(result), ["parent-a", "parent-b"]);
  });

  it("ignores non-parent task ids", () => {
    const collapsed = new Set(["parent-b"]);
    const result = computeSingleExpandedCollapsedSet(collapsed, "child-a", tasks);
    assert.deepStrictEqual(toSortedArray(result), ["parent-b"]);
  });
});
