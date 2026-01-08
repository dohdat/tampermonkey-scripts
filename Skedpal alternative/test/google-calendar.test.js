import assert from "assert";
import { describe, it } from "mocha";

import {
  fetchCalendarEvents,
  fetchFreeBusy,
  normalizeBusyBlocks,
  normalizeGoogleEvent,
  parseAllDayDate,
  parseGoogleEventTime
} from "../src/background/google-calendar.js";

describe("google calendar helpers", () => {
  let originalFetch = null;
  let originalChrome = null;

  function installChrome({ onRemoveToken } = {}) {
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("test-token"),
        removeCachedAuthToken: () => {
          if (typeof onRemoveToken === "function") {onRemoveToken();}
        }
      }
    };
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalChrome = globalThis.chrome;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.chrome = originalChrome;
  });

  it("parses all-day dates as local midnight", () => {
    const date = parseAllDayDate("2026-01-07");
    assert.ok(date instanceof Date);
    assert.strictEqual(date.getFullYear(), 2026);
    assert.strictEqual(date.getMonth(), 0);
    assert.strictEqual(date.getDate(), 7);
    assert.strictEqual(date.getHours(), 0);
  });

  it("parses google event time fields", () => {
    const withDateTime = parseGoogleEventTime({ dateTime: "2026-01-07T15:30:00Z" });
    const withDate = parseGoogleEventTime({ date: "2026-01-07" });
    assert.ok(withDateTime instanceof Date);
    assert.ok(withDate instanceof Date);
    assert.strictEqual(withDate.getFullYear(), 2026);
  });

  it("normalizes google events and skips invalid ones", () => {
    const valid = normalizeGoogleEvent(
      {
        id: "evt-1",
        summary: "Focus block",
        htmlLink: "https://calendar.google.com/event?id=evt-1",
        colorId: "2",
        start: { dateTime: "2026-01-07T15:00:00Z" },
        end: { dateTime: "2026-01-07T15:30:00Z" }
      },
      "calendar-1"
    );
    assert.ok(valid);
    assert.strictEqual(valid.calendarId, "calendar-1");
    assert.strictEqual(valid.colorId, "2");
    assert.strictEqual(valid.title, "Focus block");
    const cancelled = normalizeGoogleEvent(
      { status: "cancelled", start: { dateTime: "2026-01-07T15:00:00Z" } },
      "calendar-1"
    );
    assert.strictEqual(cancelled, null);
  });

  it("normalizes freebusy ranges into busy blocks", () => {
    const busy = normalizeBusyBlocks("calendar-1", [
      { start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" },
      { start: "bad", end: "2026-01-07T12:00:00Z" }
    ]);
    assert.strictEqual(busy.length, 1);
    assert.ok(busy[0].start instanceof Date);
  });

  it("fetches paged calendar events", async () => {
    installChrome();
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "evt-1",
                summary: "Block 1",
                colorId: "2",
                start: { dateTime: "2026-01-07T09:00:00Z" },
                end: { dateTime: "2026-01-07T10:00:00Z" }
              }
            ],
            nextPageToken: "next"
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "evt-2",
              summary: "Block 2",
              status: "cancelled",
              start: { dateTime: "2026-01-07T11:00:00Z" },
              end: { dateTime: "2026-01-07T12:00:00Z" }
            }
          ]
        })
      };
    };
    const events = await fetchCalendarEvents({
      timeMin: "2026-01-07T00:00:00Z",
      timeMax: "2026-01-08T00:00:00Z",
      calendarIds: ["calendar-1"]
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].title, "Block 1");
    assert.strictEqual(events[0].colorHex, "");
  });

  it("retries freebusy requests after auth errors", async () => {
    let removed = false;
    installChrome({ onRemoveToken: () => { removed = true; } });
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return {
          ok: false,
          status: 401,
          text: async () => "unauthorized"
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          calendars: {
            "calendar-1": {
              busy: [{ start: "2026-01-07T13:00:00Z", end: "2026-01-07T14:00:00Z" }]
            }
          }
        })
      };
    };
    const busy = await fetchFreeBusy({
      timeMin: "2026-01-07T00:00:00Z",
      timeMax: "2026-01-08T00:00:00Z",
      calendarIds: ["calendar-1"]
    });
    assert.strictEqual(busy.length, 1);
    assert.ok(removed);
  });
});
