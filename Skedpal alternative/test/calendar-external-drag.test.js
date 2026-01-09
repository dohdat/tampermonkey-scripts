import assert from "assert";
import { describe, it } from "mocha";

import {
  buildExternalEventMeta,
  getUpdatedExternalEvents,
  sendExternalCreateRequest,
  sendExternalDeleteRequest,
  sendExternalUpdateRequest
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

  it("returns null for invalid external event meta inputs", () => {
    assert.strictEqual(buildExternalEventMeta(null), null);
    assert.strictEqual(
      buildExternalEventMeta({
        eventExternalId: "evt-1",
        eventCalendarId: "cal-1",
        eventStart: "bad",
        eventEnd: "2026-01-07T11:00:00Z"
      }),
      null
    );
    assert.strictEqual(
      buildExternalEventMeta({
        eventExternalId: "",
        eventCalendarId: "cal-1",
        eventStart: "2026-01-07T10:00:00Z",
        eventEnd: "2026-01-07T11:00:00Z"
      }),
      null
    );
    assert.strictEqual(
      buildExternalEventMeta({
        eventExternalId: "evt-1",
        eventCalendarId: "",
        eventStart: "2026-01-07T10:00:00Z",
        eventEnd: "2026-01-07T11:00:00Z"
      }),
      null
    );
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

  it("rejects update requests without a runtime", async () => {
    const payload = {
      calendarId: "cal-1",
      eventId: "evt-1",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    await assert.rejects(
      sendExternalUpdateRequest(null, payload),
      /runtime unavailable/i
    );
  });

  it("rejects update requests when runtime lastError is set", async () => {
    const payload = {
      calendarId: "cal-1",
      eventId: "evt-1",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    const runtime = {
      lastError: { message: "Update failed" },
      sendMessage: (_msg, cb) => cb({ ok: false })
    };
    await assert.rejects(sendExternalUpdateRequest(runtime, payload), /Update failed/);
  });

  it("sends update requests with ISO timestamps", async () => {
    const payload = {
      calendarId: "cal-1",
      eventId: "evt-1",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    let captured = null;
    const runtime = {
      lastError: null,
      sendMessage: (msg, cb) => {
        captured = msg;
        cb({ ok: true });
      }
    };
    const response = await sendExternalUpdateRequest(runtime, payload);
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(captured.type, "calendar-update-event");
    assert.strictEqual(captured.calendarId, "cal-1");
    assert.strictEqual(captured.eventId, "evt-1");
    assert.strictEqual(captured.start, payload.start.toISOString());
    assert.strictEqual(captured.end, payload.end.toISOString());
  });

  it("rejects delete requests without a runtime", async () => {
    const payload = { calendarId: "cal-1", eventId: "evt-1" };
    await assert.rejects(
      sendExternalDeleteRequest(null, payload),
      /runtime unavailable/i
    );
  });

  it("rejects delete requests when runtime lastError is set", async () => {
    const payload = { calendarId: "cal-1", eventId: "evt-1" };
    const runtime = {
      lastError: { message: "Delete failed" },
      sendMessage: (_msg, cb) => cb({ ok: false })
    };
    await assert.rejects(sendExternalDeleteRequest(runtime, payload), /Delete failed/);
  });

  it("sends delete requests", async () => {
    const payload = { calendarId: "cal-1", eventId: "evt-1" };
    let captured = null;
    const runtime = {
      lastError: null,
      sendMessage: (msg, cb) => {
        captured = msg;
        cb({ ok: true });
      }
    };
    const response = await sendExternalDeleteRequest(runtime, payload);
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(captured.type, "calendar-delete-event");
    assert.strictEqual(captured.calendarId, "cal-1");
    assert.strictEqual(captured.eventId, "evt-1");
  });

  it("rejects create requests without a runtime", async () => {
    const payload = {
      calendarId: "cal-1",
      title: "New event",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    await assert.rejects(
      sendExternalCreateRequest(null, payload),
      /runtime unavailable/i
    );
  });

  it("rejects create requests when runtime lastError is set", async () => {
    const payload = {
      calendarId: "cal-1",
      title: "New event",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    const runtime = {
      lastError: { message: "Create failed" },
      sendMessage: (_msg, cb) => cb({ ok: false })
    };
    await assert.rejects(sendExternalCreateRequest(runtime, payload), /Create failed/);
  });

  it("sends create requests with ISO timestamps", async () => {
    const payload = {
      calendarId: "cal-1",
      title: "",
      start: new Date("2026-01-07T10:00:00Z"),
      end: new Date("2026-01-07T11:00:00Z")
    };
    let captured = null;
    const runtime = {
      lastError: null,
      sendMessage: (msg, cb) => {
        captured = msg;
        cb({ ok: true });
      }
    };
    const response = await sendExternalCreateRequest(runtime, payload);
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(captured.type, "calendar-create-event");
    assert.strictEqual(captured.calendarId, "cal-1");
    assert.strictEqual(captured.title, "");
    assert.strictEqual(captured.start, payload.start.toISOString());
    assert.strictEqual(captured.end, payload.end.toISOString());
  });
});
