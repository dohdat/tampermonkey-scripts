import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor() {
    this.dataset = {};
  }
}

class FakeTaskList {
  constructor(cards) {
    this.cards = cards;
  }

  querySelectorAll() {
    return this.cards;
  }
}

global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    sheet: { insertRule: () => {} },
    setAttribute: () => {},
    appendChild: () => {},
    style: {}
  }),
  head: { appendChild: () => {} }
};

const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { deleteSelectedTasks } = await import("../src/ui/tasks/task-delete-selected.js");

describe("task multi-select delete", () => {
  beforeEach(() => {
    state.tasksCache = [];
    domRefs.taskList = null;
  });

  it("returns false when no tasks are selected", async () => {
    const calls = [];
    const handled = await deleteSelectedTasks({
      deleteTasks: async (ids) => calls.push(ids)
    });
    assert.strictEqual(handled, false);
    assert.strictEqual(calls.length, 0);
  });

  it("deletes only root selected tasks", async () => {
    const parent = { id: "p1", title: "Parent" };
    const child = { id: "c1", title: "Child", subtaskParentId: "p1" };
    state.tasksCache = [parent, child];
    const parentCard = new FakeElement();
    parentCard.dataset.taskId = "p1";
    const childCard = new FakeElement();
    childCard.dataset.taskId = "c1";
    domRefs.taskList = new FakeTaskList([parentCard, childCard]);
    const calls = [];
    const handled = await deleteSelectedTasks({
      deleteTasks: async (ids) => calls.push(ids)
    });
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls, [["p1"]]);
  });
});
