import "fake-indexeddb/auto.js";
import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = {
      add: () => {},
      remove: () => {},
      contains: () => false
    };
    this.textContent = "";
    this.disabled = false;
    this.onclick = null;
  }
}

const elements = new Map();

function installDomStubs() {
  const handlers = {};
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, new FakeElement());
      }
      return elements.get(id);
    }
  };
  const historyStub =
    global.history ||
    {
      replaceState: () => {},
      pushState: () => {}
    };
  global.window = {
    _handlers: handlers,
    location: { href: "https://example.com/app" },
    addEventListener: (type, handler) => {
      handlers[type] = handler;
    },
    removeEventListener: (type) => {
      delete handlers[type];
    },
    dispatchEvent: (event) => {
      const handler = handlers[event.type];
      if (handler) {
        handler(event);
      }
      return true;
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    history: historyStub
  };
  global.history = historyStub;
  global.Event = class {
    constructor(type) {
      this.type = type;
    }
  };
  global.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
}

function clearDb(dbName) {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

installDomStubs();

const { DB_NAME, TASK_STATUS_COMPLETED } = await import("../src/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { completeScheduledTask } = await import("../src/ui/calendar.js");
const { getAllTasks } = await import("../src/data/db.js");

describe("calendar quick complete", () => {
  beforeEach(async () => {
    await clearDb(DB_NAME);
    installDomStubs();
    state.tasksCache = [];
  });

  it("completes a scheduled task subtree and emits updates", async () => {
    let tasksUpdated = false;
    const handleTasksUpdated = () => {
      tasksUpdated = true;
    };
    window.addEventListener("skedpal:tasks-updated", handleTasksUpdated);
    const start = new Date("2026-01-06T12:00:00.000Z");
    const end = new Date("2026-01-06T13:00:00.000Z");
    const root = {
      id: "task-root",
      title: "Root task",
      scheduleStatus: "scheduled",
      completed: false,
      scheduledInstances: [{ start: start.toISOString(), end: end.toISOString() }]
    };
    const child = {
      id: "task-child",
      title: "Child task",
      subtaskParentId: "task-root",
      scheduleStatus: "scheduled",
      completed: false,
      scheduledInstances: [{ start: start.toISOString(), end: end.toISOString() }]
    };
    state.tasksCache = [root, child];

    await completeScheduledTask({ taskId: "task-root", start, end });

    const saved = await getAllTasks();
    const savedRoot = saved.find((t) => t.id === "task-root");
    const savedChild = saved.find((t) => t.id === "task-child");
    assert.strictEqual(savedRoot.completed, true);
    assert.strictEqual(savedRoot.scheduleStatus, TASK_STATUS_COMPLETED);
    assert.strictEqual(savedChild.completed, true);
    assert.strictEqual(savedChild.scheduleStatus, TASK_STATUS_COMPLETED);
    assert.strictEqual(tasksUpdated, true);
    window.removeEventListener("skedpal:tasks-updated", handleTasksUpdated);
  });

  it("returns early when no matching task exists", async () => {
    const before = await getAllTasks();
    await completeScheduledTask({
      taskId: "missing-task",
      start: new Date("2026-01-06T12:00:00.000Z"),
      end: new Date("2026-01-06T13:00:00.000Z")
    });
    const after = await getAllTasks();
    assert.strictEqual(after.length, before.length);
  });

  it("skips repeat completion when the start time is invalid", async () => {
    const repeatTask = {
      id: "task-repeat-invalid",
      title: "Repeating",
      scheduleStatus: "scheduled",
      repeat: { type: "daily" },
      scheduledInstances: []
    };
    state.tasksCache = [repeatTask];

    const before = await getAllTasks();
    await completeScheduledTask({
      taskId: "task-repeat-invalid",
      start: "not-a-date",
      end: "not-a-date"
    });

    const saved = await getAllTasks();
    assert.strictEqual(saved.length, before.length);
  });

  it("dispatches repeat occurrence completion for repeating tasks", async () => {
    let repeatEvent = null;
    const handleRepeatComplete = (event) => {
      repeatEvent = event;
    };
    window.addEventListener("skedpal:repeat-occurrence-complete", handleRepeatComplete);
    const start = new Date("2026-01-07T09:00:00.000Z");
    const end = new Date("2026-01-07T10:00:00.000Z");
    const repeatTask = {
      id: "task-repeat",
      title: "Repeating",
      scheduleStatus: "scheduled",
      repeat: { type: "daily" },
      scheduledInstances: [{ start: start.toISOString(), end: end.toISOString() }]
    };
    state.tasksCache = [repeatTask];

    await completeScheduledTask({ taskId: "task-repeat", start, end });

    assert.ok(repeatEvent);
    assert.strictEqual(repeatEvent.detail.taskId, "task-repeat");
    assert.strictEqual(typeof repeatEvent.detail.occurrenceIso, "string");
    window.removeEventListener("skedpal:repeat-occurrence-complete", handleRepeatComplete);
  });
});
