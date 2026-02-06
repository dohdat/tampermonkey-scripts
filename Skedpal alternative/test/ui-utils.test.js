import assert from "assert";
import { describe, it } from "mocha";
import { setTimeout as realSetTimeout, clearTimeout as realClearTimeout } from "timers";

import {
  applyPrioritySelectColor,
  buildInheritedSubtaskUpdate,
  getInheritedSubtaskFields,
  getCalendarSyncSettings,
  getLocalDateKey,
  getNextOrder,
  getNextSubtaskOrder,
  getNthWeekday,
  getSectionColorMap,
  getSubsectionDescendantIds,
  getTaskAndDescendants,
  getTaskDepth,
  getWeekdayShortLabel,
  isExternalCalendarTimeMapId,
  isStartAfterDeadline,
  isStartFromNotToday,
  normalizeHorizonDays,
  normalizeSubtaskScheduleMode,
  normalizeTimeMap,
  parseCalendarViewFromUrl,
  parseLocalDateInput,
  parseNewTaskFromUrl,
  parseViewFromUrl,
  parseZoomFromUrl,
  renderInBatches,
  resolveRepeatAnchor,
  resolveTimeMapIdsAfterDelete,
  sortTasksByHierarchy,
  sortTasksByOrder,
  splitTimeMapIds,
  updateUrlWithCalendarView,
  updateUrlWithView,
  updateUrlWithZoom,
  debounce,
  toggleClearButtonVisibility,
  uuid,
  formatDate,
  formatDateTime,
  formatDurationLong,
  formatDurationShort,
  formatOrdinal,
  formatRRuleDate,
  getContainerKey
} from "../src/ui/utils.js";
import {
  EXTERNAL_CALENDAR_TIMEMAP_PREFIX,
  INDEX_NOT_FOUND,
  SUBTASK_SCHEDULE_PARALLEL,
  SUBTASK_SCHEDULE_SEQUENTIAL,
  SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE,
  TASK_REPEAT_NONE,
  TASK_STATUS_UNSCHEDULED
} from "../src/ui/constants.js";

function createInput(value = "") {
  return { value };
}

