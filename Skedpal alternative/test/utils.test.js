import assert from "assert";
import { describe, it } from "mocha";

const {
  updateUrlWithZoom,
  parseZoomFromUrl,
  updateUrlWithView,
  parseViewFromUrl,
  parseNewTaskFromUrl,
  updateUrlWithCalendarView,
  parseCalendarViewFromUrl,
  normalizeTimeMap,
  formatDateTime,
  formatDate,
  formatRRuleDate,
  formatDurationShort,
  formatDurationLong,
  getWeekdayShortLabel,
  getNthWeekday,
  formatOrdinal,
  getSectionColorMap,
  parseLocalDateInput,
  isStartAfterDeadline,
  sortTasksByOrder,
  sortTasksByHierarchy,
  getNextOrder,
  getNextSubtaskOrder,
  getTaskDepth,
  getTaskAndDescendants,
  getSubsectionDescendantIds,
  normalizeSubtaskScheduleMode,
  resolveTimeMapIdsAfterDelete
} = await import("../src/ui/utils.js");
const { formatLocalDateInputValue, parseTitleDates } = await import(
  "../src/ui/title-date-utils.js"
);

describe("utils date parsing", () => {
  it("parses date input as local midnight ISO", () => {
    const iso = parseLocalDateInput("2026-01-07");
    assert.ok(iso);
    const parsed = new Date(iso);
    assert.strictEqual(parsed.getFullYear(), 2026);
    assert.strictEqual(parsed.getMonth(), 0);
    assert.strictEqual(parsed.getDate(), 7);
    assert.strictEqual(parsed.getHours(), 0);
  });

  it("returns null for invalid input", () => {
    assert.strictEqual(parseLocalDateInput(""), null);
    assert.strictEqual(parseLocalDateInput("2026-13-99"), null);
  });

  it("detects start after deadline", () => {
    assert.strictEqual(isStartAfterDeadline("2026-01-08", "2026-01-07"), true);
    assert.strictEqual(isStartAfterDeadline("2026-01-07", "2026-01-07"), false);
    assert.strictEqual(isStartAfterDeadline("", "2026-01-07"), false);
  });

  it("formats local date input values", () => {
    const date = new Date(2026, 0, 9, 13, 45, 0);
    assert.strictEqual(formatLocalDateInputValue(date), "2026-01-09");
  });

  it("returns empty for invalid local date input values", () => {
    const badDate = new Date("bad");
    assert.strictEqual(formatLocalDateInputValue(badDate), "");
  });

  it("extracts deadlines from titles", () => {
    const referenceDate = new Date(2026, 0, 5, 9, 0, 0);
    const parsed = parseTitleDates("Pay rent tomorrow", { referenceDate });
    assert.strictEqual(parsed.title, "Pay rent");
    assert.strictEqual(parsed.deadline, parseLocalDateInput("2026-01-06"));
    assert.strictEqual(parsed.startFrom, null);
    assert.strictEqual(parsed.hasDate, true);
  });

  it("extracts start dates from titles with start keywords", () => {
    const referenceDate = new Date(2026, 0, 5, 9, 0, 0);
    const parsed = parseTitleDates("From next Monday Roadmap", { referenceDate });
    assert.strictEqual(parsed.title, "Roadmap");
    assert.strictEqual(parsed.startFrom, parseLocalDateInput("2026-01-12"));
    assert.strictEqual(parsed.deadline, null);
    assert.strictEqual(parsed.hasDate, true);
  });

  it("handles titles without dates", () => {
    const parsed = parseTitleDates("Plain title");
    assert.strictEqual(parsed.title, "Plain title");
    assert.strictEqual(parsed.startFrom, null);
    assert.strictEqual(parsed.deadline, null);
    assert.strictEqual(parsed.hasDate, false);
  });

  it("keeps empty titles empty when parsing", () => {
    const parsed = parseTitleDates("   ");
    assert.strictEqual(parsed.title, "");
    assert.strictEqual(parsed.hasDate, false);
  });

  it("handles non-string titles when parsing", () => {
    const parsed = parseTitleDates(null);
    assert.strictEqual(parsed.title, "");
    assert.strictEqual(parsed.hasDate, false);
  });

  it("extracts deadline when deadline keywords are used", () => {
    const referenceDate = new Date(2026, 0, 5, 9, 0, 0);
    const parsed = parseTitleDates("Due tomorrow Report", { referenceDate });
    assert.strictEqual(parsed.title, "Report");
    assert.strictEqual(parsed.deadline, parseLocalDateInput("2026-01-06"));
  });

  it("extracts ranges when both start and end are present", () => {
    const parsed = parseTitleDates("Vacation Jan 10 2026 to Jan 12 2026");
    assert.strictEqual(parsed.title, "Vacation");
    assert.strictEqual(parsed.startFrom, parseLocalDateInput("2026-01-10"));
    assert.strictEqual(parsed.deadline, parseLocalDateInput("2026-01-12"));
    assert.strictEqual(parsed.hasDate, true);
  });

  it("keeps the title when only a date is provided", () => {
    const referenceDate = new Date(2026, 0, 5, 9, 0, 0);
    const parsed = parseTitleDates("tomorrow", { referenceDate });
    assert.strictEqual(parsed.title, "tomorrow");
    assert.strictEqual(parsed.deadline, parseLocalDateInput("2026-01-06"));
  });
});

