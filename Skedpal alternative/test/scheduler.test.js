import assert from "assert";
import { describe, it } from "mocha";
import { scheduleTasks } from "../src/core/scheduler.js";
import { EXTERNAL_CALENDAR_TIMEMAP_PREFIX } from "../src/constants.js";

function nextWeekday(base, weekday) {
  const date = new Date(base);
  date.setHours(8, 0, 0, 0);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function shiftDate(base, days, hours, minutes) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe("scheduler", () => {
  it("splits around busy blocks and respects min blocks", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const busy = [
      { start: shiftDate(now, 0, 9, 30), end: shiftDate(now, 0, 10, 0) }
    ];
    const tasks = [
      {
        id: "t1",
        title: "Split",
        durationMin: 60,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59)
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy,
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 2);
    assert.strictEqual(result.scheduled[0].start.getHours(), 9);
    assert.strictEqual(result.scheduled[0].start.getMinutes(), 0);
    assert.strictEqual(result.scheduled[0].end.getHours(), 9);
    assert.strictEqual(result.scheduled[0].end.getMinutes(), 30);
    assert.strictEqual(result.scheduled[1].start.getHours(), 10);
    assert.strictEqual(result.scheduled[1].start.getMinutes(), 0);
  });

  it("schedules daily and weekly repeats across days", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      {
        id: "tm-all",
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        endTime: "11:00"
      }
    ];
    const tasks = [
      {
        id: "daily",
        title: "Daily",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-all"],
        repeat: { type: "custom", unit: "day", interval: 1 }
      },
      {
        id: "weekly",
        title: "Weekly",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-all"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [now.getDay(), (now.getDay() + 2) % 7]
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 2,
      now
    });

    assert.strictEqual(result.scheduled.length, 5);
    assert.strictEqual(
      result.scheduled.filter((slot) => slot.taskId === "daily").length,
      3
    );
    assert.strictEqual(
      result.scheduled.filter((slot) => slot.taskId === "weekly").length,
      2
    );
  });

  it("allows overlap with external calendar events when selected", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] }
    ];
    const busy = [
      { calendarId: "cal-1", start: shiftDate(now, 0, 9, 0), end: shiftDate(now, 0, 10, 0) }
    ];
    const deadline = shiftDate(now, 0, 23, 59);
    const tasks = [
      {
        id: "blocked",
        title: "Blocked",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        deadline
      },
      {
        id: "allowed",
        title: "Allowed",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1", `${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`],
        deadline
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy,
      schedulingHorizonDays: 1,
      now
    });

    const allowed = result.scheduled.find((slot) => slot.taskId === "allowed");
    const blocked = result.scheduled.find((slot) => slot.taskId === "blocked");
    assert.ok(allowed);
    assert.ok(blocked);
    assert.strictEqual(allowed.start.getHours(), 9);
    assert.strictEqual(blocked.start.getHours(), 10);
  });

  it("does not schedule repeating occurrences before their day", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      {
        id: "tm-all",
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        endTime: "10:00"
      }
    ];
    const tasks = [
      {
        id: "weekly",
        title: "Weekly",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-all"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [(now.getDay() + 1) % 7]
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 2,
      now
    });

    const nextDayStart = new Date(now);
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    nextDayStart.setHours(0, 0, 0, 0);
    assert.strictEqual(result.scheduled.length, 1);
    assert.ok(result.scheduled[0].start >= nextDayStart);
  });

  it("skips completed repeat occurrences", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      {
        id: "tm-all",
        days: [now.getDay(), (now.getDay() + 1) % 7],
        startTime: "09:00",
        endTime: "11:00"
      }
    ];
    const completedDate = new Date(now);
    completedDate.setHours(23, 59, 59, 999);
    const tasks = [
      {
        id: "weekly",
        title: "Weekly",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-all"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [now.getDay(), (now.getDay() + 1) % 7]
        },
        completedOccurrences: [completedDate.toISOString()]
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 2,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "weekly");
  });

  it("schedules monthly and yearly repeats and honors startFrom", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const startFrom = shiftDate(now, 0, 10, 0);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const tasks = [
      {
        id: "monthly",
        title: "Monthly",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        startFrom,
        repeat: {
          type: "custom",
          unit: "month",
          interval: 1,
          monthlyMode: "nth",
          monthlyNth: 1,
          monthlyWeekday: now.getDay()
        }
      },
      {
        id: "yearly",
        title: "Yearly",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        startFrom,
        repeat: {
          type: "custom",
          unit: "year",
          interval: 1,
          yearlyMonth: now.getMonth() + 1,
          yearlyDay: now.getDate()
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 2);
    assert.ok(result.scheduled.every((slot) => slot.start >= startFrom));
  });

  it("schedules weekly any-mode repeats once per week", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0, 0); // Monday
    const timeMaps = [
      {
        id: "tm-week-any",
        rules: [
          { day: 2, startTime: "09:00", endTime: "11:00" },
          { day: 4, startTime: "09:00", endTime: "11:00" }
        ]
      }
    ];
    const tasks = [
      {
        id: "weekly-any",
        title: "Weekly any",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-week-any"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [2, 4],
          weeklyMode: "any"
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 14,
      now
    });

    assert.strictEqual(result.scheduled.length, 2);
    assert.ok(result.scheduled.every((slot) => slot.start.getDay() === 2));
  });

  it("schedules weekly any-mode repeats later in the week when the first day is blocked", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0, 0); // Monday
    const tuesday = new Date(2026, 0, 6, 9, 0, 0, 0);
    const timeMaps = [
      {
        id: "tm-week-any",
        rules: [
          { day: 2, startTime: "09:00", endTime: "11:00" },
          { day: 4, startTime: "09:00", endTime: "11:00" }
        ]
      }
    ];
    const busy = [
      { start: new Date(tuesday), end: new Date(2026, 0, 6, 11, 0, 0, 0) }
    ];
    const tasks = [
      {
        id: "weekly-any",
        title: "Weekly any",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-week-any"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [2, 4],
          weeklyMode: "any"
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy,
      schedulingHorizonDays: 7,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].start.getDay(), 4);
  });

  it("honors weekly any end dates when picking a scheduling window", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0, 0); // Monday
    const tuesday = new Date(2026, 0, 6, 9, 0, 0, 0);
    const timeMaps = [
      {
        id: "tm-week-any",
        rules: [
          { day: 2, startTime: "09:00", endTime: "11:00" },
          { day: 4, startTime: "09:00", endTime: "11:00" }
        ]
      }
    ];
    const busy = [
      { start: new Date(tuesday), end: new Date(2026, 0, 6, 11, 0, 0, 0) }
    ];
    const endDate = shiftDate(now, 1, 12, 0);
    const tasks = [
      {
        id: "weekly-any",
        title: "Weekly any",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-week-any"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [2, 4],
          weeklyMode: "any",
          end: { type: "on", date: endDate.toISOString() }
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy,
      schedulingHorizonDays: 7,
      now
    });

    assert.strictEqual(result.scheduled.length, 0);
    assert.ok(result.unscheduled.includes("weekly-any"));
  });

  it("clamps weekly any scheduling to the horizon", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0, 0); // Monday
    const timeMaps = [
      {
        id: "tm-week-any",
        rules: [
          { day: 2, startTime: "09:00", endTime: "11:00" },
          { day: 4, startTime: "09:00", endTime: "11:00" }
        ]
      }
    ];
    const tasks = [
      {
        id: "weekly-any",
        title: "Weekly any",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-week-any"],
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyDays: [2, 4],
          weeklyMode: "any"
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].start.getDay(), 2);
  });

  it("schedules yearly range repeats within the window", () => {
    const now = new Date(2026, 0, 1, 8, 0, 0, 0);
    const rangeStart = 5;
    const startDate = new Date(2026, 0, rangeStart, 0, 0, 0, 0);
    const timeMaps = [
      {
        id: "tm-range",
        rules: [{ day: startDate.getDay(), startTime: "09:00", endTime: "11:00" }]
      }
    ];
    const tasks = [
      {
        id: "yearly-range",
        title: "Yearly range",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-range"],
        repeat: {
          type: "custom",
          unit: "year",
          interval: 1,
          yearlyRangeStartDate: "2026-01-05",
          yearlyRangeEndDate: "2026-01-10"
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 15,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].start.getDate(), rangeStart);
    assert.ok(result.scheduled[0].start >= startDate);
  });

  it("schedules yearly ranges that wrap across years", () => {
    const now = new Date(2026, 11, 20, 8, 0, 0, 0);
    const timeMaps = [
      {
        id: "tm-all",
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: "08:00",
        endTime: "23:00"
      }
    ];
    const tasks = [
      {
        id: "yearly-wrap",
        title: "Yearly wrap",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-all"],
        repeat: {
          type: "custom",
          unit: "year",
          interval: 1,
          yearlyRangeStartDate: "2026-11-30",
          yearlyRangeEndDate: "2027-01-06"
        }
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 21,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.ok(result.scheduled[0].start >= now);
    assert.ok(result.scheduled[0].start >= new Date("2026-11-30T00:00:00Z"));
    assert.ok(result.scheduled[0].end <= new Date("2027-01-06T23:59:59Z"));
  });

  it("marks unscheduled and ignored tasks", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] }
    ];
    const tasks = [
      {
        id: "past-deadline",
        title: "Past",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, -1, 12, 0)
      },
      {
        id: "ended-repeat",
        title: "Ended",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        repeat: { type: "custom", unit: "day", interval: 1, end: { type: "on", date: shiftDate(now, -1, 12, 0).toISOString() } }
      },
      {
        id: "no-map",
        title: "No map",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-missing"],
        deadline: shiftDate(now, 0, 23, 59)
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.ok(result.unscheduled.includes("past-deadline"));
    assert.ok(result.unscheduled.includes("no-map"));
    assert.ok(result.ignored.includes("ended-repeat"));
  });

  it("normalizes duration/min block and uses full window", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 2);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "09:30" }] }
    ];
    const tasks = [
      {
        id: "t-short",
        title: "Short",
        durationMin: 0,
        minBlockMin: 5,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59)
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    const slot = result.scheduled[0];
    const durationMin = (slot.end - slot.start) / (60 * 1000);
    assert.strictEqual(durationMin, 15);
  });

  it("orders by priority when deadlines match", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 3);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "10:00" }] }
    ];
    const deadline = shiftDate(now, 0, 23, 59);
    const tasks = [
      {
        id: "low",
        title: "Low",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 1,
        deadline
      },
      {
        id: "high",
        title: "High",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 5,
        deadline
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "high");
    assert.ok(result.unscheduled.includes("low"));
  });

  it("prioritizes by priority when deadlines are implicit and repeat is flexible", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "10:00" }] }
    ];
    const tasks = [
      {
        id: "repeat-low",
        title: "Repeat low",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 1,
        repeat: {
          type: "custom",
          unit: "week",
          interval: 1,
          weeklyMode: "any",
          weeklyDays: [1, 2, 3, 4, 5]
        }
      },
      {
        id: "single-high",
        title: "Single high",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 5
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "single-high");
    assert.ok(result.unscheduled.includes("repeat-low"));
  });

  it("keeps tighter repeat windows ahead of implicit one-offs", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "10:00" }] }
    ];
    const tasks = [
      {
        id: "repeat-tight",
        title: "Repeat tight",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 1,
        repeat: { type: "custom", unit: "day", interval: 1 }
      },
      {
        id: "single-high",
        title: "Single high",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 5
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "repeat-tight");
    assert.ok(result.unscheduled.includes("single-high"));
  });

  it("orders by section, subsection, and order when priorities match", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 3);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "10:00" }] }
    ];
    const deadline = shiftDate(now, 0, 23, 59);
    const tasks = [
      {
        id: "b",
        title: "B",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 3,
        deadline,
        section: "s1",
        subsection: "sub2",
        order: 2
      },
      {
        id: "a",
        title: "A",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 3,
        deadline,
        section: "s1",
        subsection: "sub1",
        order: 1
      },
      {
        id: "c",
        title: "C",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 3,
        deadline,
        section: "s2",
        subsection: "sub1",
        order: 1
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "a");
    assert.ok(result.unscheduled.includes("b"));
    assert.ok(result.unscheduled.includes("c"));
  });

  it("pushes tasks without order after ordered tasks", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 3);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "10:00" }] }
    ];
    const deadline = shiftDate(now, 0, 23, 59);
    const tasks = [
      {
        id: "ordered",
        title: "Ordered",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 2,
        deadline,
        section: "s1",
        subsection: "sub1",
        order: 1
      },
      {
        id: "missing",
        title: "Missing order",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        priority: 2,
        deadline,
        section: "s1",
        subsection: "sub1"
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "ordered");
    assert.ok(result.unscheduled.includes("missing"));
  });

  it("avoids overlapping tasks across TimeMaps", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 3);
    const timeMaps = [
      { id: "tm-a", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] },
      { id: "tm-b", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] }
    ];
    const deadline = shiftDate(now, 0, 23, 59);
    const tasks = [
      {
        id: "t1",
        title: "Task 1",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-a"],
        deadline
      },
      {
        id: "t2",
        title: "Task 2",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-b"],
        deadline
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    const placements = [...result.scheduled].sort((a, b) => a.start - b.start);
    assert.strictEqual(placements.length, 2);
    assert.ok(placements[0].end <= placements[1].start);
  });

  it("enforces sequential subtask ordering", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 4);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        completed: true,
        subtaskScheduleMode: "sequential"
      },
      {
        id: "child-1",
        title: "First",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      },
      {
        id: "child-2",
        title: "Second",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 2
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    const placements = [...result.scheduled].sort((a, b) => a.start - b.start);
    assert.strictEqual(placements.length, 2);
    assert.strictEqual(placements[0].taskId, "child-1");
    assert.strictEqual(placements[1].taskId, "child-2");
    assert.strictEqual(placements[0].start.getHours(), 9);
    assert.strictEqual(placements[1].start.getHours(), 10);
  });

  it("orders nested subtasks under sequential parents by subtree order", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 4);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        completed: true,
        subtaskScheduleMode: "sequential"
      },
      {
        id: "child-1",
        title: "Unit test",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      },
      {
        id: "child-2",
        title: "MR task",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 2
      },
      {
        id: "child-3",
        title: "WDIO test",
        completed: true,
        subtaskParentId: "parent",
        order: 3
      },
      {
        id: "grandchild-1",
        title: "Verification tasks",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "child-3",
        order: 1
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    const placements = [...result.scheduled].sort((a, b) => a.start - b.start);
    assert.strictEqual(placements.length, 3);
    assert.strictEqual(placements[0].taskId, "child-1");
    assert.strictEqual(placements[1].taskId, "child-2");
    assert.strictEqual(placements[2].taskId, "grandchild-1");
  });

  it("requires single blocks for sequential one-at-a-time subtasks", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 5);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const busy = [
      { start: shiftDate(now, 0, 10, 0), end: shiftDate(now, 0, 11, 0) }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        completed: true,
        subtaskScheduleMode: "sequential-single"
      },
      {
        id: "child-1",
        title: "Single",
        durationMin: 90,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy,
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 0);
    assert.ok(result.unscheduled.includes("child-1"));
  });

  it("schedules only one subtask for sequential one-at-a-time parents", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 2);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "12:00" }] }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        completed: true,
        subtaskScheduleMode: "sequential-single"
      },
      {
        id: "child-1",
        title: "First",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      },
      {
        id: "child-2",
        title: "Second",
        durationMin: 60,
        minBlockMin: 60,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 2
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "child-1");
    assert.ok(result.deferred.includes("child-2"));
  });

  it("skips scheduling parent tasks that have subtasks", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59)
      },
      {
        id: "child-1",
        title: "Child",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.ok(!result.ignored.includes("parent"));
    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "child-1");
  });

  it("schedules parents once all subtasks are completed", () => {
    const now = nextWeekday(new Date(2026, 0, 1), 1);
    const timeMaps = [
      { id: "tm-1", rules: [{ day: now.getDay(), startTime: "09:00", endTime: "11:00" }] }
    ];
    const tasks = [
      {
        id: "parent",
        title: "Parent",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59)
      },
      {
        id: "child-1",
        title: "Child",
        completed: true,
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        deadline: shiftDate(now, 0, 23, 59),
        subtaskParentId: "parent",
        order: 1
      }
    ];

    const result = scheduleTasks({
      tasks,
      timeMaps,
      busy: [],
      schedulingHorizonDays: 1,
      now
    });

    assert.strictEqual(result.scheduled.length, 1);
    assert.strictEqual(result.scheduled[0].taskId, "parent");
  });
});
