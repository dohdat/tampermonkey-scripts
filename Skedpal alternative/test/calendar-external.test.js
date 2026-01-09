import "fake-indexeddb/auto.js";
import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import {
  deleteCalendarCacheEntry,
  saveCalendarCacheEntry
} from "../src/data/db.js";
import {
  ensureExternalEvents,
  getExternalEventsForRange,
  hydrateExternalEvents,
  invalidateExternalEventsCache,
  primeExternalEventsOnLoad
} from "../src/ui/calendar-external.js";

describe("calendar external events", () => {
  const originalChrome = globalThis.chrome;
  let originalWarn = null;
  const buildKey = (range, calendarIds) => {
    const idsKey = Array.isArray(calendarIds)
      ? calendarIds.filter(Boolean).sort().join(",") || "none"
      : "all";
    return `${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
  };

  const range = {
    start: new Date("2026-01-07T00:00:00Z"),
    end: new Date("2026-01-08T00:00:00Z")
  };

  beforeEach(() => {
    originalWarn = console.warn;
    console.warn = () => {};
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = "";
    state.calendarExternalPendingKey = "";
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };
    invalidateExternalEventsCache();
    const key = buildKey(range, state.settingsCache.googleCalendarIds);
    return deleteCalendarCacheEntry(key);
  });

  afterEach(() => {
    if (originalWarn) {
      console.warn = originalWarn;
      originalWarn = null;
    }
    globalThis.chrome = originalChrome;
  });

  it("returns empty when no cached range matches", () => {
    assert.deepStrictEqual(getExternalEventsForRange(range), []);
  });

  it("returns cached events when fetch is disabled", () => {
    state.calendarExternalEvents = [{ id: "evt-1", title: "Hold" }];
    state.calendarExternalRangeKey = buildKey(range, state.settingsCache.googleCalendarIds);
    assert.deepStrictEqual(getExternalEventsForRange(range), state.calendarExternalEvents);
  });

  it("short-circuits when runtime is unavailable", async () => {
    globalThis.chrome = undefined;
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, false);
    assert.ok(state.calendarExternalRangeKey.length > 0);
  });

  it("stores events returned from the background runtime", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    let capturedMessage = null;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          capturedMessage = msg;
          cb({
            ok: true,
            events: [
              {
                id: "evt-1",
                title: "Busy",
                link: "",
                calendarId: "calendar-1",
                start: "2026-01-07T10:00:00Z",
                end: "2026-01-07T11:00:00Z"
              }
            ]
          });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.ok(state.calendarExternalEvents[0].start instanceof Date);
    const minDate = new Date(capturedMessage.timeMin);
    const maxDate = new Date(capturedMessage.timeMax);
    assert.deepStrictEqual(capturedMessage.calendarIds, ["calendar-1"]);
    assert.strictEqual(minDate.toISOString(), range.start.toISOString());
    assert.strictEqual(maxDate.toISOString(), range.end.toISOString());
  });

  it("skips fetch when a pending key matches", async () => {
    state.calendarExternalPendingKey = buildKey(range, state.settingsCache.googleCalendarIds);
    let called = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          called += 1;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, false);
    assert.strictEqual(called, 0);
  });

  it("handles failed responses and clears pending flags", async () => {
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          cb({ ok: false, error: "bad" });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.ok(state.calendarExternalRangeKey.length > 0);
  });

  it("sends null calendarIds when none are selected", async () => {
    let capturedMessage = null;
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: null };
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          capturedMessage = msg;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.ok(capturedMessage);
    assert.strictEqual(capturedMessage.calendarIds, null);
  });

  it("invalidates the cached range and events", () => {
    state.calendarExternalRangeKey = "cached";
    state.calendarExternalPendingKey = "pending";
    state.calendarExternalEvents = [{ id: "evt-1" }];
    invalidateExternalEventsCache();
    assert.strictEqual(state.calendarExternalRangeKey, "");
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.strictEqual(state.calendarExternalEvents.length, 0);
  });

  it("primes external events once on load", async () => {
    const updated = await primeExternalEventsOnLoad();
    assert.strictEqual(updated, false);
  });

  it("uses cached entries and skips network when fresh", async () => {
    const key = buildKey(range, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key,
      fetchedAt: Date.now(),
      events: [
        {
          id: "evt-2",
          title: "Cached",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        }
      ]
    });
    let called = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          called += 1;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, false);
    assert.strictEqual(called, 0);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
  });

  it("hydrates external events from indexedDB", async () => {
    const key = buildKey(range, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key,
      fetchedAt: Date.now(),
      events: [
        {
          id: "evt-3",
          title: "Hydrated",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        }
      ]
    });
    const hydrated = await hydrateExternalEvents(range);
    assert.strictEqual(hydrated, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
  });

  it("treats past ranges as fresh when recently cached", async () => {
    const pastRange = {
      start: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      end: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    };
    const key = buildKey(pastRange, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key,
      fetchedAt: Date.now(),
      events: [
        {
          id: "evt-4",
          title: "Past cached",
          start: pastRange.start.toISOString(),
          end: pastRange.end.toISOString()
        }
      ]
    });
    let called = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          called += 1;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(pastRange);
    assert.strictEqual(updated, false);
    assert.strictEqual(called, 0);
  });

  it("treats today ranges as fresh when recently cached", async () => {
    const now = new Date();
    const todayRange = {
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    };
    const key = buildKey(todayRange, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key,
      fetchedAt: Date.now(),
      events: [
        {
          id: "evt-5",
          title: "Today cached",
          start: todayRange.start.toISOString(),
          end: todayRange.end.toISOString()
        }
      ]
    });
    let called = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          called += 1;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(todayRange);
    assert.strictEqual(updated, false);
    assert.strictEqual(called, 0);
  });

  it("handles runtime lastError during fetch", async () => {
    const key = buildKey(range, state.settingsCache.googleCalendarIds);
    globalThis.chrome = {
      runtime: {
        lastError: { message: "bad" },
        sendMessage: (_msg, cb) => {
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.strictEqual(state.calendarExternalRangeKey, key);
  });
});
