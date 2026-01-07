import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { buildDayEventLayout } = await import("../src/ui/calendar-layout.js");

function buildEvent(id, startIso, endIso) {
  return {
    taskId: id,
    title: `Task ${id}`,
    start: new Date(startIso),
    end: new Date(endIso),
    timeMapId: "tm-1",
    occurrenceId: `occ-${id}`,
    instanceIndex: 0
  };
}

describe("calendar overlap layout", () => {
  it("splits overlapping events into columns", () => {
    const day = new Date(2026, 0, 6, 0, 0, 0);
    const events = [
      buildEvent("a", "2026-01-06T12:00:00.000Z", "2026-01-06T13:00:00.000Z"),
      buildEvent("b", "2026-01-06T12:00:00.000Z", "2026-01-06T13:00:00.000Z"),
      buildEvent("c", "2026-01-06T12:00:00.000Z", "2026-01-06T13:00:00.000Z")
    ];

    const layout = buildDayEventLayout(events, day);
    const columns = new Set(layout.map((item) => item.columnIndex));
    const columnCounts = new Set(layout.map((item) => item.columnCount));

    assert.strictEqual(layout.length, 3);
    assert.strictEqual(columns.size, 3);
    assert.deepStrictEqual(Array.from(columnCounts), [3]);
  });

  it("keeps separate columns for non-overlapping events", () => {
    const day = new Date(2026, 0, 6, 0, 0, 0);
    const events = [
      buildEvent("a", "2026-01-06T08:00:00.000Z", "2026-01-06T09:00:00.000Z"),
      buildEvent("b", "2026-01-06T10:00:00.000Z", "2026-01-06T11:00:00.000Z")
    ];

    const layout = buildDayEventLayout(events, day);
    const columnCounts = new Set(layout.map((item) => item.columnCount));

    assert.strictEqual(layout.length, 2);
    assert.deepStrictEqual(Array.from(columnCounts), [1]);
  });
});
