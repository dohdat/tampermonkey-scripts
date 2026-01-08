import assert from "assert";
import { describe, it } from "mocha";

import {
  buildExternalEventMeta,
  getUpdatedExternalEvents
} from "../src/ui/calendar-external-events.js";

describe("calendar external drag helpers", () => {
  it("builds external event meta from dataset", () => {
    const meta = buildExternalEventMeta({
      eventExternalId: "evt-1",
      eventCalendarId: "cal-1",
      eventStart: "2026-01-07T10:00:00Z",
      eventEnd: "2026-01-07T11:00:00Z"
    });
    assert.ok(meta);
    assert.strictEqual(meta.source, "external");
    assert.strictEqual(meta.eventId, "evt-1");
    assert.strictEqual(meta.calendarId, "cal-1");
    assert.ok(meta.start instanceof Date);
    assert.ok(meta.end instanceof Date);
  });

  it("updates external event arrays", () => {
    const start = new Date("2026-01-07T10:00:00Z");
    const end = new Date("2026-01-07T11:00:00Z");
    const updated = getUpdatedExternalEvents(
      [
        {
          id: "evt-1",
          calendarId: "cal-1",
          start: new Date("2026-01-07T08:00:00Z"),
          end: new Date("2026-01-07T09:00:00Z")
        }
      ],
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        start,
        end
      }
    );
    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].start.toISOString(), start.toISOString());
    assert.strictEqual(updated[0].end.toISOString(), end.toISOString());
  });
});
