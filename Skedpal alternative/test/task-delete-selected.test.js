import assert from "assert";
import { describe, it } from "mocha";

import { deleteSelectedTasks } from "../src/ui/tasks/task-delete-selected.js";
import { domRefs } from "../src/ui/constants.js";
import { state } from "../src/ui/state/page-state.js";

class FakeTaskList {
  constructor(cards = []) {
    this.cards = cards;
  }

  querySelectorAll() {
    return this.cards;
  }
}

describe("task delete selected", () => {
  it("returns false when nothing is selected", async () => {
    domRefs.taskList = null;
    const result = await deleteSelectedTasks();
    assert.strictEqual(result, false);
  });

  it("returns false when selected roots are empty", async () => {
    const cardA = { dataset: { taskId: "task-a" } };
    const cardB = { dataset: { taskId: "task-b" } };
    domRefs.taskList = new FakeTaskList([cardA, cardB]);
    state.tasksCache = [
      { id: "task-a", subtaskParentId: "task-b" },
      { id: "task-b", subtaskParentId: "task-a" }
    ];
    const result = await deleteSelectedTasks();
    assert.strictEqual(result, false);
  });

  it("uses the supplied delete handler when provided", async () => {
    const card = { dataset: { taskId: "task-c" } };
    domRefs.taskList = new FakeTaskList([card]);
    state.tasksCache = [{ id: "task-c" }];
    let deletedIds = null;
    const result = await deleteSelectedTasks({
      deleteTasks: async (ids) => {
        deletedIds = ids;
      }
    });
    assert.strictEqual(result, true);
    assert.deepStrictEqual(deletedIds, ["task-c"]);
  });

  it("uses deleteTasksWithUndo fallback when no handler is provided", async () => {
    const card = { dataset: { taskId: "task-d" } };
    domRefs.taskList = new FakeTaskList([card]);
    state.tasksCache = [{ id: "task-d" }];
    let receivedIds = null;

    const result = await deleteSelectedTasks({
      deleteTasksWithUndo: async (ids) => {
        receivedIds = ids;
      }
    });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(receivedIds, ["task-d"]);
  });
});
