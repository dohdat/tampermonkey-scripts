import assert from "assert";
import { describe, it } from "mocha";

import {
  clearCachedAuthTokens,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  fetchCalendarEvents,
  fetchCalendarList,
  fetchFreeBusy,
  DEFAULT_CALENDAR_IDS,
  normalizeBusyBlocks,
  normalizeGoogleEvent,
  parseAllDayDate,
  parseGoogleEventTime
} from "../src/background/google-calendar.js";
import { CALENDAR_COLOR_OVERRIDES } from "../src/constants.js";

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

  it("returns null for invalid all-day date values", () => {
    assert.strictEqual(parseAllDayDate("bad-date"), null);
    assert.strictEqual(parseAllDayDate("2026-01"), null);
  });

  it("parses google event time fields", () => {
    const withDateTime = parseGoogleEventTime({ dateTime: "2026-01-07T15:30:00Z" });
    const withDate = parseGoogleEventTime({ date: "2026-01-07" });
    assert.ok(withDateTime instanceof Date);
    assert.ok(withDate instanceof Date);
    assert.strictEqual(withDate.getFullYear(), 2026);
  });

  it("returns null when no google event time fields are present", () => {
    assert.strictEqual(parseGoogleEventTime(null), null);
    assert.strictEqual(parseGoogleEventTime({}), null);
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

  it("applies default titles and color overrides for normalized events", () => {
    const calendarId = Object.keys(CALENDAR_COLOR_OVERRIDES)[0];
    const event = normalizeGoogleEvent(
      {
        id: "evt-2",
        start: { dateTime: "2026-01-07T09:00:00Z" },
        end: { dateTime: "2026-01-07T10:00:00Z" }
      },
      calendarId
    );
    assert.ok(event);
    assert.strictEqual(event.title, "Busy");
    assert.strictEqual(event.colorHex, CALENDAR_COLOR_OVERRIDES[calendarId]);
  });

  it("skips events that have invalid or reversed times", () => {
    const invalid = normalizeGoogleEvent(
      {
        id: "evt-3",
        start: { dateTime: "2026-01-07T10:00:00Z" },
        end: { dateTime: "2026-01-07T10:00:00Z" }
      },
      "calendar-1"
    );
    assert.strictEqual(invalid, null);
  });

  it("normalizes freebusy ranges into busy blocks", () => {
    const busy = normalizeBusyBlocks("calendar-1", [
      { start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" },
      { start: "bad", end: "2026-01-07T12:00:00Z" }
    ]);
    assert.strictEqual(busy.length, 1);
    assert.ok(busy[0].start instanceof Date);
  });

  it("defaults to the configured calendar ids for freebusy", async () => {
    installChrome();
    let capturedBody = "";
    globalThis.fetch = async (_url, options) => {
      capturedBody = options?.body || "";
      return { ok: true, status: 200, json: async () => ({ calendars: {} }) };
    };
    await fetchFreeBusy({
      timeMin: "2026-01-07T00:00:00Z",
      timeMax: "2026-01-08T00:00:00Z"
    });
    const parsed = JSON.parse(capturedBody);
    assert.deepStrictEqual(
      parsed.items.map((item) => item.id),
      DEFAULT_CALENDAR_IDS
    );
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

  it("returns sync tokens and deleted events when incremental sync is enabled", async () => {
    installChrome();
    let capturedUrl = "";
    globalThis.fetch = async (url) => {
      capturedUrl = String(url || "");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "evt-1",
              summary: "Block 1",
              start: { dateTime: "2026-01-07T09:00:00Z" },
              end: { dateTime: "2026-01-07T10:00:00Z" }
            },
            {
              id: "evt-2",
              status: "cancelled",
              start: { dateTime: "2026-01-07T11:00:00Z" },
              end: { dateTime: "2026-01-07T12:00:00Z" }
            }
          ],
          nextSyncToken: "sync-next"
        })
      };
    };
    const result = await fetchCalendarEvents({
      timeMin: "2026-01-07T00:00:00Z",
      timeMax: "2026-01-08T00:00:00Z",
      calendarIds: ["calendar-1"],
      syncTokensByCalendar: { "calendar-1": "sync-1" },
      includeSyncTokens: true
    });
    assert.ok(capturedUrl.includes("syncToken=sync-1"));
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.deletedEvents.length, 1);
    assert.strictEqual(result.deletedEvents[0].id, "evt-2");
    assert.strictEqual(result.syncTokensByCalendar["calendar-1"], "sync-next");
    assert.strictEqual(result.isIncremental, true);
  });

  it("resyncs a calendar when the sync token is gone", async () => {
    installChrome();
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 410,
          text: async () => "gone"
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "evt-3",
              summary: "Resynced",
              start: { dateTime: "2026-01-07T13:00:00Z" },
              end: { dateTime: "2026-01-07T14:00:00Z" }
            }
          ],
          nextSyncToken: "sync-2"
        })
      };
    };
    const result = await fetchCalendarEvents({
      timeMin: "2026-01-07T00:00:00Z",
      timeMax: "2026-01-08T00:00:00Z",
      calendarIds: ["calendar-1"],
      syncTokensByCalendar: { "calendar-1": "stale" },
      includeSyncTokens: true
    });
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].title, "Resynced");
    assert.strictEqual(result.syncTokensByCalendar["calendar-1"], "sync-2");
  });

  it("throws when calendar events fetch fails", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "bad"
    });
    await assert.rejects(
      () =>
        fetchCalendarEvents({
          timeMin: "2026-01-07T00:00:00Z",
          timeMax: "2026-01-08T00:00:00Z",
          calendarIds: ["calendar-1"]
        }),
      /Google Calendar events error/
    );
  });

  it("fetches calendar list entries", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "cal-1",
            summary: "Primary Calendar",
            primary: true,
            accessRole: "owner",
            backgroundColor: "#123456",
            foregroundColor: "#ffffff"
          }
        ]
      })
    });
    const calendars = await fetchCalendarList();
    assert.strictEqual(calendars.length, 1);
    assert.strictEqual(calendars[0].id, "cal-1");
    assert.strictEqual(calendars[0].summary, "Primary Calendar");
    assert.strictEqual(calendars[0].backgroundColor, "#123456");
  });

  it("throws when calendar list fetch fails", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => "denied"
    });
    await assert.rejects(() => fetchCalendarList(), /Google Calendar list error/);
  });

  it("clears cached tokens when the identity API supports it", async () => {
    globalThis.chrome = {
      identity: {
        clearAllCachedAuthTokens: (cb) => cb()
      }
    };
    const cleared = await clearCachedAuthTokens();
    assert.strictEqual(cleared, true);
  });

  it("clears cached tokens with removeCachedAuthToken fallback", async () => {
    let removed = "";
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token-1"),
        removeCachedAuthToken: ({ token }, cb) => {
          removed = token;
          if (typeof cb === "function") {cb();}
        }
      }
    };
    const cleared = await clearCachedAuthTokens();
    assert.strictEqual(cleared, true);
    assert.strictEqual(removed, "token-1");
  });

  it("returns false when clearing tokens is unavailable", async () => {
    globalThis.chrome = undefined;
    const cleared = await clearCachedAuthTokens();
    assert.strictEqual(cleared, false);
  });

  it("returns false when token retrieval fails", async () => {
    globalThis.chrome = {
      identity: {
        lastError: { message: "fail" },
        getAuthToken: (_opts, cb) => cb(null)
      }
    };
    const cleared = await clearCachedAuthTokens();
    assert.strictEqual(cleared, false);
  });

  it("rejects fetches when the identity API is unavailable", async () => {
    globalThis.chrome = {};
    await assert.rejects(() => fetchCalendarList(), /chrome.identity API not available/);
  });

  it("rejects fetches when auth tokens are missing", async () => {
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb(null)
      }
    };
    await assert.rejects(() => fetchCalendarList(), /Missing OAuth token/);
  });

  it("deletes calendar events", async () => {
    installChrome();
    let capturedUrl = "";
    let capturedMethod = "";
    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedMethod = options?.method || "";
      return { ok: true, status: 204, text: async () => "" };
    };
    const deleted = await deleteCalendarEvent("cal-1", "evt-1");
    assert.strictEqual(deleted, true);
    assert.ok(capturedUrl.includes("/calendars/cal-1/events/evt-1"));
    assert.strictEqual(capturedMethod, "DELETE");
  });

  it("throws when deleting without identifiers", async () => {
    await assert.rejects(
      () => deleteCalendarEvent("", "evt-1"),
      /Missing calendarId or eventId/
    );
  });

  it("throws when delete responses fail", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "nope"
    });
    await assert.rejects(
      () => deleteCalendarEvent("cal-1", "evt-1"),
      /Google Calendar delete error/
    );
  });

  it("updates calendar events", async () => {
    installChrome();
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody = "";
    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedMethod = options?.method || "";
      capturedBody = options?.body || "";
      return { ok: true, status: 200, text: async () => "" };
    };
    const updated = await updateCalendarEvent(
      "cal-1",
      "evt-1",
      "2026-01-07T10:00:00Z",
      "2026-01-07T11:00:00Z"
    );
    assert.strictEqual(updated, true);
    assert.ok(capturedUrl.includes("/calendars/cal-1/events/evt-1"));
    assert.strictEqual(capturedMethod, "PATCH");
    assert.ok(capturedBody.includes("\"dateTime\":\"2026-01-07T10:00:00Z\""));
  });

  it("includes colorId when updating calendar events", async () => {
    installChrome();
    let capturedBody = "";
    globalThis.fetch = async (_url, options) => {
      capturedBody = options?.body || "";
      return { ok: true, status: 200, text: async () => "" };
    };
    await updateCalendarEvent(
      "cal-1",
      "evt-2",
      "2026-01-07T12:00:00Z",
      "2026-01-07T13:00:00Z",
      { colorId: "9" }
    );
    assert.ok(capturedBody.includes("\"colorId\":\"9\""));
  });

  it("throws when updating without required data", async () => {
    await assert.rejects(
      () => updateCalendarEvent("cal-1", "", "2026-01-07T10:00:00Z", "2026-01-07T11:00:00Z"),
      /Missing calendar update data/
    );
  });

  it("throws when update responses fail", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "nope"
    });
    await assert.rejects(
      () =>
        updateCalendarEvent(
          "cal-1",
          "evt-1",
          "2026-01-07T10:00:00Z",
          "2026-01-07T11:00:00Z"
        ),
      /Google Calendar update error/
    );
  });

  it("throws when creating without required data", async () => {
    await assert.rejects(
      () => createCalendarEvent("", "Title", "2026-01-07T10:00:00Z", "2026-01-07T11:00:00Z"),
      /Missing calendar create data/
    );
  });

  it("creates calendar events and normalizes responses", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "evt-5",
        summary: "Created",
        start: { dateTime: "2026-01-07T10:00:00Z" },
        end: { dateTime: "2026-01-07T11:00:00Z" }
      })
    });
    const created = await createCalendarEvent(
      "cal-1",
      "Created",
      "2026-01-07T10:00:00Z",
      "2026-01-07T11:00:00Z"
    );
    assert.ok(created);
    assert.strictEqual(created.title, "Created");
  });

  it("includes colorId when creating calendar events", async () => {
    installChrome();
    let capturedBody = "";
    globalThis.fetch = async (_url, options) => {
      capturedBody = options?.body || "";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "evt-6",
          summary: "Created",
          start: { dateTime: "2026-01-07T10:00:00Z" },
          end: { dateTime: "2026-01-07T11:00:00Z" }
        })
      };
    };
    await createCalendarEvent(
      "cal-1",
      "Created",
      "2026-01-07T10:00:00Z",
      "2026-01-07T11:00:00Z",
      { colorId: "1" }
    );
    assert.ok(capturedBody.includes("\"colorId\":\"1\""));
  });

  it("throws when create responses fail", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "nope"
    });
    await assert.rejects(
      () =>
        createCalendarEvent(
          "cal-1",
          "Created",
          "2026-01-07T10:00:00Z",
          "2026-01-07T11:00:00Z"
        ),
      /Google Calendar create error/
    );
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

  it("throws when freebusy responses fail", async () => {
    installChrome();
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "nope"
    });
    await assert.rejects(
      () =>
        fetchFreeBusy({
          timeMin: "2026-01-07T00:00:00Z",
          timeMax: "2026-01-08T00:00:00Z",
          calendarIds: ["calendar-1"]
        }),
      /Google Calendar freeBusy error/
    );
  });
});
