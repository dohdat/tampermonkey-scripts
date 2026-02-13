import "fake-indexeddb/auto.js";
import assert from "assert";
import { beforeEach, describe, it } from "mocha";

import { CALENDAR_LIST_CACHE_KEY } from "../src/constants.js";
import { getCalendarCacheEntry, saveCalendarCacheEntry } from "../src/data/db.js";
import { loadCalendarListCache, saveCalendarListCache } from "../src/ui/calendar-list-cache.js";

const DB_NAME = "personal-skedpal";

function openRawDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function resetCalendarCacheStore() {
  await getCalendarCacheEntry(CALENDAR_LIST_CACHE_KEY);
  const db = await openRawDb();
  const tx = db.transaction(["calendar-cache"], "readwrite");
  tx.objectStore("calendar-cache").clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("calendar list cache", () => {
  beforeEach(async () => {
    await resetCalendarCacheStore();
  });

  it("loads normalized calendar list entries from cache", async () => {
    await saveCalendarCacheEntry({
      key: CALENDAR_LIST_CACHE_KEY,
      value: [
        { id: "cal-1", summary: "Primary", backgroundColor: "#123456", extra: "ignored" },
        { id: "", summary: "Invalid" },
        null
      ],
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const calendars = await loadCalendarListCache();
    assert.deepStrictEqual(calendars, [
      { id: "cal-1", summary: "Primary", backgroundColor: "#123456" }
    ]);
  });

  it("saves normalized calendar list entries into cache", async () => {
    await saveCalendarListCache([
      { id: "cal-1", summary: "Primary", backgroundColor: "#123456" },
      { id: "cal-2" },
      { id: "" }
    ]);
    const entry = await getCalendarCacheEntry(CALENDAR_LIST_CACHE_KEY);
    assert.ok(entry);
    assert.strictEqual(entry.key, CALENDAR_LIST_CACHE_KEY);
    assert.ok(entry.updatedAt);
    assert.deepStrictEqual(entry.value, [
      { id: "cal-1", summary: "Primary", backgroundColor: "#123456" },
      { id: "cal-2", summary: "", backgroundColor: "" }
    ]);
  });

  it("returns an empty list when cache entry is absent", async () => {
    const calendars = await loadCalendarListCache();
    assert.deepStrictEqual(calendars, []);
  });
});
