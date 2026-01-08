import assert from "assert";
import { describe, it } from "mocha";

const { buildInheritedSubtaskUpdate } = await import("../src/ui/utils.js");

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
      startFrom: "2026-01-06T00:00:00.000Z"
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
    assert.strictEqual(updated.scheduleStatus, "unscheduled");
    assert.strictEqual(updated.scheduledStart, null);
    assert.strictEqual(updated.scheduledEnd, null);
    assert.strictEqual(updated.scheduledTimeMapId, null);
    assert.deepStrictEqual(updated.scheduledInstances, []);
  });
});
