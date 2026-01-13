import assert from "assert";
import { describe, it, beforeEach } from "mocha";

global.crypto = {
  randomUUID: (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `uuid-${counter}`;
    };
  })()
};

const { buildDuplicateTasks } = await import("../src/ui/tasks/task-duplicate.js");
const { getTaskAndDescendants } = await import("../src/ui/utils.js");

function resetUuidCounter() {
  global.crypto.randomUUID = (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `uuid-${counter}`;
    };
  })();
}

describe("task duplication", () => {
  beforeEach(() => resetUuidCounter());

  it("returns empty when no originals are provided", () => {
    assert.deepStrictEqual(buildDuplicateTasks(null, []), []);
    assert.deepStrictEqual(buildDuplicateTasks([], []), []);
  });

  it("skips completed children and reparents to the nearest kept ancestor", () => {
    const tasks = [
      { id: "p1", title: "Parent", section: "s1", subsection: "", order: 1, completed: false },
      {
        id: "c1",
        title: "Completed child",
        section: "s1",
        subsection: "",
        order: 1.01,
        subtaskParentId: "p1",
        completed: true
      },
      {
        id: "gc1",
        title: "Grandchild",
        section: "s1",
        subsection: "",
        order: 1.02,
        subtaskParentId: "c1",
        completed: false
      },
      {
        id: "c2",
        title: "Active child",
        section: "s1",
        subsection: "",
        order: 1.03,
        subtaskParentId: "p1",
        completed: false
      }
    ];
    const originals = getTaskAndDescendants("p1", tasks);
    const duplicates = buildDuplicateTasks(originals, tasks);
    assert.strictEqual(duplicates.length, 3);
    assert.ok(!duplicates.some((task) => task.title === "Completed child"));
    assert.ok(duplicates.every((task) => task.completed === false));
    const dupParent = duplicates.find((task) => task.title === "Parent");
    const dupGrandchild = duplicates.find((task) => task.title === "Grandchild");
    assert.ok(dupParent);
    assert.ok(dupGrandchild);
    assert.strictEqual(dupGrandchild.subtaskParentId, dupParent.id);
  });

  it("keeps the root parent id when duplicating a nested task", () => {
    const tasks = [
      { id: "parent", section: "s1", subsection: "", order: 1, completed: false },
      {
        id: "root",
        title: "Root",
        section: "s1",
        subsection: "",
        order: 2,
        subtaskParentId: "parent",
        completed: false
      }
    ];
    const duplicates = buildDuplicateTasks([tasks[1]], tasks);
    assert.strictEqual(duplicates.length, 1);
    assert.strictEqual(duplicates[0].subtaskParentId, "parent");
  });
});