describe("utils url helpers", () => {
  it("round-trips zoom params", () => {
    global.window = { location: { href: "https://example.com/app" } };
    global.history = {
      replaceState: (_state, _title, url) => {
        global.window.location.href = url;
      }
    };

    updateUrlWithZoom({ type: "section", sectionId: "s1" });
    assert.deepStrictEqual(parseZoomFromUrl(), { type: "section", sectionId: "s1" });

    updateUrlWithZoom({ type: "subsection", sectionId: "s2", subsectionId: "sub1" });
    assert.deepStrictEqual(parseZoomFromUrl(), {
      type: "subsection",
      sectionId: "s2",
      subsectionId: "sub1"
    });

    updateUrlWithZoom({ type: "task", taskId: "t1", sectionId: "s3", subsectionId: "sub2" });
    assert.deepStrictEqual(parseZoomFromUrl(), {
      type: "task",
      taskId: "t1",
      sectionId: "s3",
      subsectionId: "sub2"
    });

    updateUrlWithZoom(null);
    assert.strictEqual(parseZoomFromUrl(), null);

    global.window.location.href = "https://example.com/app?zoom=weird:thing";
    assert.strictEqual(parseZoomFromUrl(), null);
  });

  it("updates and reads view params", () => {
    global.window = { location: { href: "https://example.com/app?view=tasks" } };
    global.history = {
      replaceState: (_state, _title, url) => {
        global.window.location.href = url;
      }
    };

    updateUrlWithView("schedule");
    assert.strictEqual(parseViewFromUrl(), "schedule");

    updateUrlWithView("");
    assert.strictEqual(parseViewFromUrl("tasks"), "tasks");
  });

  it("clears zoom when switching away from tasks view", () => {
    global.window = {
      location: { href: "https://example.com/app?view=tasks&zoom=task:t1:s1:sub1" }
    };
    global.history = {
      replaceState: (_state, _title, url) => {
        global.window.location.href = url;
      }
    };

    updateUrlWithView("calendar");
    assert.strictEqual(parseViewFromUrl(), "calendar");
    assert.strictEqual(parseZoomFromUrl(), null);
  });

  it("reads new task params", () => {
    global.window = {
      location: { href: "https://example.com/app?newTask=1&title=Hello&url=https%3A%2F%2Fexample.com" }
    };
    assert.deepStrictEqual(parseNewTaskFromUrl(), {
      title: "Hello",
      link: "https://example.com"
    });

    global.window = { location: { href: "https://example.com/app?newTask=0" } };
    assert.strictEqual(parseNewTaskFromUrl(), null);
  });

  it("pushes history entries when replace is false", () => {
    global.window = { location: { href: "https://example.com/app?view=tasks" } };
    let pushed = 0;
    let replaced = 0;
    global.history = {
      pushState: (_state, _title, url) => {
        pushed += 1;
        global.window.location.href = url;
      },
      replaceState: (_state, _title, url) => {
        replaced += 1;
        global.window.location.href = url;
      }
    };

    updateUrlWithView("calendar", { replace: false });
    assert.strictEqual(pushed, 1);
    assert.strictEqual(replaced, 0);

    updateUrlWithZoom({ type: "section", sectionId: "s1" }, { replace: false });
    assert.strictEqual(pushed, 2);
    assert.strictEqual(parseViewFromUrl(), "calendar");
  });

  it("updates and reads calendar view params", () => {
    global.window = {
      location: { href: "https://example.com/app?view=calendar&calendarView=day" }
    };
    global.history = {
      replaceState: (_state, _title, url) => {
        global.window.location.href = url;
      }
    };

    updateUrlWithCalendarView("three");
    assert.strictEqual(parseCalendarViewFromUrl("day"), "three");

    updateUrlWithCalendarView("week");
    assert.strictEqual(parseCalendarViewFromUrl("day"), "week");

    updateUrlWithCalendarView("");
    assert.strictEqual(parseCalendarViewFromUrl("day"), "day");
  });
});

