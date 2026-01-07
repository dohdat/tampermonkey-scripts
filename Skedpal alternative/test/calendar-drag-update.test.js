import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { buildUpdatedTaskForDrag } = await import("../src/ui/calendar.js");

describe("calendar drag updates", () => {
  it("updates the matching instance and recomputes schedule bounds", () => {
    const task = {
      id: "task-1",
      scheduleStatus: "scheduled",
      scheduledInstances: [
        {
          start: "2026-01-06T10:00:00.000Z",
          end: "2026-01-06T11:00:00.000Z",
          timeMapId: "tm-1",
          occurrenceId: "occ-1"
        },
        {
          start: "2026-01-07T09:00:00.000Z",
          end: "2026-01-07T10:00:00.000Z",
          timeMapId: "tm-1",
          occurrenceId: "occ-2"
        }
      ],
      scheduledStart: "2026-01-06T10:00:00.000Z",
      scheduledEnd: "2026-01-07T10:00:00.000Z",
      scheduledTimeMapId: "tm-1"
    };
    const eventMeta = {
      taskId: "task-1",
      occurrenceId: "occ-1",
      instanceIndex: 0,
      start: new Date("2026-01-06T10:00:00.000Z"),
      end: new Date("2026-01-06T11:00:00.000Z")
    };
    const newStart = new Date("2026-01-08T09:30:00.000Z");
    const newEnd = new Date("2026-01-08T10:30:00.000Z");
    const updated = buildUpdatedTaskForDrag(task, eventMeta, newStart, newEnd);
    assert.ok(updated);
    assert.strictEqual(updated.scheduledInstances[0].start, newStart.toISOString());
    assert.strictEqual(updated.scheduledInstances[0].end, newEnd.toISOString());
    assert.strictEqual(updated.scheduledStart, "2026-01-07T09:00:00.000Z");
    assert.strictEqual(updated.scheduledEnd, "2026-01-08T10:30:00.000Z");
    assert.strictEqual(updated.scheduledTimeMapId, "tm-1");
  });

  it("falls back to the instance index when occurrenceId is missing", () => {
    const task = {
      id: "task-2",
      scheduleStatus: "scheduled",
      scheduledInstances: [
        {
          start: "2026-01-09T08:00:00.000Z",
          end: "2026-01-09T09:00:00.000Z",
          timeMapId: "tm-2",
          occurrenceId: null
        },
        {
          start: "2026-01-09T10:00:00.000Z",
          end: "2026-01-09T10:30:00.000Z",
          timeMapId: "tm-2",
          occurrenceId: null
        }
      ],
      scheduledStart: "2026-01-09T08:00:00.000Z",
      scheduledEnd: "2026-01-09T10:30:00.000Z",
      scheduledTimeMapId: "tm-2"
    };
    const eventMeta = {
      taskId: "task-2",
      occurrenceId: "",
      instanceIndex: 1,
      start: new Date("2026-01-09T10:00:00.000Z"),
      end: new Date("2026-01-09T10:30:00.000Z")
    };
    const newStart = new Date("2026-01-09T12:00:00.000Z");
    const newEnd = new Date("2026-01-09T12:30:00.000Z");
    const updated = buildUpdatedTaskForDrag(task, eventMeta, newStart, newEnd);
    assert.ok(updated);
    assert.strictEqual(updated.scheduledInstances[1].start, newStart.toISOString());
    assert.strictEqual(updated.scheduledInstances[1].end, newEnd.toISOString());
  });
});