function createButton() {
  const classes = new Set();
  return {
    classList: {
      toggle: (name, force) => {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains: (name) => classes.has(name)
    }
  };
}

describe("toggleClearButtonVisibility", () => {
  it("hides the button when the input is empty", () => {
    const input = createInput("");
    const button = createButton();
    const result = toggleClearButtonVisibility(input, button);
    assert.strictEqual(result, false);
    assert.strictEqual(button.classList.contains("hidden"), true);
  });

  it("shows the button when the input has content", () => {
    const input = createInput("https://example.com");
    const button = createButton();
    const result = toggleClearButtonVisibility(input, button);
    assert.strictEqual(result, true);
    assert.strictEqual(button.classList.contains("hidden"), false);
  });

  it("returns false when elements are missing", () => {
    const result = toggleClearButtonVisibility(null, null);
    assert.strictEqual(result, false);
  });
});

describe("url helpers", () => {
  const originalWindow = global.window;
  const originalHistory = global.history;

  const setUrl = (nextUrl) => {
    global.window.location.href = nextUrl;
  };

  before(() => {
    global.window = { location: { href: "https://example.com/" } };
    global.history = {
      replaceState: (_state, _title, url) => setUrl(String(url)),
      pushState: (_state, _title, url) => setUrl(String(url))
    };
  });

  after(() => {
    global.window = originalWindow;
    global.history = originalHistory;
  });

  it("updates zoom params and parses them", () => {
    updateUrlWithZoom({ type: "section", sectionId: "s1" });
    assert.strictEqual(parseZoomFromUrl().sectionId, "s1");
    updateUrlWithZoom({ type: "subsection", sectionId: "s1", subsectionId: "sub1" }, { replace: false });
    const parsedSub = parseZoomFromUrl();
    assert.strictEqual(parsedSub.subsectionId, "sub1");
    updateUrlWithZoom({ type: "task", taskId: "t1", sectionId: "s2", subsectionId: "sub2" });
    const parsedTask = parseZoomFromUrl();
    assert.strictEqual(parsedTask.taskId, "t1");
    updateUrlWithZoom(null);
    assert.strictEqual(parseZoomFromUrl(), null);
  });

  it("returns null for unknown zoom types", () => {
    setUrl("https://example.com/?zoom=unknown:abc");
    assert.strictEqual(parseZoomFromUrl(), null);
  });

  it("updates view params and parses them", () => {
    setUrl("https://example.com/?zoom=section:s1");
    updateUrlWithView("calendar", { replace: false });
    const url = new URL(global.window.location.href);
    assert.strictEqual(url.searchParams.get("view"), "calendar");
    assert.strictEqual(url.searchParams.get("zoom"), null);
    updateUrlWithView("tasks");
    assert.strictEqual(parseViewFromUrl("calendar"), "tasks");
    updateUrlWithView(null);
    assert.strictEqual(parseViewFromUrl("tasks"), "tasks");
  });

  it("parses new task params when enabled", () => {
    setUrl("https://example.com/?newTask=1&title=Hello&url=https%3A%2F%2Fexample.com");
    assert.deepStrictEqual(parseNewTaskFromUrl(), {
      title: "Hello",
      link: "https://example.com"
    });
    setUrl("https://example.com/?newTask=0");
    assert.strictEqual(parseNewTaskFromUrl(), null);
  });

  it("updates calendar view params", () => {
    updateUrlWithCalendarView("week");
    assert.strictEqual(parseCalendarViewFromUrl("day"), "week");
    updateUrlWithCalendarView(null);
    assert.strictEqual(parseCalendarViewFromUrl("day"), "day");
  });

  it("returns default calendar view for unsupported values", () => {
    setUrl("https://example.com/?calendarView=year");
    assert.strictEqual(parseCalendarViewFromUrl("day"), "day");
  });
});

describe("ids, formatting, and time maps", () => {
  const originalCrypto = global.crypto;

  afterEach(() => {
    global.crypto = originalCrypto;
  });

  it("uses crypto uuid when available", () => {
    global.crypto = { randomUUID: () => "uuid-123" };
    assert.strictEqual(uuid(), "uuid-123");
  });

  it("falls back to Math.random for uuid", () => {
    global.crypto = {};
    const value = uuid();
    assert.strictEqual(typeof value, "string");
    assert.ok(value.length > 0);
  });

  it("normalizes time maps from rules or days", () => {
    const normalizedRules = normalizeTimeMap({ rules: [{ day: "2", startTime: "08:00", endTime: "10:00" }] });
    assert.strictEqual(normalizedRules.rules[0].day, 2);
    const normalizedDays = normalizeTimeMap({ days: ["1", 3], startTime: "07:00", endTime: "09:00" });
    assert.deepStrictEqual(normalizedDays.rules, [
      { day: 1, startTime: "07:00", endTime: "09:00" },
      { day: 3, startTime: "07:00", endTime: "09:00" }
    ]);
  });

  it("splits external calendar time map ids", () => {
    const externalId = `${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`;
    const { timeMapIds, externalCalendarIds } = splitTimeMapIds([externalId, "tm-1"]);
    assert.deepStrictEqual(timeMapIds, ["tm-1"]);
    assert.deepStrictEqual(externalCalendarIds, ["cal-1"]);
    assert.strictEqual(isExternalCalendarTimeMapId(externalId), true);
  });

  it("formats dates and durations", () => {
    const dateValue = "2026-01-06T10:00:00.000Z";
    assert.strictEqual(formatDateTime(dateValue), new Date(dateValue).toLocaleString());
    assert.strictEqual(formatDate("2026-01-06"), new Date(2026, 0, 6).toLocaleDateString());
    assert.strictEqual(formatDate("not-a-date"), "Invalid Date");
    assert.strictEqual(formatDurationShort(0), "1m");
    assert.strictEqual(formatDurationShort(90), "1.5h");
    assert.strictEqual(formatDurationLong(0), "0m");
    assert.strictEqual(formatDurationLong(60), "1h");
    assert.strictEqual(formatDurationLong(75), "1h 15m");
  });

  it("formats ordinals and rrule dates", () => {
    assert.strictEqual(formatOrdinal(1), "1st");
    assert.strictEqual(formatOrdinal(2), "2nd");
    assert.strictEqual(formatOrdinal(3), "3rd");
    assert.strictEqual(formatOrdinal(4), "4th");
    assert.strictEqual(formatOrdinal(INDEX_NOT_FOUND), "last");
    assert.strictEqual(formatRRuleDate(""), "");
    assert.strictEqual(formatRRuleDate("2026-01-06T12:00:00Z"), "20260106");
  });
});

describe("getLocalDateKey", () => {
  it("returns a yyyy-mm-dd key for valid dates", () => {
    const key = getLocalDateKey(new Date(2026, 0, 6, 15, 30, 0));
    assert.strictEqual(key, "2026-01-06");
  });

  it("returns an empty string for invalid values", () => {
    assert.strictEqual(getLocalDateKey("not-a-date"), "");
  });
});

describe("date parsing helpers", () => {
  it("detects start-from dates after today", () => {
    const now = new Date(2026, 0, 6);
    const future = new Date(2026, 0, 10);
    assert.strictEqual(isStartFromNotToday(future.toISOString(), now), true);
    assert.strictEqual(isStartFromNotToday("invalid", now), false);
  });

  it("parses local date inputs", () => {
    const iso = parseLocalDateInput("2026-01-06");
    assert.strictEqual(typeof iso, "string");
    assert.strictEqual(parseLocalDateInput("2026-02-30"), null);
  });

  it("detects start dates after deadlines", () => {
    assert.strictEqual(isStartAfterDeadline("2026-01-10", "2026-01-09"), true);
    assert.strictEqual(isStartAfterDeadline("invalid", "2026-01-09"), false);
  });
});

describe("getInheritedSubtaskFields", () => {
  it("returns shared scheduling fields from a parent task", () => {
    const parent = {
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 4,
      minBlockMin: 45,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z",
      repeat: { type: "weekly", interval: 2 },
      subtaskScheduleMode: "sequential"
    };
    assert.deepStrictEqual(getInheritedSubtaskFields(parent), {
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 4,
      minBlockMin: 45,
      deadline: "2026-01-06T00:00:00.000Z",
      startFrom: "2026-01-05T00:00:00.000Z",
      repeat: { type: "weekly", interval: 2 },
      subtaskScheduleMode: "sequential"
    });
  });

  it("returns an empty object for missing parent tasks", () => {
    assert.deepStrictEqual(getInheritedSubtaskFields(null), {});
  });
});

describe("normalizeHorizonDays", () => {
  it("returns the parsed value when inside the range", () => {
    assert.strictEqual(normalizeHorizonDays("21", 1, 60, 14), 21);
  });

  it("clamps values below the minimum", () => {
    assert.strictEqual(normalizeHorizonDays(0, 1, 60, 14), 1);
  });

  it("clamps values above the maximum", () => {
    assert.strictEqual(normalizeHorizonDays(120, 1, 60, 14), 60);
  });

  it("falls back for invalid values", () => {
    assert.strictEqual(normalizeHorizonDays("nope", 1, 60, 14), 14);
  });
});

describe("subtask inheritance updates", () => {
  it("builds a child update for inherited fields", () => {
    const parent = {
      id: "parent-1",
      section: "s1",
      subsection: "sub1",
      timeMapIds: ["tm-1"],
      priority: 2,
      minBlockMin: 15,
      deadline: "2026-01-10T00:00:00.000Z",
      startFrom: "2026-01-08T00:00:00.000Z",
      repeat: { type: "weekly", interval: 1 },
      subtaskScheduleMode: SUBTASK_SCHEDULE_SEQUENTIAL
    };
    const child = { id: "child-1", title: "Child task" };
    const update = buildInheritedSubtaskUpdate(child, parent);
    assert.strictEqual(update.subtaskParentId, "parent-1");
    assert.strictEqual(update.scheduleStatus, TASK_STATUS_UNSCHEDULED);
    assert.deepStrictEqual(update.timeMapIds, ["tm-1"]);
  });

  it("returns null for missing inputs", () => {
    assert.strictEqual(buildInheritedSubtaskUpdate(null, null), null);
  });
});

describe("getCalendarSyncSettings", () => {
  it("normalizes sync settings against the scheduling horizon", () => {
    const settings = {
      schedulingHorizonDays: 7,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 14 }
      }
    };
    const resolved = getCalendarSyncSettings(settings);
    assert.deepStrictEqual(resolved["cal-1"], {
      syncScheduledEvents: true,
      syncDays: 7
    });
  });

  it("returns an empty object when settings are missing", () => {
    assert.deepStrictEqual(getCalendarSyncSettings(null), {});
  });

  it("ignores invalid calendar entries", () => {
    const settings = {
      schedulingHorizonDays: 10,
      googleCalendarTaskSettings: {
        "": null,
        "cal-1": "bad",
        "cal-2": { syncScheduledEvents: false, syncDays: 3 }
      }
    };
    const resolved = getCalendarSyncSettings(settings);
    assert.deepStrictEqual(resolved["cal-2"], { syncScheduledEvents: false, syncDays: 3 });
    assert.strictEqual(resolved["cal-1"], undefined);
  });
});

