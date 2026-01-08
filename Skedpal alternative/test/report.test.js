import assert from "assert";
import { describe, it } from "mocha";
import { getMissedTaskRows, getTimeMapUsageRows } from "../src/ui/report.js";

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
        scheduleStatus: "ignored",
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
              start: "2026-01-05T09:00:00.000Z",
              end: "2026-01-05T10:00:00.000Z",
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
});