describe("utils normalization helpers", () => {
  it("normalizes time map rules and days", () => {
    const withRules = normalizeTimeMap({ id: "tm-1", rules: [{ day: "2", startTime: "09:00" }] });
    assert.strictEqual(withRules.rules[0].day, 2);

    const withDays = normalizeTimeMap({ id: "tm-2", days: [1, "3"], startTime: "08:00", endTime: "10:00" });
    assert.deepStrictEqual(withDays.rules, [
      { day: 1, startTime: "08:00", endTime: "10:00" },
      { day: 3, startTime: "08:00", endTime: "10:00" }
    ]);
  });
});

describe("utils formatting helpers", () => {
  it("handles date formatting fallbacks", () => {
    assert.strictEqual(formatDateTime(""), "No date");
    assert.strictEqual(formatDateTime("bad"), "Invalid Date");
    assert.strictEqual(formatDate("bad"), "Invalid Date");
    assert.strictEqual(
      formatDate("2026-11-01"),
      new Date(2026, 10, 1).toLocaleDateString()
    );
    assert.ok(formatRRuleDate("2026-01-07T00:00:00").startsWith("2026"));
    assert.strictEqual(formatRRuleDate("bad"), "");
  });

  it("formats short durations and labels", () => {
    assert.strictEqual(formatDurationShort(0), "1m");
    assert.strictEqual(formatDurationShort(30), "30m");
    assert.strictEqual(formatDurationShort(90), "1.5h");
    assert.strictEqual(formatDurationLong(0), "0m");
    assert.strictEqual(formatDurationLong(30), "30m");
    assert.strictEqual(formatDurationLong(60), "1h");
    assert.strictEqual(formatDurationLong(210), "3h 30m");
    assert.strictEqual(getWeekdayShortLabel(2), "Tue");
    assert.strictEqual(getWeekdayShortLabel(9), "Sun");
    const lastWeekday = getNthWeekday(new Date(2026, 4, 31));
    assert.strictEqual(lastWeekday.nth, -1);
    assert.strictEqual(formatOrdinal(-1), "last");
    assert.strictEqual(formatOrdinal(1), "1st");
    assert.strictEqual(formatOrdinal(2), "2nd");
    assert.strictEqual(formatOrdinal(3), "3rd");
    assert.strictEqual(formatOrdinal(4), "4th");
  });
});

describe("utils task ordering helpers", () => {
  it("sorts tasks by order and title", () => {
    const sorted = sortTasksByOrder([
      { id: "b", title: "B", order: 2 },
      { id: "a", title: "A", order: 2 },
      { id: "c", title: "C" }
    ]);
    assert.deepStrictEqual(sorted.map((t) => t.id), ["a", "b", "c"]);
  });

  it("gets next orders for containers and subtasks", () => {
    const tasks = [
      { id: "t1", section: "s1", subsection: "", order: 2 },
      { id: "t2", section: "s1", subsection: "", order: 4 },
      { id: "t3", section: "s2", subsection: "", order: 1 },
      { id: "p1", section: "s1", subsection: "", order: 6 },
      { id: "s1", section: "s1", subsection: "", subtaskParentId: "p1", order: 6.01 }
    ];

    assert.strictEqual(getNextOrder("s1", "", tasks), 7.01);
    assert.strictEqual(getNextOrder("s2", "", tasks), 2);
    assert.strictEqual(getNextSubtaskOrder(tasks[3], "s1", "", tasks), 6.02);
    assert.strictEqual(getNextSubtaskOrder(null, "s1", "", tasks), 7.01);
  });

  it("sorts tasks by hierarchy with siblings grouped", () => {
    const tasks = [
      { id: "p1", title: "Parent A", order: 1 },
      { id: "c1", title: "Child A1", subtaskParentId: "p1", order: 1.01 },
      { id: "p2", title: "Parent B", order: 2 },
      { id: "c2", title: "Child B1", subtaskParentId: "p2", order: 2.01 },
      { id: "c3", title: "Child A2", subtaskParentId: "p1", order: 1.02 },
      { id: "orphan", title: "Orphan", subtaskParentId: "missing", order: 3 }
    ];
    const ordered = sortTasksByHierarchy(tasks);
    assert.deepStrictEqual(
      ordered.map((task) => task.id),
      ["p1", "c1", "c3", "p2", "c2", "orphan"]
    );
  });

  it("computes task depth and descendants", () => {
    const tasks = [
      { id: "p1", title: "Parent" },
      { id: "c1", title: "Child", subtaskParentId: "p1" },
      { id: "c2", title: "Child2", subtaskParentId: "c1" }
    ];
    assert.strictEqual(getTaskDepth("c2", tasks), 2);
    assert.strictEqual(getTaskDepth("", tasks), 0);
    const result = getTaskAndDescendants("p1", tasks);
    assert.deepStrictEqual(result.map((t) => t.id), ["p1", "c1", "c2"]);
    assert.deepStrictEqual(getTaskAndDescendants("", tasks), []);
    assert.deepStrictEqual(getTaskAndDescendants("missing", tasks), []);
  });
});

