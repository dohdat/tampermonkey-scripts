import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import { ensureExternalEvents, getExternalEventsForRange } from "../src/ui/calendar-external.js";

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
  });

  afterEach(() => {
    globalThis.chrome = originalChrome;
  });

  it("returns empty when no cached range matches", () => {
    assert.deepStrictEqual(getExternalEventsForRange(range), []);
  });

  it("short-circuits when runtime is unavailable", async () => {
    globalThis.chrome = undefined;
    const updated = await ensureExternalEvents(range);
    assert.strictEqual(updated, false);
    assert.strictEqual(state.calendarExternalRangeKey.includes("2026-01-07"), true);
  });

  it("stores events returned from the background runtime", async () => {
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_msg, cb) => {
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
  });
});
