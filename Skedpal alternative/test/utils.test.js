import assert from "assert";
import { describe, it, beforeEach } from "mocha";

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: () => null
  };
  global.window = {
    location: { href: "http://localhost/" }
  };
  global.history = {
    replaceState: (_state, _title, url) => {
      global.window.location.href = url;
    }
  };
  global.crypto = {
    randomUUID: () => "test-uuid"
  };
}

installDomStubs();

const utils = await import("../src/ui/utils.js");
const { SUBTASK_ORDER_OFFSET } = await import("../src/ui/constants.js");
const {
  updateUrlWithZoom,
  parseZoomFromUrl,
  updateUrlWithView,
  parseViewFromUrl,
  uuid,
  normalizeTimeMap,
  formatDurationShort,
  getWeekdayShortLabel,
  getNthWeekday,
  formatOrdinal,
  formatRRuleDate,
  sortTasksByOrder,
  getContainerKey,
  getNextOrder,
  getNextSubtaskOrder,
  getTaskDepth,
  getTaskAndDescendants
} = utils;

describe("ui utils", () => {
  beforeEach(() => {
    installDomStubs();
  });
  it("updates and parses zoom/view params", () => {
    updateUrlWithZoom({ type: "section", sectionId: "work" });
    assert.deepStrictEqual(parseZoomFromUrl(), { type: "section", sectionId: "work" });

    updateUrlWithZoom({ type: "task", taskId: "t1", sectionId: "s1", subsectionId: "ss1" });
    assert.deepStrictEqual(parseZoomFromUrl(), {
      type: "task",
      taskId: "t1",
      sectionId: "s1",
      subsectionId: "ss1"
    });

    updateUrlWithZoom(null);
    assert.strictEqual(parseZoomFromUrl(), null);

    updateUrlWithView("schedule");
    assert.strictEqual(parseViewFromUrl(), "schedule");
    updateUrlWithView("");
    assert.strictEqual(parseViewFromUrl("tasks"), "tasks");
  });

  it("formats values and normalizes time maps", () => {
    assert.strictEqual(typeof uuid(), "string");
    assert.strictEqual(formatDurationShort(90), "1.5h");
    assert.strictEqual(formatDurationShort(0), "1m");
    assert.strictEqual(getWeekdayShortLabel(2), "Tue");
    assert.deepStrictEqual(getNthWeekday(new Date(2026, 0, 15)), { nth: 3, weekday: 4 });
    assert.strictEqual(formatOrdinal(1), "1st");
    assert.strictEqual(formatOrdinal(4), "4th");
    assert.strictEqual(formatOrdinal(-1), "last");
    assert.strictEqual(formatRRuleDate("2026-01-05T12:00:00"), "20260105");
    assert.strictEqual(formatRRuleDate("not-a-date"), "");

    const normalizedRules = normalizeTimeMap({
      id: "tm-1",
      rules: [{ day: "2", startTime: "08:00", endTime: "10:00" }]
    });
    assert.strictEqual(typeof normalizedRules.rules[0].day, "number");

    const normalizedDays = normalizeTimeMap({
      id: "tm-2",
      days: [1, 3],
      startTime: "09:00",
      endTime: "11:00"
    });
    assert.strictEqual(normalizedDays.rules.length, 2);
  });

  it("orders tasks and walks task trees", () => {
    const parent = { id: "p1", title: "Parent", order: 2, section: "s1", subsection: "" };
    const child = {
      id: "c1",
      title: "Child",
      order: parent.order + SUBTASK_ORDER_OFFSET,
      section: "s1",
      subsection: "",
      subtaskParentId: "p1"
    };
    const grandchild = {
      id: "g1",
      title: "Grandchild",
      order: child.order + SUBTASK_ORDER_OFFSET,
      section: "s1",
      subsection: "",
      subtaskParentId: "c1"
    };
    const floating = { id: "f1", title: "Floating", section: "s1", subsection: "" };
    const tasks = [parent, child, grandchild, floating];

    const sorted = sortTasksByOrder(tasks);
    assert.strictEqual(sorted[0].id, "p1");
    assert.strictEqual(getContainerKey("s1", ""), "s1__");
    const nextOrder = getNextOrder("s1", "", tasks);
    assert.ok(Math.abs(nextOrder - (grandchild.order + 1)) < 1e-9);
    assert.strictEqual(
      getNextSubtaskOrder(parent, "s1", "", tasks),
      child.order + SUBTASK_ORDER_OFFSET
    );
    assert.strictEqual(getTaskDepth("g1", tasks), 2);
    assert.deepStrictEqual(
      getTaskAndDescendants("p1", tasks).map((task) => task.id),
      ["p1", "c1", "g1"]
    );
  });
});