describe("applyPrioritySelectColor", () => {
  it("sets a data priority based on the select value", () => {
    const select = { value: "4", dataset: {} };
    applyPrioritySelectColor(select);
    assert.strictEqual(select.dataset.priority, "4");
  });

  it("clears the data priority for invalid values", () => {
    const select = { value: "nope", dataset: {} };
    applyPrioritySelectColor(select);
    assert.strictEqual(select.dataset.priority, "");
  });
});

describe("renderInBatches", () => {
  it("renders items in batches and calls onComplete", async () => {
    const items = [1, 2, 3, 4, 5];
    const batches = [];
    await new Promise((resolve) => {
      renderInBatches({
        items,
        batchSize: 2,
        renderBatch: (batch) => batches.push([...batch]),
        onComplete: resolve
      });
    });
    assert.deepStrictEqual(batches, [[1, 2], [3, 4], [5]]);
  });

  it("stops when shouldCancel returns true", (done) => {
    const items = [1, 2, 3];
    let calls = 0;
    let completed = false;
    renderInBatches({
      items,
      batchSize: 2,
      shouldCancel: () => calls > 0,
      renderBatch: () => {
        calls += 1;
      },
      onComplete: () => {
        completed = true;
      }
    });
    setTimeout(() => {
      assert.strictEqual(calls, 1);
      assert.strictEqual(completed, false);
      done();
    }, 20);
  });

  it("ignores invalid inputs safely", () => {
    let called = false;
    renderInBatches({ items: "nope", renderBatch: () => { called = true; } });
    renderInBatches({ items: [1, 2], renderBatch: null });
    assert.strictEqual(called, false);
  });

  it("calls onComplete for empty item lists", (done) => {
    renderInBatches({
      items: [],
      renderBatch: () => {},
      onComplete: done
    });
  });
});

