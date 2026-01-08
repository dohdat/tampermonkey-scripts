import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import {
  ensureExternalEvents,
  getExternalEventsForRange,
  invalidateExternalEventsCache,
  primeExternalEventsOnLoad
} from "../src/ui/calendar-external.js";

describe("calendar external events", () => {
  const originalChrome = globalThis.chrome;

  const range = {
    start: new Date("2026-01-07T00:00:00Z"),
    end: new Date("2026-01-08T00:00:00Z")
  };

  beforeEach(() => {
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = "";
    state.calendarExternalPendingKey = "";
    state.calendarExternalAllowFetch = false;
  });

  afterEach(() => {
    globalThis.chrome = originalChrome;
  });

  it("returns empty when no cached range matches", () => {
    assert.deepStrictEqual(getExternalEventsForRange(range), []);
  });

  it("short-circuits when runtime is unavailable", async () => {
    globalThis.chrome = undefined;
    state.calendarExternalAllowFetch = true;
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, false);
    assert.ok(state.calendarExternalRangeKey.length > 0);
  });

  it("stores events returned from the background runtime", async () => {
    const now = new Date();
    state.settingsCache = {
      ...state.settingsCache,
      schedulingHorizonDays: 10,
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
    state.calendarExternalAllowFetch = true;
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.ok(state.calendarExternalEvents[0].start instanceof Date);
    const minDate = new Date(capturedMessage.timeMin);
    const maxDate = new Date(capturedMessage.timeMax);
    assert.deepStrictEqual(capturedMessage.calendarIds, ["calendar-1"]);
    assert.ok(minDate.getTime() >= now.getTime() - 2000);
    assert.strictEqual(maxDate.getHours(), 23);
    assert.strictEqual(maxDate.getMinutes(), 59);
    assert.strictEqual(maxDate.getSeconds(), 59);
    const dayDiff = Math.round((maxDate - minDate) / (24 * 60 * 60 * 1000));
    assert.ok(dayDiff >= 9);
  });

  it("invalidates the cached range and events", () => {
    state.calendarExternalRangeKey = "cached";
    state.calendarExternalPendingKey = "pending";
    state.calendarExternalEvents = [{ id: "evt-1" }];
    invalidateExternalEventsCache();
    assert.strictEqual(state.calendarExternalRangeKey, "");
    assert.strictEqual(state.calendarExternalPendingKey, "");
    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
  });

  it("primes external events once on load", async () => {
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 7 };
    let capturedMessage = null;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          capturedMessage = msg;
          cb({ ok: true, events: [] });
        }
      }
    };
    const updated = await primeExternalEventsOnLoad();
    assert.strictEqual(updated, true);
    assert.ok(capturedMessage);
    assert.strictEqual(state.calendarExternalAllowFetch, false);
    assert.ok(state.calendarExternalRangeKey.length > 0);
  });
});
