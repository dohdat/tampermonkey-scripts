import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const {
  buildUpdatedTaskForDrag,
  buildExternalUpdatePayload,
  formatRescheduledMessage
} = await import("../src/ui/calendar.js");

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

  it("builds an external update payload from day and minutes", () => {
    const eventMeta = {
      eventId: "evt-9",
      calendarId: "cal-9"
    };
    const payload = buildExternalUpdatePayload(eventMeta, "2026-01-08", 240, 90);
    assert.ok(payload);
    assert.strictEqual(payload.eventId, "evt-9");
    assert.strictEqual(payload.calendarId, "cal-9");
    assert.strictEqual(payload.start.getFullYear(), 2026);
    assert.strictEqual(payload.start.getMonth(), 0);
    assert.strictEqual(payload.start.getDate(), 8);
    assert.strictEqual(payload.start.getHours(), 4);
    assert.strictEqual(payload.start.getMinutes(), 0);
    assert.strictEqual(payload.end.getHours(), 5);
    assert.strictEqual(payload.end.getMinutes(), 30);
  });

  it("formats reschedule messages defensively", () => {
    const message = formatRescheduledMessage(new Date("2026-01-08T16:00:00"));
    assert.ok(message.startsWith("Event rescheduled to "));
    assert.ok(message.includes(","));
    assert.strictEqual(formatRescheduledMessage(null), "Event rescheduled.");
  });
});
