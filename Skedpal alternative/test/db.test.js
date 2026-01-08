import "fake-indexeddb/auto.js";
import assert from "assert";
import { beforeEach, describe, it } from "mocha";
import {
  DEFAULT_SETTINGS,
  deleteTask,
  deleteTimeMap,
  getAllTasks,
  getAllTimeMaps,
  getSettings,
  saveSettings,
  saveTask,
  saveTimeMap
} from "../src/data/db.js";

const DB_NAME = "personal-skedpal";
const STORES = ["tasks", "timemaps", "settings"];

function openRawDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
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
});
