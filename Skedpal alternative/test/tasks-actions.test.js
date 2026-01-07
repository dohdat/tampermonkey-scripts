import assert from "assert";
import { describe, it } from "mocha";
import {
  buildSubtaskFormValues,
  validateTaskForm
} from "../src/ui/tasks/task-form-helpers.js";

describe("task form helpers", () => {
  it("does not inherit parent links when adding subtasks", () => {
    const parentTask = {
      id: "p1",
      title: "Parent task",
      link: "https://example.com",
      durationMin: 30,
      minBlockMin: 30,
      priority: 2,
      section: "",
      subsection: "",
      timeMapIds: ["tm-1"]
    };

    const values = buildSubtaskFormValues(parentTask);

    assert.strictEqual(values.link, "");
  });

  it("requires a subsection before saving a task", () => {
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subsection: "",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Select a subsection.");
  });
});
