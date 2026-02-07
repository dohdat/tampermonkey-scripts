import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.attributes = {};
    this._handlers = new Map();
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      this.dataset[key] = String(value);
    }
  }

  addEventListener(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }
}

const originalWindow = global.window;

describe("calendar drag handlers", () => {
  beforeEach(() => {
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("builds external update payloads and toggles handlers", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    const calendarGrid = new FakeElement("div");
    calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");
    domRefs.calendarGrid = calendarGrid;

    const {
      buildExternalUpdatePayload,
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag");

    const payload = buildExternalUpdatePayload(
      { eventId: "evt-1", calendarId: "cal-1" },
      "2026-02-01",
      60,
      30
    );
    assert.ok(payload);
    assert.strictEqual(payload.eventId, "evt-1");
    assert.strictEqual(payload.calendarId, "cal-1");
    assert.strictEqual(payload.start.getHours(), 1);
    assert.strictEqual(payload.end.getHours(), 1);
    assert.strictEqual(payload.end.getMinutes(), 30);

    ensureCalendarDragHandlers({
      onRender: () => {},
      onEventClick: () => {}
    });
    assert.strictEqual(calendarGrid.dataset.dragReady, "true");

    cleanupCalendarDragHandlers();
    assert.strictEqual(calendarGrid.dataset.dragReady, "false");
  });
});
