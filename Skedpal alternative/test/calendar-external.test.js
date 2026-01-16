import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import {
  ensureExternalEvents,
  getExternalEventsForRange,
  invalidateExternalEventsCache,
  primeExternalEventsOnLoad,
  syncExternalEventsCache
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
    state.calendarExternalRange = null;
    state.calendarExternalPendingKey = "";
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };
    invalidateExternalEventsCache();
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

  it("returns cached events when range matches", () => {
    state.calendarExternalEvents = [
      {
        id: "evt-1",
        title: "Hold",
        start: range.start,
        end: range.end
      }
    ];
    state.calendarExternalRangeKey = buildKey(range, state.settingsCache.googleCalendarIds);
    state.calendarExternalRange = range;
    assert.deepStrictEqual(getExternalEventsForRange(range), state.calendarExternalEvents);
  });

  it("short-circuits when runtime is unavailable", async () => {
    globalThis.chrome = undefined;
    const updated = await ensureExternalEvents(range);
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
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.deepStrictEqual(capturedMessage.calendarIds, ["calendar-1"]);
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
    assert.ok(state.calendarExternalRange);
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

  it("syncs updated external events into memory", async () => {
    state.calendarExternalRangeKey = buildKey(range, state.settingsCache.googleCalendarIds);
    state.calendarExternalRange = range;
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
