import "fake-indexeddb/auto.js";
import assert from "assert";
import { beforeEach, describe, it } from "mocha";
import { DB_NAME, DB_VERSION } from "../src/constants.js";
import { getAllTasks, saveTask } from "../src/data/db.js";
import { state } from "../src/ui/state/page-state.js";
import { maybeAutoSortSubsectionOnAdd } from "../src/ui/tasks/task-auto-sort.js";

const STORES = ["tasks", "timemaps", "settings", "backups", "task-templates", "calendar-cache"];

function openRawDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function resetStores() {
  await getAllTasks();
  const db = await openRawDb();
  const tx = db.transaction(STORES, "readwrite");
  for (const storeName of STORES) {
    tx.objectStore(storeName).clear();
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("auto sort on add", () => {
  beforeEach(async () => {
    await resetStores();
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: false };
  });

  it("sorts subsection tasks by priority when enabled", async () => {
    state.settingsCache = { ...state.settingsCache, autoSortNewTasks: true };
    await saveTask({ id: "t1", title: "Low", section: "s1", subsection: "sub1", order: 1, priority: 1 });
    await saveTask({ id: "t2", title: "High", section: "s1", subsection: "sub1", order: 2, priority: 5 });
    await saveTask({ id: "t3", title: "Mid", section: "s1", subsection: "sub1", order: 3, priority: 3 });

    const changed = await maybeAutoSortSubsectionOnAdd("s1", "sub1");
    assert.strictEqual(changed, true);

    const tasks = await getAllTasks();
    const byId = new Map(tasks.map((task) => [task.id, task]));
    assert.strictEqual(byId.get("t2").order, 1);
    assert.strictEqual(byId.get("t3").order, 2);
    assert.strictEqual(byId.get("t1").order, 3);
  });

  it("skips sorting when disabled", async () => {
    await saveTask({ id: "t1", title: "Low", section: "s1", subsection: "sub1", order: 1, priority: 1 });
    await saveTask({ id: "t2", title: "High", section: "s1", subsection: "sub1", order: 2, priority: 5 });

    const changed = await maybeAutoSortSubsectionOnAdd("s1", "sub1");
    assert.strictEqual(changed, false);

    const tasks = await getAllTasks();
    const byId = new Map(tasks.map((task) => [task.id, task]));
    assert.strictEqual(byId.get("t1").order, 1);
    assert.strictEqual(byId.get("t2").order, 2);
  });
});
