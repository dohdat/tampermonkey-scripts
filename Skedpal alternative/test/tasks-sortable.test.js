import assert from "assert";
import { describe, it } from "mocha";

const { buildInheritedSubtaskUpdate } = await import("../src/ui/utils.js");
const { computeTaskReorderUpdatesForMultiple } = await import("../src/ui/tasks/tasks.js");

describe("task sortable", () => {
  it("inherits parent fields when becoming a subtask", () => {
    const parent = {
      id: "parent-1",
      section: "section-1",
      subsection: "subsection-1",
      timeMapIds: ["tm-1"],
      priority: 4,
      minBlockMin: 45,
      deadline: "2026-01-10T00:00:00.000Z",
      startFrom: "2026-01-06T00:00:00.000Z",
      repeat: { type: "daily", interval: 1 },
      subtaskScheduleMode: "sequential"
    };
    const child = {
      id: "child-1",
      title: "Child",
      timeMapIds: ["tm-2"],
      priority: 1,
      minBlockMin: 15,
      deadline: null,
      startFrom: null,
      subtaskParentId: null,
      scheduleStatus: "scheduled",
      scheduledStart: "2026-01-05T10:00:00.000Z",
      scheduledEnd: "2026-01-05T11:00:00.000Z",
      scheduledTimeMapId: "tm-2",
      scheduledInstances: [{ start: "2026-01-05T10:00:00.000Z" }]
    };

    const updated = buildInheritedSubtaskUpdate(child, parent);

    assert.ok(updated);
    assert.strictEqual(updated.subtaskParentId, "parent-1");
    assert.strictEqual(updated.section, "section-1");
    assert.strictEqual(updated.subsection, "subsection-1");
    assert.deepStrictEqual(updated.timeMapIds, ["tm-1"]);
    assert.strictEqual(updated.priority, 4);
    assert.strictEqual(updated.minBlockMin, 45);
    assert.strictEqual(updated.deadline, "2026-01-10T00:00:00.000Z");
    assert.strictEqual(updated.startFrom, "2026-01-06T00:00:00.000Z");
    assert.deepStrictEqual(updated.repeat, { type: "daily", interval: 1 });
    assert.strictEqual(updated.subtaskScheduleMode, "sequential");
    assert.strictEqual(updated.scheduleStatus, "unscheduled");
    assert.strictEqual(updated.scheduledStart, null);
    assert.strictEqual(updated.scheduledEnd, null);
    assert.strictEqual(updated.scheduledTimeMapId, null);
    assert.deepStrictEqual(updated.scheduledInstances, []);
  });

  it("reorders multiple tasks as a block", () => {
    const tasks = [
      { id: "t1", section: "s1", subsection: "", order: 1, subtaskParentId: null },
      { id: "t2", section: "s1", subsection: "", order: 2, subtaskParentId: null },
      { id: "t3", section: "s1", subsection: "", order: 3, subtaskParentId: null },
      { id: "t4", section: "s1", subsection: "", order: 4, subtaskParentId: null }
    ];
    const result = computeTaskReorderUpdatesForMultiple(tasks, ["t2", "t3"], "s1", "", null);
    const byId = new Map(result.updates.map((task) => [task.id, task]));
    assert.strictEqual(byId.get("t4")?.order, 2);
    assert.strictEqual(byId.get("t2")?.order, 3);
    assert.strictEqual(byId.get("t3")?.order, 4);
  });

  it("ignores descendant ids when computing multi reorder", () => {
    const tasks = [
      { id: "t1", section: "s1", subsection: "", order: 1, subtaskParentId: null },
      { id: "t1-1", section: "s1", subsection: "", order: 1.01, subtaskParentId: "t1" },
      { id: "t2", section: "s1", subsection: "", order: 2, subtaskParentId: null }
    ];
    const resultRootOnly = computeTaskReorderUpdatesForMultiple(
      tasks,
      ["t1"],
      "s1",
      "",
      null
    );
    const resultWithDescendant = computeTaskReorderUpdatesForMultiple(
      tasks,
      ["t1", "t1-1"],
      "s1",
      "",
      null
    );
    const rootOrders = new Map(resultRootOnly.updates.map((task) => [task.id, task.order]));
    const descendantOrders = new Map(
      resultWithDescendant.updates.map((task) => [task.id, task.order])
    );
    assert.deepStrictEqual(descendantOrders, rootOrders);
  });

  it("returns no updates for empty multi reorder input", () => {
    const tasks = [{ id: "t1", section: "s1", subsection: "", order: 1, subtaskParentId: null }];
    const result = computeTaskReorderUpdatesForMultiple(tasks, [], "s1", "", null);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.updates.length, 0);
  });

  it("returns no updates when moving tasks across mixed sections", () => {
    const tasks = [
      { id: "t1", section: "s1", subsection: "", order: 1, subtaskParentId: null },
      { id: "t2", section: "s2", subsection: "", order: 1, subtaskParentId: null }
    ];
    const result = computeTaskReorderUpdatesForMultiple(tasks, ["t1", "t2"], "s1", "", null);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.updates.length, 0);
  });
});
