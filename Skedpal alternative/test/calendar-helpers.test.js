import assert from "assert";
import { describe, it } from "mocha";

import {
  buildEventMetaFromDataset,
  buildScheduleBounds,
  buildScheduledEvent,
  endOfDay,
  isCompletedOccurrence,
  parseEventMetaDates,
  parseInstanceDates,
  resolveInstanceIndex
} from "../src/ui/calendar-helpers.js";

describe("calendar helper branches", () => {
  it("parses instance dates defensively", () => {
    assert.strictEqual(parseInstanceDates(null), null);
    assert.strictEqual(parseInstanceDates({ start: "", end: "2026-01-07T10:00:00Z" }), null);
    const parsed = parseInstanceDates({
      start: "2026-01-07T09:00:00Z",
      end: "2026-01-07T10:00:00Z"
    });
    assert.ok(parsed);
    assert.ok(parsed.start instanceof Date);
    assert.ok(parsed.end instanceof Date);
  });

  it("detects completed occurrences", () => {
    assert.strictEqual(isCompletedOccurrence(new Date(), null), false);
    const start = new Date("2026-01-07T10:00:00Z");
    const completed = new Set([endOfDay(start).toISOString()]);
    assert.strictEqual(isCompletedOccurrence(start, completed), true);
  });

  it("builds scheduled events with defaults", () => {
    const task = { id: "task-1", title: "", link: "" };
    const instance = {
      start: "2026-01-07T09:00:00Z",
      end: "2026-01-07T10:00:00Z",
      timeMapId: ""
    };
    const event = buildScheduledEvent(task, instance, 0, new Set());
    assert.ok(event);
    assert.strictEqual(event.title, "Untitled task");
    assert.strictEqual(event.timeMapId, "");
  });

  it("returns null for invalid or completed scheduled events", () => {
    const task = { id: "task-1", title: "Task" };
    assert.strictEqual(buildScheduledEvent(task, { start: "", end: "" }, 0, new Set()), null);
    const start = new Date("2026-01-07T09:00:00Z");
    const completed = new Set([endOfDay(start).toISOString()]);
    const instance = {
      start: "2026-01-07T09:00:00Z",
      end: "2026-01-07T10:00:00Z"
    };
    assert.strictEqual(buildScheduledEvent(task, instance, 0, completed), null);
  });

  it("resolves instance indices from multiple hints", () => {
    const instances = [
      { occurrenceId: "occ-1", start: "2026-01-07T09:00:00Z", end: "2026-01-07T10:00:00Z" },
      { occurrenceId: "occ-2", start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" }
    ];
    assert.strictEqual(resolveInstanceIndex(instances, { occurrenceId: "occ-2" }), 1);
    assert.strictEqual(resolveInstanceIndex(instances, { instanceIndex: 0 }), 0);
    assert.strictEqual(
      resolveInstanceIndex(instances, {
        start: new Date("2026-01-07T10:00:00Z"),
        end: new Date("2026-01-07T11:00:00Z")
      }),
      1
    );
    assert.strictEqual(resolveInstanceIndex(instances, {}), -1);
  });

  it("builds schedule bounds from valid instances", () => {
    const bounds = buildScheduleBounds([
      { start: "bad", end: "bad" },
      { start: "2026-01-07T12:00:00Z", end: "2026-01-07T13:00:00Z", timeMapId: "tm-2" },
      { start: "2026-01-07T09:00:00Z", end: "2026-01-07T10:00:00Z", timeMapId: "tm-1" }
    ]);
    assert.strictEqual(bounds.scheduledTimeMapId, "tm-1");
    assert.ok(bounds.scheduledStart.includes("09:00"));
    assert.ok(bounds.scheduledEnd.includes("13:00"));
  });

  it("returns null bounds when no valid instances exist", () => {
    const bounds = buildScheduleBounds([{ start: "bad", end: "bad" }]);
    assert.strictEqual(bounds.scheduledStart, null);
    assert.strictEqual(bounds.scheduledEnd, null);
    assert.strictEqual(bounds.scheduledTimeMapId, null);
  });

  it("parses event meta dates defensively", () => {
    const bad = parseEventMetaDates({ eventStart: "bad", eventEnd: "2026-01-07T10:00:00Z" });
    assert.strictEqual(bad.start, null);
    assert.strictEqual(bad.end, null);
    const good = parseEventMetaDates({
      eventStart: "2026-01-07T09:00:00Z",
      eventEnd: "2026-01-07T10:00:00Z"
    });
    assert.ok(good.start instanceof Date);
    assert.ok(good.end instanceof Date);
  });

  it("builds event meta from dataset when valid", () => {
    const meta = buildEventMetaFromDataset({
      eventSource: "task",
      eventTaskId: "task-1",
      eventStart: "2026-01-07T09:00:00Z",
      eventEnd: "2026-01-07T10:00:00Z",
      eventInstanceIndex: "bad"
    });
    assert.ok(meta);
    assert.strictEqual(meta.taskId, "task-1");
    assert.strictEqual(meta.instanceIndex, null);
  });

  it("returns null for invalid dataset inputs", () => {
    assert.strictEqual(buildEventMetaFromDataset(null), null);
    assert.strictEqual(
      buildEventMetaFromDataset({ eventSource: "external", eventTaskId: "task-1" }),
      null
    );
    assert.strictEqual(
      buildEventMetaFromDataset({
        eventSource: "task",
        eventTaskId: "",
        eventStart: "2026-01-07T09:00:00Z",
        eventEnd: "2026-01-07T10:00:00Z"
      }),
      null
    );
    assert.strictEqual(
      buildEventMetaFromDataset({
        eventSource: "task",
        eventTaskId: "task-1",
        eventStart: "bad",
        eventEnd: "2026-01-07T10:00:00Z"
      }),
      null
    );
  });
});