describe("debounce", () => {
  it("invokes once with the latest args", (done) => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    const calls = [];
    const debounced = debounce((value) => calls.push(value), 20);
    debounced("first");
    debounced("second");
    setTimeout(() => {
      assert.deepStrictEqual(calls, ["second"]);
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      done();
    }, 40);
  });

  it("cancels pending callbacks", (done) => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    let called = false;
    const debounced = debounce(() => {
      called = true;
    }, 20);
    debounced();
    debounced.cancel();
    setTimeout(() => {
      assert.strictEqual(called, false);
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      done();
    }, 40);
  });

  it("handles cancel calls with no pending timeout", () => {
    const debounced = debounce(() => {}, 10);
    debounced.cancel();
  });
});

describe("repeat anchors and schedule modes", () => {
  it("resolves repeat anchors from existing values", () => {
    const repeat = { type: "weekly", unit: "week" };
    const existing = new Date(2026, 0, 6).toISOString();
    assert.strictEqual(resolveRepeatAnchor({ repeat, existingAnchor: existing }), existing);
  });

  it("returns null when repeat is disabled", () => {
    assert.strictEqual(resolveRepeatAnchor({ repeat: { type: TASK_REPEAT_NONE, unit: TASK_REPEAT_NONE } }), null);
  });

  it("normalizes subtask schedule modes", () => {
    assert.strictEqual(normalizeSubtaskScheduleMode(SUBTASK_SCHEDULE_PARALLEL), SUBTASK_SCHEDULE_PARALLEL);
    assert.strictEqual(normalizeSubtaskScheduleMode(SUBTASK_SCHEDULE_SEQUENTIAL), SUBTASK_SCHEDULE_SEQUENTIAL);
    assert.strictEqual(normalizeSubtaskScheduleMode(SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE), SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE);
    assert.strictEqual(normalizeSubtaskScheduleMode("nope"), SUBTASK_SCHEDULE_PARALLEL);
  });
});

