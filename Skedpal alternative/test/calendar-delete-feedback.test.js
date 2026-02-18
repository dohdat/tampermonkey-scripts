import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.dataset = {};
    this.children = [];
    this.style = {
      setProperty: () => {}
    };
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classSet.has(name)) {
            this._classSet.delete(name);
          } else {
            this._classSet.add(name);
          }
          return;
        }
        if (force) {
          this._classSet.add(name);
        } else {
          this._classSet.delete(name);
        }
      },
      contains: (name) => this._classSet.has(name)
    };
  }
}

function buildDeleteButton() {
  const button = new FakeElement("button");
  button.dataset.eventId = "evt-1";
  button.dataset.calendarId = "cal-1";
  button.dataset.eventTitle = "Focus block";
  return button;
}

const originalDocument = global.document;
const originalWindow = global.window;
const originalChrome = global.chrome;

describe("calendar external delete feedback", () => {
  let domRefs = null;
  let state = null;
  let nodes = null;
  let originalRefs = null;

  beforeEach(async () => {
    nodes = {
      banner: new FakeElement("div"),
      message: new FakeElement("span"),
      undo: new FakeElement("button"),
      close: new FakeElement("button"),
      title: new FakeElement("div")
    };
    nodes.banner.classList.add("hidden");
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      getElementById: (id) => {
        if (id === "notification-banner") {return nodes.banner;}
        if (id === "notification-message") {return nodes.message;}
        if (id === "notification-undo") {return nodes.undo;}
        if (id === "notification-close") {return nodes.close;}
        if (id === "calendar-title") {return nodes.title;}
        return null;
      },
      querySelectorAll: () => [],
      querySelector: () => null
    };
    global.window = globalThis;
    global.window.confirm = () => true;
    global.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_payload, callback) => callback({ ok: true })
      }
    };

    ({ domRefs } = await import("../src/ui/constants.js"));
    ({ state } = await import("../src/ui/state/page-state.js"));

    originalRefs = {
      notificationBanner: domRefs.notificationBanner,
      notificationMessage: domRefs.notificationMessage,
      notificationUndoButton: domRefs.notificationUndoButton,
      notificationCloseButton: domRefs.notificationCloseButton,
      calendarTitle: domRefs.calendarTitle,
      calendarGrid: domRefs.calendarGrid
    };

    domRefs.notificationBanner = nodes.banner;
    domRefs.notificationMessage = nodes.message;
    domRefs.notificationUndoButton = nodes.undo;
    domRefs.notificationCloseButton = nodes.close;
    domRefs.calendarTitle = nodes.title;
    domRefs.calendarGrid = null;
    domRefs.tasksCalendarSplitWrap = null;
    domRefs.appShell = null;

    state.calendarAnchorDate = new Date(2026, 0, 8);
    state.calendarViewMode = "week";
    state.calendarExternalEvents = [
      {
        id: "evt-1",
        calendarId: "cal-1",
        title: "Focus block",
        start: new Date("2026-01-08T09:00:00.000Z"),
        end: new Date("2026-01-08T09:30:00.000Z")
      }
    ];
    state.calendarExternalRangeKey = "";
    state.calendarExternalRange = null;
    state.calendarExternalAllowFetch = false;
  });

  afterEach(() => {
    if (domRefs && originalRefs) {
      domRefs.notificationBanner = originalRefs.notificationBanner;
      domRefs.notificationMessage = originalRefs.notificationMessage;
      domRefs.notificationUndoButton = originalRefs.notificationUndoButton;
      domRefs.notificationCloseButton = originalRefs.notificationCloseButton;
      domRefs.calendarTitle = originalRefs.calendarTitle;
      domRefs.calendarGrid = originalRefs.calendarGrid;
    }
    global.document = originalDocument;
    global.window = originalWindow;
    global.chrome = originalChrome;
  });

  it("shows deleting feedback immediately and success after completion", async () => {
    let deleteCallback = null;
    global.chrome.runtime.sendMessage = (_payload, callback) => {
      deleteCallback = callback;
    };

    const { deleteExternalEvent } = await import(
      "../src/ui/calendar.js?test=calendar-delete-feedback-success"
    );
    const button = buildDeleteButton();
    const pendingDelete = deleteExternalEvent(button);

    assert.strictEqual(nodes.message.textContent, "Deleting event...");
    assert.strictEqual(button.disabled, true);
    assert.strictEqual(state.calendarExternalEvents.length, 1);

    deleteCallback({ ok: true });
    await pendingDelete;

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
    assert.strictEqual(nodes.message.textContent, "Event deleted.");
    assert.strictEqual(button.disabled, false);
  });

  it("shows an error banner when delete fails", async () => {
    global.chrome.runtime.sendMessage = (_payload, callback) => {
      callback({ ok: false, error: "Delete failed" });
    };

    const { deleteExternalEvent } = await import(
      "../src/ui/calendar.js?test=calendar-delete-feedback-failure"
    );
    const button = buildDeleteButton();

    await deleteExternalEvent(button);

    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.strictEqual(nodes.message.textContent, "Delete failed");
    assert.strictEqual(button.disabled, false);
  });
});
