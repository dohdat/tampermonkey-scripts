import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import {
  CALENDAR_EVENTS_CACHE_PREFIX,
  CALENDAR_EXTERNAL_BUFFER_HOURS,
  MS_PER_HOUR
} from "../src/constants.js";
import { saveCalendarCacheEntry } from "../src/data/db.js";
import {
  ensureExternalEvents,
  getExternalEventsForRange,
  invalidateExternalEventsCache,
  primeExternalEventsOnLoad,
  refreshExternalEvents,
  removeExternalEventsCacheEntry,
  syncExternalEventsCache
} from "../src/ui/calendar-external.js";

describe("calendar external events", () => {
  const originalChrome = globalThis.chrome;
  let originalWarn = null;
  const buildKey = (range, viewMode, calendarIds) => {
    const idsKey = Array.isArray(calendarIds)
      ? calendarIds.filter(Boolean).sort().join(",") || "none"
      : "all";
    return `${CALENDAR_EVENTS_CACHE_PREFIX}${viewMode}:${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
  };

  const range = {
    start: new Date("2026-01-07T00:00:00Z"),
    end: new Date("2026-01-08T00:00:00Z"),
    days: 1
  };
  const viewMode = "day";

  const bufferedRange = {
    start: new Date(range.start.getTime() - CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    end: new Date(range.end.getTime() + CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    days: range.days
  };

  beforeEach(async () => {
    originalWarn = console.warn;
    console.warn = () => {};
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = "";
    state.calendarExternalRange = null;
    state.calendarExternalPendingKey = "";
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: [],
      googleCalendarTaskSettings: {}
    };
    invalidateExternalEventsCache();
    await Promise.all([
      removeExternalEventsCacheEntry(buildKey(bufferedRange, viewMode, ["calendar-1"])),
      removeExternalEventsCacheEntry(buildKey(bufferedRange, viewMode, ["calendar-1", "calendar-2"])),
      removeExternalEventsCacheEntry(buildKey(bufferedRange, viewMode, [])),
      removeExternalEventsCacheEntry(buildKey(bufferedRange, viewMode, null))
    ]);
  });

  afterEach(() => {
    if (originalWarn) {
      console.warn = originalWarn;
      originalWarn = null;
    }
    globalThis.chrome = originalChrome;
  });

  it("returns empty when no cached range matches", () => {
    assert.deepStrictEqual(getExternalEventsForRange(range, viewMode), []);
  });

  it("returns cached events when range matches", () => {
    state.calendarExternalEvents = [
      {
        id: "evt-1",
        title: "Hold",
        start: range.start,
        end: range.end
      }
    ];
    state.calendarExternalRangeKey = buildKey(
      bufferedRange,
      viewMode,
      state.settingsCache.googleCalendarIds
    );
    state.calendarExternalRange = bufferedRange;
    assert.deepStrictEqual(
      getExternalEventsForRange(range, viewMode),
      state.calendarExternalEvents
    );
  });

  it("returns cached events when no range is stored", () => {
    state.calendarExternalEvents = [
      {
        id: "evt-2",
        title: "Fallback",
        start: range.start,
        end: range.end
      }
    ];
    assert.deepStrictEqual(
      getExternalEventsForRange(range, viewMode),
      state.calendarExternalEvents
    );
  });

  it("short-circuits when runtime is unavailable", async () => {
    globalThis.chrome = undefined;
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, false);
    assert.ok(state.calendarExternalRangeKey.length > 0);
    assert.ok(state.calendarExternalRange);
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
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.ok(state.calendarExternalEvents[0].start instanceof Date);
    const minDate = new Date(capturedMessage.timeMin);
    const maxDate = new Date(capturedMessage.timeMax);
    assert.deepStrictEqual(capturedMessage.calendarIds, ["calendar-1"]);
    assert.strictEqual(minDate.toISOString(), bufferedRange.start.toISOString());
    assert.strictEqual(maxDate.toISOString(), bufferedRange.end.toISOString());
  });

  it("filters out calendars used for scheduled event sync", async () => {
    let capturedMessage = null;
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1", "calendar-2"],
      googleCalendarTaskSettings: {
        "calendar-2": { syncScheduledEvents: true, syncDays: 3 }
      }
    };
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          capturedMessage = msg;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.deepStrictEqual(capturedMessage.calendarIds, ["calendar-1"]);
  });

  it("sends cached sync tokens for incremental updates", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: { "calendar-1": "sync-1" },
      updatedAt: new Date(0).toISOString()
    });
    let capturedMessage = null;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          capturedMessage = msg;
          cb({ ok: true, events: [], syncTokensByCalendar: { "calendar-1": "sync-2" } });
        }
      }
    };
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.ok(capturedMessage?.syncTokensByCalendar);
    assert.strictEqual(capturedMessage.syncTokensByCalendar["calendar-1"], "sync-1");
  });

  it("skips fetch when a pending key matches", async () => {
    state.calendarExternalPendingKey = buildKey(
      bufferedRange,
      viewMode,
      state.settingsCache.googleCalendarIds
    );
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
    const updated = await ensureExternalEvents(range, viewMode);
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
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.ok(state.calendarExternalRangeKey.length > 0);
    assert.ok(state.calendarExternalRange);
  });

  it("keeps in-memory events when cache is stale before fetch", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const inMemoryEvents = [
      {
        id: "evt-live",
        calendarId: "calendar-1",
        title: "Live",
        start: range.start,
        end: range.end
      }
    ];
    state.calendarExternalEvents = inMemoryEvents;
    state.calendarExternalRangeKey = "other";
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [
        {
          id: "evt-stale",
          calendarId: "calendar-1",
          title: "Stale",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        }
      ],
      syncTokensByCalendar: {},
      updatedAt: new Date(0).toISOString()
    });
    let capturedEvents = null;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          capturedEvents = state.calendarExternalEvents;
          cb({ ok: true, events: [] });
        }
      }
    };
    await ensureExternalEvents(range, viewMode);
    assert.deepStrictEqual(capturedEvents, inMemoryEvents);
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
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.ok(capturedMessage);
    assert.strictEqual(capturedMessage.calendarIds, null);
  });

  it("invalidates the cached range and events", () => {
    state.calendarExternalRangeKey = "cached";
    state.calendarExternalRange = range;
    state.calendarExternalPendingKey = "pending";
    state.calendarExternalEvents = [{ id: "evt-1" }];
    invalidateExternalEventsCache();
    assert.strictEqual(state.calendarExternalRangeKey, "");
    assert.strictEqual(state.calendarExternalRange, null);
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.strictEqual(state.calendarExternalEvents.length, 0);
  });

  it("primes external events once on load", async () => {
    const updated = await primeExternalEventsOnLoad();
    assert.strictEqual(updated, false);
  });

  it("primes external events from cache entries", async () => {
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "none",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [
        {
          id: "evt-primed",
          calendarId: "calendar-1",
          title: "Primed",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        }
      ],
      syncTokensByCalendar: {},
      updatedAt: new Date().toISOString()
    });
    const updated = await primeExternalEventsOnLoad(range, viewMode);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalRangeKey, cacheKey);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
  });

  it("returns cached state without fetching when fresh", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: { "calendar-1": "sync-1" },
      updatedAt: new Date().toISOString()
    });
    let called = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: () => {
          called += 1;
        }
      }
    };
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.strictEqual(called, 0);
  });

  it("forces a refresh even when cache is fresh", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: { "calendar-1": "sync-1" },
      updatedAt: new Date().toISOString()
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
    const updated = await refreshExternalEvents(range, viewMode, { allowStateUpdate: true });
    assert.strictEqual(updated, true);
    assert.strictEqual(called, 1);
  });

  it("returns false when the range is invalid", async () => {
    const updated = await ensureExternalEvents(null, viewMode);
    assert.strictEqual(updated, false);
  });

  it("prefetches adjacent ranges when cache is fresh", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: {},
      updatedAt: new Date().toISOString()
    });
    let called = 0;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = (cb) => {
      cb();
      return 1;
    };
    globalThis.clearTimeout = () => {};
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          called += 1;
          cb({ ok: true, events: [] });
        }
      }
    };
    try {
      await ensureExternalEvents(range, viewMode);
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
      assert.ok(called >= 1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it("skips prefetch when adjacent cache is fresh", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: {},
      updatedAt: new Date().toISOString()
    });
    const nextRange = {
      start: new Date(range.start.getTime() + 24 * 60 * 60 * 1000),
      end: new Date(range.end.getTime() + 24 * 60 * 60 * 1000),
      days: 1
    };
    const nextBuffered = {
      start: new Date(nextRange.start.getTime() - CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
      end: new Date(nextRange.end.getTime() + CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
      days: 1
    };
    await saveCalendarCacheEntry({
      key: buildKey(nextBuffered, viewMode, state.settingsCache.googleCalendarIds),
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: nextBuffered.start.toISOString(),
        end: nextBuffered.end.toISOString()
      },
      events: [],
      syncTokensByCalendar: {},
      updatedAt: new Date().toISOString()
    });
    let called = 0;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = (cb) => {
      cb();
      return 1;
    };
    globalThis.clearTimeout = () => {};
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: () => {
          called += 1;
        }
      }
    };
    try {
      await ensureExternalEvents(range, viewMode);
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
      assert.strictEqual(called, 0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it("merges incremental updates and deletions", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const cacheKey = buildKey(bufferedRange, viewMode, state.settingsCache.googleCalendarIds);
    await saveCalendarCacheEntry({
      key: cacheKey,
      viewMode,
      calendarIdsKey: "calendar-1",
      range: {
        start: bufferedRange.start.toISOString(),
        end: bufferedRange.end.toISOString()
      },
      events: [
        {
          id: "evt-keep",
          calendarId: "calendar-1",
          title: "Keep",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        },
        {
          id: "evt-drop",
          calendarId: "calendar-1",
          title: "Drop",
          start: range.start.toISOString(),
          end: range.end.toISOString()
        }
      ],
      syncTokensByCalendar: { "calendar-1": "sync-1" },
      updatedAt: new Date(0).toISOString()
    });
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          cb({
            ok: true,
            isIncremental: true,
            events: [
              {
                id: "evt-new",
                calendarId: "calendar-1",
                title: "New",
                start: range.start.toISOString(),
                end: range.end.toISOString()
              }
            ],
            deletedEvents: [{ id: "evt-drop", calendarId: "calendar-1" }],
            syncTokensByCalendar: { "calendar-1": "sync-2" }
          });
        }
      }
    };
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    const ids = state.calendarExternalEvents.map((event) => event.id);
    assert.ok(ids.includes("evt-keep"));
    assert.ok(ids.includes("evt-new"));
    assert.ok(!ids.includes("evt-drop"));
  });

  it("handles runtime lastError during fetch", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"]
    };
    const runtime = {
      lastError: null,
      sendMessage: (_msg, cb) => {
        runtime.lastError = { message: "boom" };
        cb(null);
        runtime.lastError = null;
      }
    };
    globalThis.chrome = { runtime };
    const updated = await ensureExternalEvents(range, viewMode);
    assert.strictEqual(updated, true);
    assert.ok(state.calendarExternalRangeKey.length > 0);
  });

  it("creates calendar tasks when treating calendars as tasks", async () => {
    const previousWindow = globalThis.window;
    let dispatched = false;
    globalThis.window = {
      dispatchEvent: () => {
        dispatched = true;
      }
    };
    state.settingsCache = {
      ...state.settingsCache,
      googleCalendarIds: ["calendar-1"],
      googleCalendarTaskSettings: {
        "calendar-1": { treatAsTasks: true, sectionId: "sec-1", subsectionId: "sub-1" }
      },
      sections: [{ id: "sec-1", name: "Work" }],
      subsections: { "sec-1": [{ id: "sub-1", name: "Ops" }] }
    };
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
          cb({
            ok: true,
            events: [
              {
                id: "evt-task",
                calendarId: "calendar-1",
                title: "Imported",
                start: range.start.toISOString(),
                end: range.end.toISOString()
              }
            ]
          });
        }
      }
    };
    await ensureExternalEvents(range, viewMode);
    assert.strictEqual(dispatched, true);
    globalThis.window = previousWindow;
  });

  it("returns false when removing cache without a key", async () => {
    const result = await removeExternalEventsCacheEntry("");
    assert.strictEqual(result, false);
  });

  it("syncs updated external events into memory", async () => {
    state.calendarExternalRangeKey = buildKey(
      bufferedRange,
      viewMode,
      state.settingsCache.googleCalendarIds
    );
    state.calendarExternalRange = bufferedRange;
    const synced = await syncExternalEventsCache([
      {
        id: "evt-2",
        title: "Synced",
        start: range.start.toISOString(),
        end: range.end.toISOString()
      }
    ]);
    assert.strictEqual(synced, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.ok(state.calendarExternalEvents[0].start instanceof Date);
  });
});