describe("task ordering helpers", () => {
  it("sorts tasks by order then title", () => {
    const tasks = [
      { id: "a", order: 2, title: "Zed" },
      { id: "b", order: 2, title: "Alpha" },
      { id: "c", title: "Missing order" }
    ];
    const sorted = sortTasksByOrder(tasks);
    assert.deepStrictEqual(sorted.map((task) => task.id), ["b", "a", "c"]);
  });

  it("sorts tasks by hierarchy", () => {
    const tasks = [
      { id: "p1", order: 1 },
      { id: "c1", order: 2, subtaskParentId: "p1" },
      { id: "p2", order: 3 }
    ];
    const sorted = sortTasksByHierarchy(tasks);
    assert.deepStrictEqual(sorted.map((task) => task.id), ["p1", "c1", "p2"]);
  });

  it("adds orphan tasks to the end of the hierarchy", () => {
    const tasks = [
      { id: "orphan", subtaskParentId: "missing" },
      { id: "root" }
    ];
    const sorted = sortTasksByHierarchy(tasks);
    assert.deepStrictEqual(sorted.map((task) => task.id), ["orphan", "root"]);
  });

  it("handles cyclic task hierarchies", () => {
    const tasks = [
      { id: "a", subtaskParentId: "b" },
      { id: "b", subtaskParentId: "a" }
    ];
    const sorted = sortTasksByHierarchy(tasks);
    assert.deepStrictEqual(sorted.map((task) => task.id), ["a", "b"]);
  });

  it("returns shallow copies for single task lists", () => {
    const tasks = [{ id: "only" }];
    const sorted = sortTasksByHierarchy(tasks);
    assert.deepStrictEqual(sorted, tasks);
  });
});

describe("task order helpers", () => {
  it("builds container keys and next order values", () => {
    assert.strictEqual(getContainerKey("s1", "sub1"), "s1__sub1");
    const tasks = [
      { id: "t1", section: "s1", subsection: "sub1", order: 2 },
      { id: "t2", section: "s1", subsection: "sub2", order: 5 }
    ];
    assert.strictEqual(getNextOrder("s1", "sub1", tasks), 3);
  });

  it("computes next subtask orders", () => {
    const parent = { id: "p1", order: 4 };
    const tasks = [
      { id: "c1", section: "s1", subsection: "sub1", subtaskParentId: "p1", order: 4.01 },
      { id: "t1", section: "s1", subsection: "sub1", order: 2 }
    ];
    assert.ok(getNextSubtaskOrder(parent, "s1", "sub1", tasks) > parent.order);
    assert.strictEqual(getNextSubtaskOrder(null, "s1", "sub1", tasks), 5.01);
  });
});