describe("utils subsection helpers", () => {
  it("returns descendant ids for a subsection", () => {
    const subs = [
      { id: "a", parentId: "" },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: "a" }
    ];
    const ids = getSubsectionDescendantIds(subs, "a");
    assert.strictEqual(ids.has("a"), true);
    assert.strictEqual(ids.has("b"), true);
    assert.strictEqual(ids.has("c"), true);
    assert.strictEqual(ids.has("d"), true);
  });

  it("returns empty set when root id is missing", () => {
    const ids = getSubsectionDescendantIds([], "");
    assert.strictEqual(ids.size, 0);
  });
});

describe("utils section colors", () => {
  it("assigns unique colors per section", () => {
    const sections = [
      { id: "s-1", name: "Work" },
      { id: "s-2", name: "Personal" }
    ];
    const colorMap = getSectionColorMap(sections);
    const first = colorMap.get("s-1");
    const second = colorMap.get("s-2");
    assert.ok(first);
    assert.ok(second);
    assert.notStrictEqual(first.dot, second.dot);
    assert.notStrictEqual(first.glow, second.glow);
  });
});

describe("utils timemap fallback", () => {
  it("keeps remaining timemaps when deleting one", () => {
    const task = { timeMapIds: ["tm-1", "tm-2"], section: "s-1", subsection: "" };
    const settings = { defaultTimeMapId: "tm-3", subsections: {} };
    const timeMaps = [{ id: "tm-2" }, { id: "tm-3" }];
    const result = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-1");
    assert.deepStrictEqual(result, ["tm-2"]);
  });

  it("falls back to subsection template before default", () => {
    const task = { timeMapIds: ["tm-1"], section: "s-1", subsection: "sub-1" };
    const settings = {
      defaultTimeMapId: "tm-3",
      subsections: {
        "s-1": [
          { id: "sub-1", template: { timeMapIds: ["tm-2"] } }
        ]
      }
    };
    const timeMaps = [{ id: "tm-2" }, { id: "tm-3" }];
    const result = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-1");
    assert.deepStrictEqual(result, ["tm-2"]);
  });

  it("falls back to default or first available", () => {
    const task = { timeMapIds: ["tm-1"], section: "s-1", subsection: "" };
    const settings = { defaultTimeMapId: "tm-3", subsections: {} };
    const timeMaps = [{ id: "tm-4" }];
    const result = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-1");
    assert.deepStrictEqual(result, ["tm-4"]);
  });

  it("uses default timemap when available", () => {
    const task = { timeMapIds: ["tm-1"], section: "s-1", subsection: "" };
    const settings = { defaultTimeMapId: "tm-3", subsections: {} };
    const timeMaps = [{ id: "tm-3" }];
    const result = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-1");
    assert.deepStrictEqual(result, ["tm-3"]);
  });

  it("returns empty when no timemaps remain", () => {
    const task = { timeMapIds: ["tm-1"], section: "s-1", subsection: "" };
    const settings = { defaultTimeMapId: "", subsections: {} };
    const timeMaps = [];
    const result = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-1");
    assert.deepStrictEqual(result, []);
  });
});

describe("utils subtask scheduling mode", () => {
  it("normalizes invalid schedule mode values", () => {
    assert.strictEqual(normalizeSubtaskScheduleMode("parallel"), "parallel");
    assert.strictEqual(normalizeSubtaskScheduleMode("sequential"), "sequential");
    assert.strictEqual(
      normalizeSubtaskScheduleMode("sequential-single"),
      "sequential-single"
    );
    assert.strictEqual(normalizeSubtaskScheduleMode("invalid"), "parallel");
    assert.strictEqual(normalizeSubtaskScheduleMode(null), "parallel");
  });
});
