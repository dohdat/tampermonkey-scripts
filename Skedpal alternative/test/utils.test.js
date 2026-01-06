import assert from "assert";
import { describe, it } from "mocha";

const {
  getSectionColorMap,
  parseLocalDateInput,
  isStartAfterDeadline,
  normalizeSubtaskScheduleMode,
  resolveTimeMapIdsAfterDelete
} = await import("../src/ui/utils.js");

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
