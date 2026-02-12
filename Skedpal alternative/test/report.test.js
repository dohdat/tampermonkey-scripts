import assert from "assert";
import { describe, it } from "mocha";
import {
  getMissedTaskRows,
  getTimeMapUsageRows,
  getUniqueAvailabilityMinutes
} from "../src/ui/report.js";
import { state } from "../src/ui/state/page-state.js";
import {
  CALENDAR_EVENTS_CACHE_PREFIX,
  CALENDAR_EXTERNAL_BUFFER_HOURS,
  MS_PER_HOUR
} from "../src/constants.js";

function buildRangeKey(range, viewMode, calendarIds) {
  const idsKey = Array.isArray(calendarIds)
    ? calendarIds.filter(Boolean).sort().join(",") || "none"
    : "all";
  return `${CALENDAR_EVENTS_CACHE_PREFIX}${viewMode}:${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
}

function buildBufferedRange(range) {
  return {
    start: new Date(range.start.getTime() - CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    end: new Date(range.end.getTime() + CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    days: range.days
  };
}

describe("report", () => {
  it("ranks missed tasks by missed percentage then priority", () => {
    const tasks = [
      {
        id: "t1",
        title: "Low priority",
        scheduleStatus: "unscheduled",
        missedCount: 2,
        expectedCount: 8,
        missedLastRun: 4,
        priority: 1,
        section: "s1",
        subsection: "sub1"
      },
      {
        id: "t2",
        title: "High priority",
        scheduleStatus: "unscheduled",
        missedCount: 2,
        expectedCount: 4,
        missedLastRun: 4,
        priority: 5,
        section: "s1",
        subsection: "sub1"
      },
      {
        id: "t3",
        title: "Most missed",
        scheduleStatus: "unscheduled",
        missedCount: 4,
        expectedCount: 10,
        missedLastRun: 5,
        priority: 2,
        section: "s1",
        subsection: "sub1"
      }
    ];
    const settings = {
      sections: [{ id: "s1", name: "Work" }],
      subsections: { s1: [{ id: "sub1", name: "Focus" }] }
    };

    const rows = getMissedTaskRows(tasks, settings);

    assert.strictEqual(rows[0].id, "t2");
    assert.strictEqual(rows[1].id, "t3");
    assert.strictEqual(rows[2].id, "t1");
  });

  it("includes section and subsection labels", () => {
    const tasks = [
      {
        id: "t4",
        title: "Task",
        scheduleStatus: "unscheduled",
        missedCount: 1,
        priority: 1,
        section: "s2",
        subsection: "sub2"
      }
    ];
    const settings = {
      sections: [{ id: "s2", name: "Personal" }],
      subsections: { s2: [{ id: "sub2", name: "Errands" }] }
    };

    const rows = getMissedTaskRows(tasks, settings);

    assert.strictEqual(rows[0].sectionLabel, "Personal");
    assert.strictEqual(rows[0].subsectionLabel, "Errands");
  });

  it("includes scheduled tasks when they have missed counts", () => {
    const tasks = [
      {
        id: "t5",
        title: "Scheduled but missed",
        scheduleStatus: "scheduled",
        missedCount: 3,
        expectedCount: 10,
        missedLastRun: 4,
        priority: 2,
        section: "",
        subsection: ""
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "t5");
    assert.strictEqual(rows[0].expectedCount, 10);
    assert.strictEqual(rows[0].missedLastRun, 4);
  });

  it("excludes scheduled tasks with zero missed runs", () => {
    const tasks = [
      {
        id: "t6",
        title: "Scheduled and fine",
        scheduleStatus: "scheduled",
        missedCount: 4,
        expectedCount: 10,
        missedLastRun: 0,
        priority: 2,
        section: "",
        subsection: ""
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    assert.strictEqual(rows.length, 0);
  });

  it("excludes parent tasks that have subtasks", () => {
    const tasks = [
      {
        id: "parent",
        title: "Parent task",
        scheduleStatus: "unscheduled",
        missedCount: 2
      },
      {
        id: "child",
        title: "Child task",
        scheduleStatus: "unscheduled",
        missedCount: 2,
        subtaskParentId: "parent"
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "child");
  });

  it("excludes unscheduled tasks with zero missed counts", () => {
    const tasks = [
      {
        id: "t7",
        title: "Unscheduled but fine",
        scheduleStatus: "unscheduled",
        missedCount: 0,
        expectedCount: 0,
        missedLastRun: 0
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    assert.strictEqual(rows.length, 0);
  });

  it("includes missed tasks across status fallbacks", () => {
    const tasks = [
      {
        id: "t8",
        title: "Ignored with misses",
        scheduleStatus: "ignored",
        expectedCount: 0,
        missedCount: 2,
        missedLastRun: 0
      },
      {
        id: "t8b",
        title: "Ignored out of range",
        scheduleStatus: "ignored",
        expectedCount: 3,
        missedCount: 0,
        missedLastRun: 3
      },
      {
        id: "t9",
        title: "Scheduled without expected count",
        scheduleStatus: "scheduled",
        expectedCount: 0,
        missedCount: 1,
        missedLastRun: 0
      },
      {
        id: "t10",
        title: "Unscheduled no misses",
        scheduleStatus: "unscheduled",
        expectedCount: 2,
        missedCount: 0,
        missedLastRun: 0
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    const ids = rows.map((row) => row.id);
    assert.ok(ids.includes("t8"));
    assert.ok(ids.includes("t9"));
    assert.ok(!ids.includes("t10"));
    assert.ok(!ids.includes("t8b"));
  });

  it("falls back to default section labels", () => {
    const rows = getMissedTaskRows(
      [
        {
          id: "t11",
          title: "Untitled",
          scheduleStatus: "scheduled",
          missedCount: 1,
          expectedCount: 0,
          section: "",
          subsection: ""
        }
      ],
      {}
    );

    assert.strictEqual(rows[0].sectionLabel, "No section");
    assert.strictEqual(rows[0].subsectionLabel, "No subsection");
  });

  it("excludes completed tasks from missed rows", () => {
    const rows = getMissedTaskRows(
      [
        {
          id: "t12",
          title: "Done",
          scheduleStatus: "unscheduled",
          missedCount: 3,
          completed: true
        }
      ],
      {}
    );
    assert.strictEqual(rows.length, 0);
  });

  it("excludes repeat tasks with no expected occurrences", () => {
    const rows = getMissedTaskRows(
      [
        {
          id: "repeat-out",
          title: "Repeat out of range",
          scheduleStatus: "unscheduled",
          expectedCount: 0,
          missedCount: 10,
          startFrom: "2035-01-01T00:00:00.000Z",
          repeat: { type: "custom", unit: "year", interval: 1 }
        },
        {
          id: "non-repeat",
          title: "Non repeat",
          scheduleStatus: "unscheduled",
          expectedCount: 0,
          missedCount: 10
        }
      ],
      {}
    );
    const ids = rows.map((row) => row.id);
    assert.ok(!ids.includes("repeat-out"));
    assert.ok(ids.includes("non-repeat"));
  });

  it("shows only the next sequential-single subtask in missed rows", () => {
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        subtaskScheduleMode: "sequential-single"
      },
      {
        id: "child-1",
        title: "First",
        subtaskParentId: "parent",
        scheduleStatus: "unscheduled",
        missedCount: 2,
        order: 1
      },
      {
        id: "child-2",
        title: "Second",
        subtaskParentId: "parent",
        scheduleStatus: "unscheduled",
        missedCount: 2,
        order: 2
      }
    ];

    const rows = getMissedTaskRows(tasks, {});

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "child-1");
  });

  it("recomputes repeat missed metrics client-side instead of stale stored values", () => {
    const now = new Date(2026, 1, 13, 12, 0, 0);
    const tasks = [
      {
        id: "repeat-stale",
        title: "Repeat task",
        scheduleStatus: "scheduled",
        repeat: { type: "custom", unit: "day", interval: 1 },
        repeatAnchor: new Date(2026, 1, 12, 0, 0, 0).toISOString(),
        completedOccurrences: ["2026-02-12"],
        expectedCount: 99,
        missedLastRun: 99,
        missedCount: 99
      }
    ];
    const settings = { schedulingHorizonDays: 14 };

    const rows = getMissedTaskRows(tasks, settings, now);

    assert.strictEqual(rows.length, 0);
  });

  it("builds timemap usage rows from scheduled instances", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const timeMaps = [
        {
          id: "tm-1",
          name: "Focus",
          color: "#22c55e",
          rules: [{ day: 1, startTime: "09:00", endTime: "11:00" }]
        }
      ];
      const tasks = [
        {
          id: "t1",
          scheduleStatus: "scheduled",
          scheduledInstances: [
            {
              start: "2026-01-05T09:00:00",
              end: "2026-01-05T10:00:00",
              timeMapId: "tm-1"
            }
          ]
        }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows(tasks, timeMaps, settings);

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].id, "tm-1");
      assert.strictEqual(rows[0].scheduledMinutes, 60);
      assert.strictEqual(rows[0].capacityMinutes, 120);
      assert.strictEqual(rows[0].percent, 50);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("adds external calendar minutes to timemap usage", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    const previousExternalRange = state.calendarExternalRange;
    const previousExternalEvents = state.calendarExternalEvents;
    const previousExternalKey = state.calendarExternalRangeKey;
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const scheduledStart = new OriginalDate("2026-01-05T09:00:00");
      const scheduledEnd = new OriginalDate("2026-01-05T10:00:00");
      const ruleDay = scheduledStart.getDay();
      const timeMaps = [
        {
          id: "tm-1",
          name: "Focus",
          rules: [
            { day: ruleDay, startTime: "09:00", endTime: "11:00" },
            { day: ruleDay, startTime: "11:00", endTime: "10:00" }
          ]
        }
      ];
      const tasks = [
        {
          id: "t1",
          scheduleStatus: "scheduled",
          scheduledInstances: [
            {
              start: scheduledStart.toISOString(),
              end: scheduledEnd.toISOString(),
              timeMapId: "tm-1"
            }
          ]
        }
      ];
      const rangeStart = new OriginalDate(scheduledStart);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new OriginalDate(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      const bufferedRange = buildBufferedRange({
        start: rangeStart,
        end: rangeEnd,
        days: 1
      });
      state.calendarExternalRange = bufferedRange;
      state.calendarExternalRangeKey = buildRangeKey(
        bufferedRange,
        "report",
        state.settingsCache.googleCalendarIds
      );
      state.calendarExternalEvents = [
        {
          start: new OriginalDate(scheduledStart.getTime() + 30 * 60 * 1000),
          end: new OriginalDate(scheduledEnd),
          source: "external"
        },
        {
          start: new OriginalDate(2026, 0, 5, 12, 0, 0),
          end: new OriginalDate(2026, 0, 5, 12, 30, 0),
          source: "external"
        },
        {
          start: new OriginalDate("bad"),
          end: new OriginalDate("bad"),
          source: "external"
        }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows(tasks, timeMaps, settings);

      assert.strictEqual(rows[0].scheduledMinutes, 60);
      assert.strictEqual(rows[0].capacityMinutes, 120);
    } finally {
      global.Date = OriginalDate;
      state.calendarExternalRange = previousExternalRange;
      state.calendarExternalEvents = previousExternalEvents;
      state.calendarExternalRangeKey = previousExternalKey;
    }
  });

  it("ignores external events that do not overlap timemap availability", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 5, 12, 0, 0);
    const previousExternalRange = state.calendarExternalRange;
    const previousExternalEvents = state.calendarExternalEvents;
    const previousExternalKey = state.calendarExternalRangeKey;
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const ruleDay = new OriginalDate(2026, 0, 5).getDay();
      const nextRuleDay = (ruleDay + 1) % 7;
      const timeMaps = [
        {
          id: "tm-2",
          name: "Bounds",
          rules: [
            { day: ruleDay, startTime: "09:00", endTime: "10:00" },
            { day: nextRuleDay, startTime: "09:00", endTime: "10:00" }
          ]
        }
      ];
      const baseRange = {
        start: new OriginalDate(2026, 0, 5, 0, 0, 0),
        end: new OriginalDate(2026, 0, 6, 0, 0, 0),
        days: 1
      };
      const bufferedRange = buildBufferedRange(baseRange);
      state.calendarExternalRange = bufferedRange;
      state.calendarExternalRangeKey = buildRangeKey(
        bufferedRange,
        "report",
        state.settingsCache.googleCalendarIds
      );
      state.calendarExternalEvents = [
        {
          start: new OriginalDate(2026, 0, 5, 10, 0, 0),
          end: new OriginalDate(2026, 0, 5, 9, 0, 0),
          source: "external"
        },
        {
          start: new OriginalDate(2026, 0, 5, 23, 0, 0),
          end: new OriginalDate(2026, 0, 6, 0, 0, 0),
          source: "external"
        }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows([], timeMaps, settings);

      assert.strictEqual(rows[0].scheduledMinutes, 0);
      assert.strictEqual(rows[0].capacityMinutes, 120);
    } finally {
      global.Date = OriginalDate;
      state.calendarExternalRange = previousExternalRange;
      state.calendarExternalEvents = previousExternalEvents;
      state.calendarExternalRangeKey = previousExternalKey;
    }
  });

  it("ignores invalid timemap rules and instances", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const timeMaps = [
        {
          id: "tm-bad",
          name: "Bad rules",
          rules: [{ day: "nope", startTime: "bad", endTime: "bad" }]
        }
      ];
      const tasks = [
        {
          id: "t13",
          scheduleStatus: "scheduled",
          scheduledInstances: [
            { start: "bad", end: "bad", timeMapId: "tm-bad" },
            { start: "2026-01-05T09:00:00.000Z", end: "2026-01-05T09:00:00.000Z", timeMapId: "tm-bad" },
            { start: "2026-01-05T09:00:00.000Z", end: "2026-01-05T10:00:00.000Z", timeMapId: "" }
          ]
        }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows(tasks, timeMaps, settings);

      assert.strictEqual(rows[0].scheduledMinutes, 0);
      assert.strictEqual(rows[0].capacityMinutes, 0);
      assert.strictEqual(rows[0].percent, 0);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("ranks oversubscribed timemaps ahead of empty ones", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const timeMaps = [
        { id: "tm-empty", name: "Empty", rules: [] },
        {
          id: "tm-over",
          name: "Overbooked",
          color: "#f97316",
          rules: [{ day: 1, startTime: "09:00", endTime: "10:00" }]
        }
      ];
      const tasks = [
        {
          id: "t12",
          scheduleStatus: "scheduled",
          scheduledInstances: [
            {
              start: "2026-01-05T09:00:00.000Z",
              end: "2026-01-05T11:00:00.000Z",
              timeMapId: "tm-over"
            }
          ]
        }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows(tasks, timeMaps, settings);

      assert.strictEqual(rows[0].id, "tm-over");
      assert.strictEqual(rows[0].isOverSubscribed, true);
      assert.strictEqual(rows[1].id, "tm-empty");
      assert.strictEqual(rows[1].capacityMinutes, 0);
      assert.strictEqual(rows[1].percent, 0);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("computes unique availability across overlapping timemaps", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 5, 12, 0, 0);
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const ruleDay = new OriginalDate(2026, 0, 5).getDay();
      const timeMaps = [
        { id: "tm-a", name: "A", rules: [{ day: ruleDay, startTime: "07:00", endTime: "11:00" }] },
        { id: "tm-b", name: "B", rules: [{ day: ruleDay, startTime: "09:00", endTime: "13:00" }] }
      ];
      const settings = { schedulingHorizonDays: 1 };

      const rows = getTimeMapUsageRows([], timeMaps, settings);
      const horizonStart = new OriginalDate(fixedNow.getTime());
      horizonStart.setHours(0, 0, 0, 0);
      const horizonEnd = new OriginalDate(horizonStart);
      horizonEnd.setDate(horizonEnd.getDate() + 1);
      const uniqueMinutes = getUniqueAvailabilityMinutes(
        timeMaps,
        horizonStart,
        horizonEnd
      );

      assert.strictEqual(rows.length, 2);
      assert.strictEqual(uniqueMinutes, 360);
    } finally {
      global.Date = OriginalDate;
    }
  });
});
