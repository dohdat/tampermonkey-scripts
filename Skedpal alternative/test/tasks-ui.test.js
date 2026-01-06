import "fake-indexeddb/auto.js";
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

const {
  computeTaskReorderUpdates,
  ensureTaskIds,
  migrateSectionsAndTasks
} = await import("../src/ui/tasks/tasks.js");

describe("tasks ui helpers", () => {
  beforeEach(() => {
    global.crypto.randomUUID = (() => {
      let counter = 0;
      return () => {
        counter += 1;
        return `uuid-${counter}`;
      };
    })();
  });

  it("reorders tasks across sections with subtasks", () => {
    const tasks = [
      { id: "p1", title: "Parent", section: "s1", subsection: "", order: 1 },
      { id: "c1", title: "Child", section: "s1", subsection: "", order: 1.01, subtaskParentId: "p1" },
      { id: "t2", title: "Other", section: "s1", subsection: "", order: 2 },
      { id: "t3", title: "Dest", section: "s2", subsection: "", order: 1 }
    ];

    const result = computeTaskReorderUpdates(tasks, "p1", "s2", "", "t3");
    assert.strictEqual(result.changed, true);
    const byId = new Map(result.updates.map((t) => [t.id, t]));
    assert.strictEqual(byId.get("t2").order, 1);
    assert.strictEqual(byId.get("p1").section, "s2");
    assert.strictEqual(byId.get("p1").order, 1);
    assert.strictEqual(byId.get("c1").order, 2);
    assert.strictEqual(byId.get("t3").order, 3);
  });

  it("ignores invalid moved task ids", () => {
    const tasks = [{ id: "t1", section: "s1", subsection: "", order: 1 }];
    const result = computeTaskReorderUpdates(tasks, "missing", "s1", "", null);
    assert.deepStrictEqual(result, { updates: [], changed: false });
  });

  it("assigns ids and default fields when missing", async () => {
    const tasks = [
      { title: "Untitled", section: "s1", subsection: "" },
      { id: "keep", title: "Has id", section: "s1", subsection: "", order: "2" }
    ];
    const normalized = await ensureTaskIds(tasks);
    assert.strictEqual(normalized[0].id, "uuid-1");
    assert.strictEqual(normalized[0].minBlockMin, 30);
    assert.strictEqual(normalized[0].subtaskParentId, null);
    assert.strictEqual(normalized[0].startFrom, null);
    assert.strictEqual(normalized[0].completed, false);
    assert.strictEqual(normalized[0].completedAt, null);
    assert.deepStrictEqual(normalized[0].repeat, { type: "none" });
    assert.strictEqual(normalized[0].scheduleStatus, "unscheduled");
    assert.strictEqual(normalized[0].order, 1);
    assert.strictEqual(normalized[1].order, 2);
  });

  it("migrates section and subsection names to ids", async () => {
    const tasks = [{ id: "t1", title: "Task", section: "Focus", subsection: "Deep" }];
    const settings = {
      sections: ["Focus"],
      subsections: { Focus: ["Deep"] }
    };
    const result = await migrateSectionsAndTasks(tasks, settings);
    const sectionId = result.settings.sections[0].id;
    const subsectionId = result.settings.subsections[sectionId][0].id;
    assert.strictEqual(result.tasks[0].section, sectionId);
    assert.strictEqual(result.tasks[0].subsection, subsectionId);
  });

  it("adds missing sections when task references unknown section", async () => {
    const tasks = [{ id: "t2", title: "Task", section: "NewSec", subsection: "" }];
    const settings = { sections: [], subsections: {} };
    const result = await migrateSectionsAndTasks(tasks, settings);
    const names = result.settings.sections.map((s) => s.name);
    assert.ok(names.includes("NewSec"));
  });
});