describe("task tree helpers", () => {
  it("calculates task depth", () => {
    const tasks = [
      { id: "p1" },
      { id: "c1", subtaskParentId: "p1" },
      { id: "c2", subtaskParentId: "c1" }
    ];
    assert.strictEqual(getTaskDepth("c2", tasks), 2);
    assert.strictEqual(getTaskDepth("", tasks), 0);
  });

  it("returns task descendants in order", () => {
    const tasks = [
      { id: "p1" },
      { id: "c1", subtaskParentId: "p1" },
      { id: "c2", subtaskParentId: "c1" }
    ];
    const result = getTaskAndDescendants("p1", tasks);
    assert.deepStrictEqual(result.map((task) => task.id), ["p1", "c1", "c2"]);
    assert.deepStrictEqual(getTaskAndDescendants("", tasks), []);
  });
});

describe("subsection and weekday helpers", () => {
  it("collects subsection descendants", () => {
    const subs = [
      { id: "root", parentId: "" },
      { id: "child1", parentId: "root" },
      { id: "child2", parentId: "child1" }
    ];
    const ids = getSubsectionDescendantIds(subs, "root");
    assert.strictEqual(ids.has("root"), true);
    assert.strictEqual(ids.has("child2"), true);
    assert.strictEqual(getSubsectionDescendantIds(subs, "").size, 0);
  });

  it("returns weekday labels and nth weekday values", () => {
    assert.strictEqual(getWeekdayShortLabel(5), "Fri");
    assert.strictEqual(getWeekdayShortLabel(20), "Sun");
    const fifthWeek = getNthWeekday(new Date(2026, 7, 29));
    assert.strictEqual(fifthWeek.nth, INDEX_NOT_FOUND);
  });
});

describe("section color mapping", () => {
  it("builds deterministic color maps", () => {
    const map = getSectionColorMap([{ id: "s1" }, { id: "s2" }]);
    assert.strictEqual(map.size, 2);
    const entry = map.get("s1");
    assert.ok(entry.dot.includes("hsl"));
    assert.ok(entry.glow.includes("hsla"));
  });

  it("retries hues when seeds collide", () => {
    const map = getSectionColorMap([{ id: "dup" }, { id: "dup" }]);
    assert.ok(map.has("dup"));
  });
});

describe("resolveTimeMapIdsAfterDelete", () => {
  it("keeps existing ids and removes deleted ones", () => {
    const task = { timeMapIds: ["tm-1", "tm-2"] };
    const settings = { defaultTimeMapId: "tm-3" };
    const timeMaps = [{ id: "tm-1" }, { id: "tm-3" }];
    const resolved = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-2");
    assert.deepStrictEqual(resolved, ["tm-1"]);
  });

  it("falls back to templates or defaults", () => {
    const task = { section: "s1", subsection: "sub1", timeMapIds: ["tm-2"] };
    const settings = {
      defaultTimeMapId: "tm-3",
      subsections: {
        s1: [{ id: "sub1", template: { timeMapIds: ["tm-4"] } }]
      }
    };
    const timeMaps = [{ id: "tm-3" }, { id: "tm-4" }];
    const resolved = resolveTimeMapIdsAfterDelete(task, settings, timeMaps, "tm-2");
    assert.deepStrictEqual(resolved, ["tm-4"]);
  });

  it("falls back to first available time map ids", () => {
    const task = { timeMapIds: [] };
    const resolved = resolveTimeMapIdsAfterDelete(task, {}, [{ id: "tm-9" }], "");
    assert.deepStrictEqual(resolved, ["tm-9"]);
  });

  it("preserves external calendar ids when resolving time maps", () => {
    const externalId = `${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`;
    const task = { timeMapIds: [externalId] };
    const resolved = resolveTimeMapIdsAfterDelete(task, {}, [], "");
    assert.deepStrictEqual(resolved, [externalId]);
  });
});
