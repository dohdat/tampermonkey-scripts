import "fake-indexeddb/auto.js";
import assert from "assert";
import { before, describe, it } from "mocha";

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  };
}

describe("task auto sort", () => {
  let maybeAutoSortSubsectionOnAdd;
  let state;

  before(async () => {
    installDomStubs();
    ({ maybeAutoSortSubsectionOnAdd } = await import("../src/ui/tasks/task-auto-sort.js"));
    ({ state } = await import("../src/ui/state/page-state.js"));
  });

  it("returns false when auto sort setting is disabled", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: false };
    const result = await maybeAutoSortSubsectionOnAdd("s1", "sub1");
    assert.strictEqual(result, false);
  });

  it("sorts subsection roots by priority when enabled", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: true };
    const saved = [];
    const result = await maybeAutoSortSubsectionOnAdd("s1", "sub1", {
      getAllTasks: async () => [
        { id: "task-low", priority: 0 },
        { id: "task-high", priority: 5 }
      ],
      computeSubsectionPrioritySortUpdates: () => ({
        updates: [
          { id: "task-high", order: 1 },
          { id: "task-low", order: 2 }
        ],
        changed: true
      }),
      saveTask: async (task) => {
        saved.push(task);
      }
    });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(
      saved.map((task) => ({ id: task.id, order: task.order })),
      [
        { id: "task-high", order: 1 },
        { id: "task-low", order: 2 }
      ]
    );
  });

  it("returns false when no priority sorting changes are needed", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: true };
    const result = await maybeAutoSortSubsectionOnAdd("s1", "sub1", {
      getAllTasks: async () => [{ id: "task-one", priority: 5 }],
      computeSubsectionPrioritySortUpdates: () => ({ updates: [], changed: false })
    });

    assert.strictEqual(result, false);
  });

  it("falls back to the default compute helper when none is provided", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: true };
    const result = await maybeAutoSortSubsectionOnAdd("s1", "sub1", {
      getAllTasks: async () => [
        { id: "a", priority: 0, order: 2, section: "s1", subsection: "sub1" },
        { id: "b", priority: 5, order: 1, section: "s1", subsection: "sub1" }
      ],
      saveTask: async () => {}
    });
    assert.strictEqual(result, false);
  });

  it("uses the default task loader when none is provided", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: true };
    const result = await maybeAutoSortSubsectionOnAdd("s1", "sub1", {
      saveTask: async () => {},
      computeSubsectionPrioritySortUpdates: () => ({ updates: [], changed: false })
    });
    assert.strictEqual(result, false);
  });
});
