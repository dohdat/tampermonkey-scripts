import assert from "assert";
import { describe, it } from "mocha";

const { buildTasksFromAiList } = await import("../src/ui/tasks/task-ai-helpers.js");

describe("task ai helpers", () => {
  it("builds nested tasks under the saved parent", () => {
    const parentTask = {
      id: "parent-1",
      title: "Parent task",
      durationMin: 45,
      minBlockMin: 30,
      priority: 4,
      deadline: "2025-01-01T00:00:00.000Z",
      startFrom: "2024-12-01T00:00:00.000Z",
      timeMapIds: ["tm-1"],
      section: "section-1",
      subsection: "sub-1",
      subtaskScheduleMode: "parallel",
      repeat: { type: "none" },
      order: 10
    };
    const list = [
      { title: "Collect", subtasks: ["A1", "A2"] },
      { title: "Submit", subtasks: [] }
    ];

    const result = buildTasksFromAiList(list, parentTask, []);
    assert.strictEqual(result.length, 4);

    const taskCollect = result.find((task) => task.title === "Collect");
    const taskSubmit = result.find((task) => task.title === "Submit");
    assert.ok(taskCollect);
    assert.ok(taskSubmit);
    assert.strictEqual(taskCollect.subtaskParentId, parentTask.id);
    assert.strictEqual(taskSubmit.subtaskParentId, parentTask.id);

    const subA1 = result.find((task) => task.title === "A1");
    const subA2 = result.find((task) => task.title === "A2");
    assert.ok(subA1);
    assert.ok(subA2);
    assert.strictEqual(subA1.subtaskParentId, taskCollect.id);
    assert.strictEqual(subA2.subtaskParentId, taskCollect.id);

    assert.strictEqual(taskCollect.durationMin, 45);
    assert.strictEqual(taskCollect.section, "section-1");
    assert.strictEqual(taskCollect.subsection, "sub-1");
    assert.deepStrictEqual(taskCollect.timeMapIds, ["tm-1"]);
    assert.ok(taskSubmit.order > taskCollect.order);
    assert.ok(subA1.order > taskCollect.order);
    assert.ok(subA1.order < taskSubmit.order);
  });

  it("returns empty output when no list items exist", () => {
    const parentTask = { id: "parent-2", order: 1 };
    const result = buildTasksFromAiList([], parentTask, []);
    assert.deepStrictEqual(result, []);
  });

  it("skips empty titles and normalizes missing arrays", () => {
    const parentTask = {
      id: "parent-3",
      durationMin: 30,
      minBlockMin: 30,
      priority: 2,
      section: "sec",
      subsection: "sub",
      timeMapIds: "not-array",
      order: 2
    };
    const list = [
      { title: "   ", subtasks: ["  "] },
      { title: "Valid", subtasks: ["  ", "Child", 42] },
      { title: 7, subtasks: ["Skip"] }
    ];

    const result = buildTasksFromAiList(list, parentTask, []);
    assert.strictEqual(result.length, 2);
    const parent = result.find((task) => task.title === "Valid");
    const child = result.find((task) => task.title === "Child");
    assert.ok(parent);
    assert.ok(child);
    assert.deepStrictEqual(parent.timeMapIds, []);
    assert.strictEqual(child.subtaskParentId, parent.id);
  });

  it("returns empty output when parent task is missing", () => {
    const result = buildTasksFromAiList([{ title: "Task" }], null, []);
    assert.deepStrictEqual(result, []);
  });

  it("returns empty output when list is not an array", () => {
    const parentTask = { id: "parent-4", order: 4 };
    const result = buildTasksFromAiList("not-array", parentTask, []);
    assert.deepStrictEqual(result, []);
  });
});
