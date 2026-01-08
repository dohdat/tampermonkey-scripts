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
});
