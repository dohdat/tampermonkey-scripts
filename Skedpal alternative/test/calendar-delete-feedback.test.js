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

function buildDeleteButton(options = {}) {
  const {
    eventId = "evt-1",
    calendarId = "cal-1",
    eventTitle = "Focus block"
  } = options;
  const button = new FakeElement("button");
  button.dataset.eventId = eventId;
  button.dataset.calendarId = calendarId;
  button.dataset.eventTitle = eventTitle;
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
    state.calendarExternalDeletedKeys = new Set();
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
    assert.strictEqual(state.calendarExternalEvents.length, 0);

    deleteCallback({ ok: true });
    await pendingDelete;

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
    assert.strictEqual(nodes.message.textContent, "Event deleted.");
    assert.strictEqual(button.disabled, false);
  });

  it("shows an error banner when delete fails", async () => {
    let deleteCallback = null;
    global.chrome.runtime.sendMessage = (_payload, callback) => {
      deleteCallback = callback;
    };

    const { deleteExternalEvent } = await import(
      "../src/ui/calendar.js?test=calendar-delete-feedback-failure"
    );
    const button = buildDeleteButton();
    const pendingDelete = deleteExternalEvent(button);

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(nodes.message.textContent, "Deleting event...");

    deleteCallback({ ok: false, error: "Delete failed" });
    await pendingDelete;

    assert.strictEqual(state.calendarExternalEvents.length, 1);
    assert.strictEqual(state.calendarExternalEvents[0].id, "evt-1");
    assert.strictEqual(nodes.message.textContent, "Delete failed");
    assert.strictEqual(button.disabled, false);
  });

  it("queues rapid deletes and processes both requests", async () => {
    const deleteCallbacks = [];
    global.chrome.runtime.sendMessage = (_payload, callback) => {
      deleteCallbacks.push(callback);
    };

    state.calendarExternalEvents = [
      {
        id: "evt-1",
        calendarId: "cal-1",
        title: "Focus block 1",
        start: new Date("2026-01-08T09:00:00.000Z"),
        end: new Date("2026-01-08T09:30:00.000Z")
      },
      {
        id: "evt-2",
        calendarId: "cal-1",
        title: "Focus block 2",
        start: new Date("2026-01-08T10:00:00.000Z"),
        end: new Date("2026-01-08T10:30:00.000Z")
      }
    ];

    const { deleteExternalEvent } = await import(
      "../src/ui/calendar.js?test=calendar-delete-feedback-queue"
    );
    const firstButton = buildDeleteButton({ eventId: "evt-1", eventTitle: "Focus block 1" });
    const secondButton = buildDeleteButton({ eventId: "evt-2", eventTitle: "Focus block 2" });

    const firstDelete = deleteExternalEvent(firstButton);
    const secondDelete = deleteExternalEvent(secondButton);

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(deleteCallbacks.length, 1);

    state.calendarExternalEvents = [
      {
        id: "evt-2",
        calendarId: "cal-1",
        title: "Focus block 2",
        start: new Date("2026-01-08T10:00:00.000Z"),
        end: new Date("2026-01-08T10:30:00.000Z")
      }
    ];

    deleteCallbacks[0]({ ok: true });
    await firstDelete;

    assert.strictEqual(deleteCallbacks.length, 2);

    deleteCallbacks[1]({ ok: true });
    await secondDelete;

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(state.calendarExternalDeletedKeys.has("cal-1:evt-2"), true);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
    assert.strictEqual(firstButton.disabled, false);
    assert.strictEqual(secondButton.disabled, false);
  });

  it("keeps the third event deleted when removing three events quickly", async () => {
    const deleteCallbacks = [];
    global.chrome.runtime.sendMessage = (_payload, callback) => {
      deleteCallbacks.push(callback);
    };

    state.calendarExternalEvents = [
      {
        id: "evt-1",
        calendarId: "cal-1",
        title: "Focus block 1",
        start: new Date("2026-01-08T09:00:00.000Z"),
        end: new Date("2026-01-08T09:30:00.000Z")
      },
      {
        id: "evt-2",
        calendarId: "cal-1",
        title: "Focus block 2",
        start: new Date("2026-01-08T10:00:00.000Z"),
        end: new Date("2026-01-08T10:30:00.000Z")
      },
      {
        id: "evt-3",
        calendarId: "cal-1",
        title: "Focus block 3",
        start: new Date("2026-01-08T11:00:00.000Z"),
        end: new Date("2026-01-08T11:30:00.000Z")
      }
    ];

    const { deleteExternalEvent } = await import(
      "../src/ui/calendar.js?test=calendar-delete-feedback-queue-three"
    );
    const firstButton = buildDeleteButton({ eventId: "evt-1", eventTitle: "Focus block 1" });
    const secondButton = buildDeleteButton({ eventId: "evt-2", eventTitle: "Focus block 2" });
    const thirdButton = buildDeleteButton({ eventId: "evt-3", eventTitle: "Focus block 3" });

    const firstDelete = deleteExternalEvent(firstButton);
    const secondDelete = deleteExternalEvent(secondButton);
    const thirdDelete = deleteExternalEvent(thirdButton);

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(deleteCallbacks.length, 1);
    assert.strictEqual(state.calendarExternalDeletedKeys.has("cal-1:evt-3"), true);

    state.calendarExternalEvents = [
      {
        id: "evt-3",
        calendarId: "cal-1",
        title: "Focus block 3",
        start: new Date("2026-01-08T11:00:00.000Z"),
        end: new Date("2026-01-08T11:30:00.000Z")
      }
    ];

    deleteCallbacks[0]({ ok: true });
    await firstDelete;
    assert.strictEqual(deleteCallbacks.length, 2);

    state.calendarExternalEvents = [
      {
        id: "evt-3",
        calendarId: "cal-1",
        title: "Focus block 3",
        start: new Date("2026-01-08T11:00:00.000Z"),
        end: new Date("2026-01-08T11:30:00.000Z")
      }
    ];

    deleteCallbacks[1]({ ok: true });
    await secondDelete;
    assert.strictEqual(deleteCallbacks.length, 3);

    deleteCallbacks[2]({ ok: true });
    await thirdDelete;

    assert.strictEqual(state.calendarExternalEvents.length, 0);
    assert.strictEqual(state.calendarExternalDeletedKeys.has("cal-1:evt-3"), true);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
    assert.strictEqual(firstButton.disabled, false);
    assert.strictEqual(secondButton.disabled, false);
    assert.strictEqual(thirdButton.disabled, false);
  });
});
