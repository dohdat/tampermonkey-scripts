import assert from "assert";
import { describe, it } from "mocha";

import { domRefs } from "../src/ui/constants.js";
import { getSelectedRootTaskIds, getSelectedTaskCards } from "../src/ui/tasks/task-selection-utils.js";

describe("task selection utils", () => {
  it("returns empty selections when the task list is missing", () => {
    domRefs.taskList = null;
    assert.deepStrictEqual(getSelectedTaskCards(), []);
  });

  it("returns selected task cards from the DOM", () => {
    const cards = [{ id: 1 }, { id: 2 }];
    domRefs.taskList = {
      querySelectorAll: () => cards
    };
    assert.deepStrictEqual(getSelectedTaskCards(), cards);
  });

  it("filters out selected descendants when parents are selected", () => {
    const parentCard = { dataset: { taskId: "p1" } };
    const childCard = { dataset: { taskId: "c1" } };
    domRefs.taskList = {
      querySelectorAll: () => [parentCard, childCard]
    };
    const tasks = [
      { id: "p1" },
      { id: "c1", subtaskParentId: "p1" }
    ];
    const roots = getSelectedRootTaskIds([parentCard, childCard], tasks);
    assert.deepStrictEqual(roots, ["p1"]);
  });
});
