import assert from "assert";
import { describe, it } from "mocha";

import {
  applyPlacementsToSlots,
  buildWindows,
  getAvailableSlotsForTask,
  getBlockingBusyForTask,
  removeBlockFromSlots,
  subtractBusy
} from "../src/core/scheduler/slots-utils.js";

function slot(start, end, extras = {}) {
  return { start: new Date(start), end: new Date(end), ...extras };
}

describe("slots utils", () => {
  it("builds windows from timemap rules and clamps active windows to now", () => {
    const now = new Date(2026, 0, 5, 10, 30, 0, 0);
    const horizonEnd = new Date(2026, 0, 6, 11, 0, 0, 0);
    const windows = buildWindows(
      [
        {
          id: "tm-1",
          rules: [{ day: 1, startTime: "10:00", endTime: "12:00" }]
        }
      ],
      now,
      horizonEnd
    );
    assert.strictEqual(windows.length, 1);
    assert.strictEqual(windows[0].timeMapId, "tm-1");
    assert.strictEqual(windows[0].start.getTime(), now.getTime());
    assert.strictEqual(windows[0].end.getHours(), 12);
    assert.strictEqual(windows[0].end.getMinutes(), 0);
  });

  it("builds windows from legacy days/start/end fields", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0, 0);
    const horizonEnd = new Date(2026, 0, 5, 23, 0, 0, 0);
    const windows = buildWindows(
      [
        {
          id: "tm-2",
          days: [1],
          startTime: "09:00",
          endTime: "10:00"
        }
      ],
      now,
      horizonEnd
    );
    assert.strictEqual(windows.length, 1);
    assert.strictEqual(windows[0].start.getHours(), 9);
    assert.strictEqual(windows[0].start.getMinutes(), 0);
    assert.strictEqual(windows[0].end.getHours(), 10);
    assert.strictEqual(windows[0].end.getMinutes(), 0);
  });

  it("removes busy blocks from slots and keeps remaining fragments sorted", () => {
    const free = removeBlockFromSlots(
      [slot("2026-01-05T09:00:00.000Z", "2026-01-05T12:00:00.000Z")],
      slot("2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z")
    );
    assert.strictEqual(free.length, 2);
    assert.strictEqual(free[0].start.toISOString(), "2026-01-05T09:00:00.000Z");
    assert.strictEqual(free[0].end.toISOString(), "2026-01-05T10:00:00.000Z");
    assert.strictEqual(free[1].start.toISOString(), "2026-01-05T11:00:00.000Z");
    assert.strictEqual(free[1].end.toISOString(), "2026-01-05T12:00:00.000Z");
  });

  it("subtracts multiple busy blocks across windows", () => {
    const free = subtractBusy(
      [slot("2026-01-05T09:00:00.000Z", "2026-01-05T12:00:00.000Z")],
      [
        slot("2026-01-05T09:30:00.000Z", "2026-01-05T10:00:00.000Z"),
        slot("2026-01-05T11:00:00.000Z", "2026-01-05T11:30:00.000Z")
      ]
    );
    assert.deepStrictEqual(
      free.map((entry) => [entry.start.toISOString(), entry.end.toISOString()]),
      [
        ["2026-01-05T09:00:00.000Z", "2026-01-05T09:30:00.000Z"],
        ["2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z"],
        ["2026-01-05T11:30:00.000Z", "2026-01-05T12:00:00.000Z"]
      ]
    );
  });

  it("filters blocking busy entries by allowed external calendars", () => {
    const busy = [
      slot("2026-01-05T09:00:00.000Z", "2026-01-05T10:00:00.000Z", { calendarId: "allowed" }),
      slot("2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z", { calendarId: "blocked" }),
      slot("2026-01-05T11:00:00.000Z", "2026-01-05T12:00:00.000Z", {})
    ];
    const filtered = getBlockingBusyForTask(busy, { externalCalendarIds: ["allowed"] });
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.some((entry) => entry.calendarId === "blocked"));
    assert.ok(filtered.some((entry) => !entry.calendarId));
  });

  it("returns original slots when no blocking busy exists for task", () => {
    const slots = [slot("2026-01-05T09:00:00.000Z", "2026-01-05T10:00:00.000Z")];
    const free = getAvailableSlotsForTask(
      slots,
      [slot("2026-01-05T09:00:00.000Z", "2026-01-05T09:15:00.000Z", { calendarId: "allowed" })],
      { externalCalendarIds: ["allowed"] }
    );
    assert.strictEqual(free, slots);
  });

  it("applies placement removals cumulatively", () => {
    const slots = [slot("2026-01-05T09:00:00.000Z", "2026-01-05T12:00:00.000Z")];
    const next = applyPlacementsToSlots(slots, [
      slot("2026-01-05T09:30:00.000Z", "2026-01-05T10:00:00.000Z"),
      slot("2026-01-05T11:00:00.000Z", "2026-01-05T11:30:00.000Z")
    ]);
    assert.deepStrictEqual(
      next.map((entry) => [entry.start.toISOString(), entry.end.toISOString()]),
      [
        ["2026-01-05T09:00:00.000Z", "2026-01-05T09:30:00.000Z"],
        ["2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z"],
        ["2026-01-05T11:30:00.000Z", "2026-01-05T12:00:00.000Z"]
      ]
    );
  });
});
