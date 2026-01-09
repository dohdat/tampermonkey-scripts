import assert from "assert";
import { describe, it } from "mocha";

const {
  buildTasksFromTemplate,
  buildSubtasksFromTemplateForParent
} = await import("../src/ui/tasks/task-templates-helpers.js");

describe("task template helpers", () => {
  it("builds parent and subtask tasks with inherited time maps", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const template = {
      title: "Parent template",
      durationMin: 30,
      minBlockMin: 30,
      priority: 3,
      timeMapIds: ["tm-1"],
      subtasks: [
        {
          title: "Child template",
          durationMin: 15,
          minBlockMin: 15,
          priority: 2,
          timeMapIds: []
        }
      ]
    };

    const tasks = buildTasksFromTemplate(template, "sec-1", "sub-1", [], nextId);
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].id, "t-1");
    assert.strictEqual(tasks[0].section, "sec-1");
    assert.strictEqual(tasks[0].subsection, "sub-1");
    assert.strictEqual(tasks[1].subtaskParentId, "t-1");
    assert.deepStrictEqual(tasks[1].timeMapIds, ["tm-1"]);
  });

  it("appends orders after existing tasks", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const existing = [{ id: "existing", section: "sec", subsection: "sub", order: 3 }];
    const template = { title: "Parent", durationMin: 30, timeMapIds: ["tm-1"], subtasks: [] };
    const tasks = buildTasksFromTemplate(template, "sec", "sub", existing, nextId);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].order > 3, true);
  });

  it("builds nested subtasks with inherited time maps", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const template = {
      title: "Parent template",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subtasks: [
        {
          id: "sub-1",
          title: "Child template",
          durationMin: 15,
          timeMapIds: []
        },
        {
          id: "sub-2",
          title: "Grandchild template",
          durationMin: 15,
          timeMapIds: [],
          subtaskParentId: "sub-1"
        }
      ]
    };

    const tasks = buildTasksFromTemplate(template, "sec-1", "sub-1", [], nextId);
    assert.strictEqual(tasks.length, 3);
    assert.strictEqual(tasks[0].id, "t-1");
    assert.strictEqual(tasks[1].subtaskParentId, "t-1");
    assert.strictEqual(tasks[2].subtaskParentId, "t-2");
    assert.deepStrictEqual(tasks[1].timeMapIds, ["tm-1"]);
    assert.deepStrictEqual(tasks[2].timeMapIds, ["tm-1"]);
  });

  it("skips the parent task when requested", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const template = {
      title: "Parent template",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subtasks: [
        {
          title: "Child template",
          durationMin: 15,
          timeMapIds: []
        }
      ]
    };

    const tasks = buildTasksFromTemplate(
      template,
      "sec-1",
      "sub-1",
      [],
      nextId,
      { includeParent: false }
    );
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].subtaskParentId, null);
  });

  it("builds subtasks under an existing parent task", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const template = {
      title: "Parent template",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subtasks: [
        {
          id: "sub-1",
          title: "Child template",
          durationMin: 15,
          timeMapIds: []
        }
      ]
    };
    const parentTask = {
      id: "parent-task",
      section: "sec-1",
      subsection: "sub-1",
      timeMapIds: ["tm-1"]
    };
    const tasks = buildSubtasksFromTemplateForParent(template, parentTask, [], nextId);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].subtaskParentId, "parent-task");
    assert.deepStrictEqual(tasks[0].timeMapIds, ["tm-1"]);
  });

  it("inherits modal fields when applying template to a task", () => {
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `t-${counter}`;
    };
    const template = {
      title: "Parent template",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subtasks: [
        {
          id: "sub-1",
          title: "Child template",
          durationMin: 15,
          timeMapIds: ["tm-2"]
        }
      ]
    };
    const parentTask = {
      id: "parent-task",
      section: "sec-2",
      subsection: "sub-2",
      timeMapIds: ["tm-parent"],
      priority: 4,
      minBlockMin: 45,
      deadline: "2026-01-24T00:00:00.000Z",
      startFrom: "2026-01-09T00:00:00.000Z",
      durationMin: 90,
      subtaskScheduleMode: "sequential",
      repeat: { type: "weekly", interval: 1 }
    };
    const tasks = buildSubtasksFromTemplateForParent(template, parentTask, [], nextId);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].section, "sec-2");
    assert.strictEqual(tasks[0].subsection, "sub-2");
    assert.deepStrictEqual(tasks[0].timeMapIds, ["tm-parent"]);
    assert.strictEqual(tasks[0].priority, 4);
    assert.strictEqual(tasks[0].minBlockMin, 45);
    assert.strictEqual(tasks[0].deadline, "2026-01-24T00:00:00.000Z");
    assert.strictEqual(tasks[0].startFrom, "2026-01-09T00:00:00.000Z");
    assert.strictEqual(tasks[0].durationMin, 90);
    assert.strictEqual(tasks[0].subtaskScheduleMode, "sequential");
    assert.deepStrictEqual(tasks[0].repeat, { type: "weekly", interval: 1 });
  });
});
