import assert from "assert";
import { describe, it } from "mocha";
import {
  buildPinnedPlacementMap,
  buildPinnedSchedulingState,
  normalizeIdSet,
  normalizePinnedPlacements
} from "../src/core/scheduler/pinned-utils.js";

describe("pinned utils", () => {
  it("normalizes id sets from mixed inputs", () => {
    assert.strictEqual(normalizeIdSet().size, 0);
    assert.ok(normalizeIdSet(new Set(["a"])).has("a"));
    assert.ok(normalizeIdSet(["b"]).has("b"));
    assert.ok(normalizeIdSet("c").has("c"));
  });

  it("filters invalid pinned placements", () => {
    const placements = normalizePinnedPlacements([
      null,
      { start: "invalid", end: "invalid" },
      {
        start: new Date("2026-01-01T10:00:00Z"),
        end: new Date("2026-01-01T09:00:00Z")
      },
      {
        taskId: "t1",
        occurrenceId: "occ-1",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T10:00:00Z"
      }
    ]);

    assert.strictEqual(placements.length, 1);
    assert.strictEqual(placements[0].occurrenceId, "occ-1");
    assert.strictEqual(placements[0].pinned, true);
    assert.strictEqual(normalizePinnedPlacements("nope").length, 0);
  });

  it("builds pinned scheduling state from placements", () => {
    const placements = [
      {
        taskId: "t1",
        occurrenceId: "occ-1",
        start: new Date(2026, 0, 6, 9, 0, 0),
        end: new Date(2026, 0, 6, 10, 0, 0)
      },
      {
        taskId: "t1",
        occurrenceId: "occ-1",
        start: new Date(2026, 0, 6, 10, 0, 0),
        end: new Date(2026, 0, 6, 11, 0, 0)
      },
      {
        taskId: "t2",
        occurrenceId: "",
        start: new Date(2026, 0, 6, 12, 0, 0),
        end: new Date(2026, 0, 6, 13, 0, 0)
      }
    ];
    const map = buildPinnedPlacementMap(placements);
    assert.strictEqual(map.get("occ-1").length, 2);
    const windows = [
      {
        start: new Date(2026, 0, 6, 9, 0, 0),
        end: new Date(2026, 0, 6, 12, 0, 0)
      }
    ];
    const state = buildPinnedSchedulingState({
      pinnedPlacements: placements,
      pinnedOccurrenceIds: ["occ-2"],
      pinnedTaskIds: ["t3"],
      windows
    });
    assert.ok(state.pinnedOccurrenceSet.has("occ-1"));
    assert.ok(state.pinnedOccurrenceSet.has("occ-2"));
    assert.ok(state.pinnedTaskIdSet.has("t3"));
  });
});
