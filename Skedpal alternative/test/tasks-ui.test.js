import "fake-indexeddb/auto.js";
import assert from "assert";
import { describe, it, beforeEach } from "mocha";
import { parseLocalDateInput } from "../src/ui/utils.js";

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
  computeSubsectionPrioritySortUpdates,
  ensureTaskIds,
  migrateSectionsAndTasks
} = await import("../src/ui/tasks/tasks.js");

function resetUuidCounter() {
  global.crypto.randomUUID = (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `uuid-${counter}`;
    };
  })();
}

describe("task reorder", () => {
  beforeEach(() => resetUuidCounter());
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

  it("reorders tasks within the same container", () => {
    const tasks = [
      { id: "t1", title: "First", section: "s1", subsection: "", order: 1 },
      { id: "t2", title: "Second", section: "s1", subsection: "", order: 2 },
      { id: "t3", title: "Third", section: "s1", subsection: "", order: 3 }
    ];

    const result = computeTaskReorderUpdates(tasks, "t3", "s1", "", "t1");
    const byId = new Map(result.updates.map((t) => [t.id, t]));
    assert.strictEqual(result.changed, true);
    assert.strictEqual(byId.get("t3").order, 1);
    assert.strictEqual(byId.get("t1").order, 2);
    assert.strictEqual(byId.get("t2").order, 3);
  });

  it("ignores drop targets within moved subtree", () => {
    const tasks = [
      { id: "p1", title: "Parent", section: "s1", subsection: "", order: 1 },
      { id: "c1", title: "Child", section: "s1", subsection: "", order: 1.01, subtaskParentId: "p1" },
      { id: "t2", title: "Other", section: "s2", subsection: "", order: 1 }
    ];

    const result = computeTaskReorderUpdates(tasks, "p1", "s2", "", "c1");
    const byId = new Map(result.updates.map((t) => [t.id, t]));
    assert.strictEqual(byId.get("p1").order, 2);
    assert.strictEqual(byId.get("c1").order, 3);
  });

  it("ignores invalid moved task ids", () => {
    const tasks = [{ id: "t1", section: "s1", subsection: "", order: 1 }];
    const result = computeTaskReorderUpdates(tasks, "missing", "s1", "", null);
    assert.deepStrictEqual(result, { updates: [], changed: false });
  });
});

describe("subsection priority sort", () => {
  it("sorts root tasks by priority without touching subtasks", () => {
    const tasks = [
      { id: "p1", title: "Parent", section: "s1", subsection: "sub1", order: 1, priority: 3 },
      {
        id: "c1",
        title: "Child",
        section: "s1",
        subsection: "sub1",
        order: 1.01,
        subtaskParentId: "p1",
        priority: 1
      },
      { id: "t2", title: "High", section: "s1", subsection: "sub1", order: 2, priority: 1 },
      { id: "t3", title: "Low", section: "s1", subsection: "sub1", order: 3, priority: 5 },
      { id: "t4", title: "Other", section: "s1", subsection: "sub2", order: 1, priority: 1 }
    ];

    const result = computeSubsectionPrioritySortUpdates(tasks, "s1", "sub1");
    const byId = new Map(result.updates.map((task) => [task.id, task]));
    assert.strictEqual(result.changed, true);
    assert.strictEqual(byId.get("t3").order, 1);
    assert.strictEqual(byId.get("p1").order, 2);
    assert.strictEqual(byId.get("t2").order, 3);
    assert.strictEqual(byId.has("c1"), false);
  });

  it("pushes tasks with startFrom not today to the bottom", () => {
    const formatLocalInput = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const todayIso = parseLocalDateInput(formatLocalInput(today));
    const tomorrowIso = parseLocalDateInput(formatLocalInput(tomorrow));
    const tasks = [
      { id: "t1", title: "High", section: "s1", subsection: "sub1", order: 3, priority: 5 },
      {
        id: "t2",
        title: "Future",
        section: "s1",
        subsection: "sub1",
        order: 2,
        priority: 9,
        startFrom: tomorrowIso
      },
      {
        id: "t3",
        title: "Today",
        section: "s1",
        subsection: "sub1",
        order: 1,
        priority: 1,
        startFrom: todayIso
      }
    ];

    const result = computeSubsectionPrioritySortUpdates(tasks, "s1", "sub1");
    const byId = new Map(result.updates.map((task) => [task.id, task]));
    assert.strictEqual(byId.get("t1").order, 1);
    assert.strictEqual(byId.get("t3").order, 2);
    assert.strictEqual(byId.get("t2").order, 3);
  });
});

describe("task defaults", () => {
  beforeEach(() => resetUuidCounter());
  it("assigns ids and default fields when missing", async () => {
    const tasks = [
      { title: "Untitled", section: "s1", subsection: "" },
      { id: "keep", title: "Has id", section: "s1", subsection: "", order: "2" }
    ];
    const normalized = await ensureTaskIds(tasks);
    assert.strictEqual(normalized[0].id, "uuid-1");
    assert.strictEqual(normalized[0].minBlockMin, 15);
    assert.strictEqual(normalized[0].subtaskParentId, null);
    assert.strictEqual(normalized[0].startFrom, null);
    assert.strictEqual(normalized[0].completed, false);
    assert.strictEqual(normalized[0].completedAt, null);
    assert.deepStrictEqual(normalized[0].completedOccurrences, []);
    assert.deepStrictEqual(normalized[0].repeat, { type: "none" });
    assert.strictEqual(normalized[0].scheduleStatus, "unscheduled");
    assert.strictEqual(normalized[0].order, 1);
    assert.strictEqual(normalized[1].order, 2);
  });

  it("assigns order when existing value is not numeric", async () => {
    const tasks = [
      { id: "bad-order", title: "Bad order", section: "s1", subsection: "", order: "abc" }
    ];
    const normalized = await ensureTaskIds(tasks);
    assert.strictEqual(normalized[0].order, 1);
  });
});

describe("task migrations", () => {
  beforeEach(() => resetUuidCounter());
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

  it("keeps existing section and subsection ids", async () => {
    const tasks = [{ id: "t3", title: "Task", section: "s1", subsection: "sub1" }];
    const settings = {
      sections: [{ id: "s1", name: "Focus", favorite: true, favoriteOrder: 2 }],
      subsections: {
        s1: [{ id: "sub1", name: "Deep", favorite: true, favoriteOrder: 1, parentId: "" }]
      }
    };
    const result = await migrateSectionsAndTasks(tasks, settings);
    assert.strictEqual(result.tasks[0].section, "s1");
    assert.strictEqual(result.tasks[0].subsection, "sub1");
    assert.strictEqual(result.settings.sections[0].favoriteOrder, 2);
    assert.strictEqual(result.settings.subsections.s1[0].favoriteOrder, 1);
  });
});
