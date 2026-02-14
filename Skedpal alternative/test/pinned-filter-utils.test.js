import assert from "assert";
import { describe, it } from "mocha";
import { filterPinnedInputs } from "../src/core/scheduler/pinned-filter-utils.js";

describe("pinned-filter-utils", () => {
  it("filters placements and ids for completed or missing tasks", () => {
    const tasks = [
      { id: "task-active", repeat: { type: "none" }, completed: false },
      { id: "task-repeat", repeat: { type: "custom", unit: "day", interval: 1 }, completed: false },
      { id: "task-done", repeat: { type: "none" }, completed: true }
    ];
    const result = filterPinnedInputs(
      tasks,
      [
        { taskId: "task-active", start: "2026-02-11T08:00:00.000Z" },
        { taskId: "task-repeat", start: "not-a-date" },
        { taskId: "task-done", start: "2026-02-11T08:00:00.000Z" },
        { taskId: "missing-task", start: "2026-02-11T08:00:00.000Z" },
        { start: "2026-02-11T08:00:00.000Z" }
      ],
      new Set(["task-active-2026-02-11", "task-done-2026-02-11", "external-occurrence"]),
      ["task-active", "task-done", "missing-task"]
    );

    assert.strictEqual(result.filteredPlacements.length, 1);
    assert.strictEqual(result.filteredPlacements[0].taskId, "task-active");
    assert.deepStrictEqual(
      new Set(result.filteredOccurrenceIds),
      new Set(["task-active-2026-02-11", "external-occurrence"])
    );
    assert.deepStrictEqual(result.filteredTaskIds, ["task-active"]);
  });

  it("drops completed repeat occurrences and normalizes scalar ids", () => {
    const tasks = [
      {
        id: "repeat-task",
        repeat: { type: "custom", unit: "day", interval: 1 },
        repeatAnchor: new Date(2026, 1, 10, 0, 0, 0),
        completed: false,
        completedOccurrences: ["2026-02-12"]
      }
    ];

    const result = filterPinnedInputs(
      tasks,
      [{ taskId: "repeat-task", start: new Date("2026-02-12T09:00:00.000Z") }],
      "repeat-task-2026-02-12",
      "repeat-task"
    );

    assert.deepStrictEqual(result.filteredPlacements, []);
    assert.deepStrictEqual(result.filteredOccurrenceIds, ["repeat-task-2026-02-12"]);
    assert.deepStrictEqual(result.filteredTaskIds, ["repeat-task"]);
  });

  it("keeps repeat placements when occurrence is not completed", () => {
    const tasks = [
      {
        id: "repeat-task",
        repeat: { type: "custom", unit: "day", interval: 1 },
        repeatAnchor: new Date(2026, 1, 10, 0, 0, 0),
        completed: false,
        completedOccurrences: ["2026-02-11"]
      }
    ];

    const result = filterPinnedInputs(
      tasks,
      [{ taskId: "repeat-task", start: "2026-02-12T09:00:00.000Z" }],
      null,
      null
    );

    assert.strictEqual(result.filteredPlacements.length, 1);
    assert.strictEqual(result.filteredPlacements[0].taskId, "repeat-task");
    assert.deepStrictEqual(result.filteredOccurrenceIds, []);
    assert.deepStrictEqual(result.filteredTaskIds, []);
  });
});
