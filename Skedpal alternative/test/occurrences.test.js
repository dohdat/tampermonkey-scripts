import assert from "assert";
import { describe, it } from "mocha";

import { buildOccurrenceDates, getUpcomingOccurrences } from "../src/core/scheduler/occurrences.js";

describe("scheduler occurrences", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const horizonEnd = new Date("2026-01-10T23:59:59Z");

  it("returns non-repeat deadlines that fall within the window", () => {
    const task = {
      id: "t1",
      deadline: new Date("2026-01-05T12:00:00Z"),
      repeat: { type: "none" }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.strictEqual(dates.length, 1);
    assert.strictEqual(dates[0].toISOString(), "2026-01-05T12:00:00.000Z");
  });

  it("falls back to the horizon end when no deadline is present", () => {
    const task = { id: "t2", deadline: null, repeat: { type: "none" } };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.strictEqual(dates.length, 1);
    assert.strictEqual(dates[0].toISOString(), horizonEnd.toISOString());
  });

  it("returns no dates for deadlines outside the window", () => {
    const task = {
      id: "t3",
      deadline: new Date("2025-12-20T12:00:00Z"),
      repeat: { type: "none" }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.deepStrictEqual(dates, []);
  });

  it("returns no dates when an unknown repeat unit is provided", () => {
    const task = {
      id: "t4",
      deadline: new Date("2026-01-05T12:00:00Z"),
      startFrom: new Date("2026-01-05T12:00:00Z"),
      repeat: { type: "custom", unit: "invalid" }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.deepStrictEqual(dates, []);
  });

  it("falls back to the anchor weekday for weekly repeats with no days set", () => {
    const task = {
      id: "t6",
      startFrom: new Date("2026-01-01T00:00:00Z"),
      repeat: { type: "custom", unit: "week", interval: 1, weeklyMode: "any", weeklyDays: [] }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.ok(dates.length > 0);
  });

  it("uses the earliest weekday in the week when all weekdays are selected", () => {
    const startFrom = new Date("2026-01-01T00:00:00Z");
    const task = {
      id: "t6b",
      startFrom,
      repeat: {
        type: "custom",
        unit: "week",
        interval: 1,
        weeklyMode: "any",
        weeklyDays: [0, 1, 2, 3, 4, 5, 6]
      }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.ok(dates.length > 0);
    assert.ok(dates.length > 1);
    assert.strictEqual(dates[1].getDay(), 0);
  });

  it("uses repeatAnchor when resolving weekly any occurrences", () => {
    const anchor = new Date(2026, 0, 1);
    const localNow = new Date(2026, 0, 10);
    const localHorizon = new Date(2026, 1, 1, 23, 59, 59);
    const task = {
      id: "t6c",
      repeatAnchor: anchor,
      startFrom: new Date(2026, 0, 5),
      repeat: {
        type: "custom",
        unit: "week",
        interval: 2,
        weeklyMode: "any",
        weeklyDays: [0, 1, 2, 3, 4, 5, 6]
      }
    };
    const dates = buildOccurrenceDates(task, localNow, localHorizon);
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getDay(), 0);
  });

  it("uses the monthly range end day for range repeats", () => {
    const task = {
      id: "t7",
      startFrom: new Date("2026-01-10T00:00:00Z"),
      repeat: { type: "custom", unit: "month", interval: 1, monthlyMode: "range", monthlyRangeEnd: 15 }
    };
    const dates = buildOccurrenceDates(task, now, new Date("2026-03-31T23:59:59Z"));
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getDate(), 15);
  });

  it("uses the configured monthly day when in day mode", () => {
    const task = {
      id: "t7b",
      startFrom: new Date(2026, 0, 10),
      repeat: { type: "custom", unit: "month", interval: 1, monthlyMode: "day", monthlyDay: 8 }
    };
    const dates = buildOccurrenceDates(task, now, new Date(2026, 2, 31, 23, 59, 59));
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getDate(), 8);
  });

  it("parses yearly range end dates from non-string inputs", () => {
    const localNow = new Date(2026, 0, 1);
    const localHorizon = new Date(2027, 11, 31, 23, 59, 59);
    const task = {
      id: "t8",
      startFrom: localNow,
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeEndDate: new Date(2026, 5, 20)
      }
    };
    const dates = buildOccurrenceDates(task, localNow, localHorizon);
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getMonth(), 5);
    assert.strictEqual(dates[0].getDate(), 20);
  });

  it("uses yearly month/day when range start is missing", () => {
    const localNow = new Date(2026, 0, 1);
    const localHorizon = new Date(2026, 11, 31, 23, 59, 59);
    const task = {
      id: "t8b",
      startFrom: localNow,
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyMonth: 3,
        yearlyDay: 15
      }
    };
    const dates = buildOccurrenceDates(task, localNow, localHorizon);
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getMonth(), 2);
    assert.strictEqual(dates[0].getDate(), 15);
  });

  it("rolls yearly occurrences into the next year when date has passed", () => {
    const localNow = new Date(2026, 6, 10);
    const localHorizon = new Date(2027, 11, 31, 23, 59, 59);
    const task = {
      id: "t8c",
      startFrom: localNow,
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyMonth: 3,
        yearlyDay: 15
      }
    };
    const dates = buildOccurrenceDates(task, localNow, localHorizon);
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getFullYear(), 2027);
    assert.strictEqual(dates[0].getMonth(), 2);
  });

  it("filters completed occurrences from upcoming results", () => {
    const task = {
      id: "t5",
      deadline: "2026-01-05T12:00:00Z",
      durationMin: 30,
      minBlockMin: 15,
      priority: 1,
      timeMapIds: [],
      repeat: { type: "none" },
      completedOccurrences: []
    };
    const first = getUpcomingOccurrences(task, now, 3, 14);
    assert.strictEqual(first.length, 1);
    const completed = first[0].date.toISOString();
    const second = getUpcomingOccurrences(
      { ...task, completedOccurrences: [completed] },
      now,
      3,
      14
    );
    assert.deepStrictEqual(second, []);
  });

  it("filters completed occurrences stored as local date keys", () => {
    const task = {
      id: "t5-local",
      deadline: "2026-01-05T12:00:00Z",
      durationMin: 30,
      minBlockMin: 15,
      priority: 1,
      timeMapIds: [],
      repeat: { type: "none" },
      completedOccurrences: []
    };
    const first = getUpcomingOccurrences(task, now, 3, 14);
    assert.strictEqual(first.length, 1);
    const completedDate = first[0].date;
    const localKey = `${completedDate.getFullYear()}-${String(
      completedDate.getMonth() + 1
    ).padStart(2, "0")}-${String(completedDate.getDate()).padStart(2, "0")}`;
    const second = getUpcomingOccurrences(
      { ...task, completedOccurrences: [localKey] },
      now,
      3,
      14
    );
    assert.deepStrictEqual(second, []);
  });

  it("treats monthly range completions within the window as completed", () => {
    const localNow = new Date(2026, 1, 5);
    const task = {
      id: "t5-range",
      repeatAnchor: new Date(2026, 0, 22),
      repeat: {
        type: "custom",
        unit: "month",
        interval: 1,
        monthlyMode: "range",
        monthlyRangeStart: 1,
        monthlyRangeEnd: 10
      }
    };
    const first = getUpcomingOccurrences(task, localNow, 1, 60);
    assert.strictEqual(first.length, 1);
    const second = getUpcomingOccurrences(
      { ...task, completedOccurrences: ["2026-02-02"] },
      localNow,
      1,
      60
    );
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].date.getMonth(), 2);
  });

  it("treats yearly range completions within the window as completed", () => {
    const localNow = new Date(2026, 0, 5);
    const task = {
      id: "t5-year-range",
      repeatAnchor: new Date(2025, 10, 20),
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2025-11-15",
        yearlyRangeEndDate: "2026-02-10"
      }
    };
    const first = getUpcomingOccurrences(task, localNow, 1, 800);
    assert.strictEqual(first.length, 1);
    const second = getUpcomingOccurrences(
      { ...task, completedOccurrences: ["2025-12-01"] },
      localNow,
      1,
      800
    );
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].date.getFullYear(), 2027);
  });

  it("keeps occurrences when completed dates are invalid", () => {
    const task = {
      id: "t5b",
      deadline: "2026-01-05T12:00:00Z",
      durationMin: 30,
      minBlockMin: 15,
      priority: 1,
      timeMapIds: [],
      repeat: { type: "none" },
      completedOccurrences: ["bad-date"]
    };
    const results = getUpcomingOccurrences(task, now, 3, 14);
    assert.strictEqual(results.length, 1);
  });

  it("returns an empty list when no task is provided", () => {
    assert.deepStrictEqual(getUpcomingOccurrences(null), []);
  });

  it("limits repeat occurrences when an end count is provided", () => {
    const task = {
      id: "t9",
      startFrom: new Date("2026-01-01T00:00:00Z"),
      repeat: { type: "custom", unit: "day", interval: 1, end: { type: "after", count: 1 } }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.strictEqual(dates.length, 1);
  });

  it("uses yearly month/day fields when no range end is provided", () => {
    const localNow = new Date(2026, 0, 1);
    const localHorizon = new Date(2027, 11, 31, 23, 59, 59);
    const task = {
      id: "t10",
      startFrom: localNow,
      repeat: { type: "custom", unit: "year", interval: 1, yearlyMonth: 2, yearlyDay: 10 }
    };
    const dates = buildOccurrenceDates(task, localNow, localHorizon);
    assert.ok(dates.length > 0);
    assert.strictEqual(dates[0].getMonth(), 1);
    assert.strictEqual(dates[0].getDate(), 10);
  });

  it("honors explicit end dates when building repeat contexts", () => {
    const task = {
      id: "t11",
      deadline: new Date("2026-01-01T00:00:00Z"),
      repeat: {
        type: "custom",
        unit: "day",
        interval: 1,
        end: { type: "on", date: "2026-01-02T00:00:00Z" }
      }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.ok(dates.length <= 2);
  });

  it("clamps repeat end dates that exceed the horizon", () => {
    const task = {
      id: "t12",
      startFrom: new Date(2026, 0, 1),
      repeat: {
        type: "custom",
        unit: "day",
        interval: 1,
        end: { type: "on", date: "2026-12-31T00:00:00Z" }
      }
    };
    const shortHorizon = new Date(2026, 0, 3, 23, 59, 59, 999);
    const dates = buildOccurrenceDates(task, now, shortHorizon);
    assert.ok(dates.every((date) => date <= shortHorizon));
  });

  it("falls back to the current time when no anchor fields exist", () => {
    const task = {
      id: "t13",
      repeat: { type: "custom", unit: "day", interval: 1 }
    };
    const dates = buildOccurrenceDates(task, now, horizonEnd);
    assert.ok(dates.length > 0);
  });

  it("uses taskId when building occurrence ids", () => {
    const task = {
      taskId: "legacy-1",
      deadline: "2026-01-05T12:00:00Z",
      durationMin: 30,
      minBlockMin: 15,
      priority: 1,
      timeMapIds: [],
      repeat: { type: "none" }
    };
    const upcoming = getUpcomingOccurrences(task, now, 1, 7);
    assert.strictEqual(upcoming[0].occurrenceId, "legacy-1-2026-01-05");
  });
});
