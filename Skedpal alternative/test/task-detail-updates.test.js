import "fake-indexeddb/auto.js";
import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

const OriginalEvent = global.Event;

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => null
  };
  global.Event = class {
    constructor(type) {
      this.type = type;
    }
  };
}

installDomStubs();

const { DB_NAME } = await import("../src/constants.js");
const { getAllTasks, saveTask } = await import("../src/data/db.js");
const { state } = await import("../src/ui/state/page-state.js");
const { updateTaskDetailField } = await import("../src/ui/tasks/task-detail-updates.js");

function clearDb() {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("task detail updates", () => {
  beforeEach(async () => {
    await clearDb();
    installDomStubs();
    state.tasksCache = [];
  });

  afterEach(async () => {
    delete global.window;
    if (OriginalEvent === undefined) {
      delete global.Event;
    } else {
      global.Event = OriginalEvent;
    }
    await clearDb();
  });

  it("returns early when task is missing", async () => {
    await updateTaskDetailField(null, { title: "noop" });
  });

  it("propagates inherited fields to descendants and dispatches updates", async () => {
    const parent = {
      id: "parent",
      title: "Parent task",
      section: "s1",
      timeMapIds: ["tm-1"],
      priority: 3,
      minBlockMin: 45
    };
    const child = {
      id: "child",
      subtaskParentId: "parent",
      title: "Child task",
      section: "old",
      timeMapIds: ["tm-old"],
      priority: 1,
      minBlockMin: 15
    };
    state.tasksCache = [parent, child];
    await saveTask(parent);
    await saveTask(child);
    let dispatched = "";
    global.window = {
      dispatchEvent: (event) => {
        dispatched = event.type;
      }
    };

    await updateTaskDetailField(parent, { section: "s2", priority: 5 });

    const tasks = await getAllTasks();
    const savedParent = tasks.find((task) => task.id === "parent");
    const savedChild = tasks.find((task) => task.id === "child");
    assert.strictEqual(savedParent.section, "s2");
    assert.strictEqual(savedChild.section, "s2");
    assert.strictEqual(savedChild.priority, 5);
    assert.strictEqual(dispatched, "skedpal:tasks-updated");
  });
});
