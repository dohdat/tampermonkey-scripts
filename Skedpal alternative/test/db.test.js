import "fake-indexeddb/auto.js";
import assert from "assert";
import { beforeEach, describe, it } from "mocha";
import {
  DEFAULT_SETTINGS,
  deleteTask,
  deleteTimeMap,
  getAllTasks,
  getAllTimeMaps,
  getLatestBackup,
  getSettings,
  restoreBackup,
  saveBackup,
  saveSettings,
  saveTask,
  saveTimeMap
} from "../src/data/db.js";

const DB_NAME = "personal-skedpal";
const STORES = ["tasks", "timemaps", "settings", "backups", "task-templates", "calendar-cache"];

function openRawDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
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

describe("db", () => {
  beforeEach(async () => {
    await resetStores();
  });

  it("getAllTasks returns empty array for new database", async () => {
    const tasks = await getAllTasks();
    assert.deepStrictEqual(tasks, []);
  });

  it("saveTask and deleteTask round trip", async () => {
    const task = { id: "task-1", title: "Write tests" };
    const saved = await saveTask(task);
    assert.deepStrictEqual(saved, task);
    assert.deepStrictEqual(await getAllTasks(), [task]);
    await deleteTask(task.id);
    assert.deepStrictEqual(await getAllTasks(), []);
  });

  it("saveTimeMap and deleteTimeMap round trip", async () => {
    const timeMap = { id: "tm-1", name: "Focus" };
    const saved = await saveTimeMap(timeMap);
    assert.deepStrictEqual(saved, timeMap);
    assert.deepStrictEqual(await getAllTimeMaps(), [timeMap]);
    await deleteTimeMap(timeMap.id);
    assert.deepStrictEqual(await getAllTimeMaps(), []);
  });

  it("getSettings returns defaults when empty", async () => {
    const settings = await getSettings();
    assert.strictEqual(settings.schedulingHorizonDays, DEFAULT_SETTINGS.schedulingHorizonDays);
    assert.strictEqual(settings.defaultTimeMapId, DEFAULT_SETTINGS.defaultTimeMapId);
    assert.deepStrictEqual(settings.googleCalendarIds, DEFAULT_SETTINGS.googleCalendarIds);
    assert.deepStrictEqual(settings.sections, DEFAULT_SETTINGS.sections);
    assert.deepStrictEqual(settings.subsections, DEFAULT_SETTINGS.subsections);
  });

  it("saveSettings merges stored values with defaults", async () => {
    await saveSettings({ schedulingHorizonDays: 7, defaultTimeMapId: "tm-1" });
    const settings = await getSettings();
    assert.strictEqual(settings.schedulingHorizonDays, 7);
    assert.strictEqual(settings.defaultTimeMapId, "tm-1");
    assert.deepStrictEqual(settings.googleCalendarIds, DEFAULT_SETTINGS.googleCalendarIds);
    assert.deepStrictEqual(settings.sections, DEFAULT_SETTINGS.sections);
    assert.deepStrictEqual(settings.subsections, DEFAULT_SETTINGS.subsections);
  });

  it("saveBackup stores and returns the latest snapshot", async () => {
    const snapshot = {
      createdAt: "2026-01-08T12:00:00.000Z",
      tasks: [{ id: "task-1", title: "Backup task" }],
      timeMaps: [{ id: "tm-1", name: "Backup map" }],
      settings: { ...DEFAULT_SETTINGS, schedulingHorizonDays: 21 }
    };
    await saveBackup(snapshot);
    const latest = await getLatestBackup();
    assert.ok(latest);
    assert.strictEqual(latest.createdAt, snapshot.createdAt);
    assert.deepStrictEqual(latest.tasks, snapshot.tasks);
    assert.deepStrictEqual(latest.timeMaps, snapshot.timeMaps);
    assert.strictEqual(latest.settings.schedulingHorizonDays, 21);
  });

  it("restoreBackup replaces tasks, timemaps, and settings", async () => {
    await saveTask({ id: "task-old", title: "Old task" });
    await saveTimeMap({ id: "tm-old", name: "Old map" });
    await saveSettings({ schedulingHorizonDays: 5, defaultTimeMapId: "tm-old" });
    const snapshot = {
      createdAt: "2026-01-08T14:00:00.000Z",
      tasks: [{ id: "task-new", title: "New task" }],
      timeMaps: [{ id: "tm-new", name: "New map" }],
      settings: {
        ...DEFAULT_SETTINGS,
        schedulingHorizonDays: 30,
        defaultTimeMapId: "tm-new",
        googleCalendarIds: ["cal-1"]
      }
    };
    await restoreBackup(snapshot);
    assert.deepStrictEqual(await getAllTasks(), snapshot.tasks);
    assert.deepStrictEqual(await getAllTimeMaps(), snapshot.timeMaps);
    const settings = await getSettings();
    assert.strictEqual(settings.schedulingHorizonDays, 30);
    assert.strictEqual(settings.defaultTimeMapId, "tm-new");
    assert.deepStrictEqual(settings.googleCalendarIds, ["cal-1"]);
  });
});
