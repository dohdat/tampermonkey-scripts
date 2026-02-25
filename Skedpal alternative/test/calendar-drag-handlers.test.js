import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.attributes = {};
    this._handlers = new Map();
    this.style = {};
    this.children = [];
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
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

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector() {
    return null;
  }

  closest() {
    return null;
  }

  removeEventListener(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  getBoundingClientRect() {
    return { top: 0, height: 240 };
  }
}

const originalWindow = global.window;
const originalDocument = global.document;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalDateNow = Date.now;
const originalChrome = global.chrome;

describe("calendar drag handlers", () => {
  beforeEach(() => {
    const windowHandlers = new Map();
    const timerCallbacks = new Map();
    let nextTimerId = 1;
    global.window = {
      addEventListener: (type, handler) => {
        if (!windowHandlers.has(type)) {
          windowHandlers.set(type, new Set());
        }
        windowHandlers.get(type).add(handler);
      },
      removeEventListener: (type, handler) => {
        windowHandlers.get(type)?.delete(handler);
      },
      _handlers: windowHandlers,
      _runTimers: () => {
        const callbacks = Array.from(timerCallbacks.values());
        timerCallbacks.clear();
        callbacks.forEach((callback) => callback());
      }
    };
    global.document = {
      elementFromPoint: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    global.setTimeout = (callback) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timerCallbacks.set(id, callback);
      return id;
    };
    global.clearTimeout = (id) => {
      timerCallbacks.delete(id);
    };
    global.window.setTimeout = (...args) => global.setTimeout(...args);
    global.window.clearTimeout = (...args) => global.clearTimeout(...args);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    global.window = originalWindow;
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.chrome = originalChrome;
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

  it("returns null payloads for invalid day keys", async () => {
    const { buildExternalUpdatePayload } = await import(
      "../src/ui/calendar-drag.js?ui=calendar-drag-invalid"
    );
    const payload = buildExternalUpdatePayload(
      { eventId: "evt-2", calendarId: "cal-2" },
      "bad-key",
      60,
      30
    );
    assert.strictEqual(payload, null);
  });

  it("no-ops when drag handlers are already cleaned up or missing grid", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    domRefs.calendarGrid = null;
    const {
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag-noop");

    assert.doesNotThrow(() => ensureCalendarDragHandlers());
    assert.doesNotThrow(() => cleanupCalendarDragHandlers());
  });

  it("runs drag lifecycle and invokes render/click handlers", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    const { state } = await import("../src/ui/state/page-state.js");
    const calendarGrid = new FakeElement("div");
    calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");

    const dayColA = new FakeElement("div");
    dayColA.dataset.day = "2026-02-01";
    dayColA.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColA.appendChild = () => {};

    const dayColB = new FakeElement("div");
    dayColB.dataset.day = "2026-02-02";
    dayColB.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColB.appendChild = () => {};

    const timeLabel = new FakeElement("span");
    const block = new FakeElement("div");
    block.dataset.eventSource = "task";
    block.dataset.eventTaskId = "missing-task";
    block.dataset.eventStart = "2026-02-01T10:00:00.000Z";
    block.dataset.eventEnd = "2026-02-01T11:00:00.000Z";
    block.closest = (selector) => (selector === ".calendar-day-col" ? dayColA : null);
    block.querySelector = (selector) =>
      selector === '[data-test-skedpal="calendar-event-time"]' ? timeLabel : null;
    block.setPointerCapture = () => {};

    const pointerTarget = {
      closest: (selector) => {
        if (selector === ".calendar-event") {return block;}
        return null;
      }
    };

    global.document.elementFromPoint = () => ({
      closest: (selector) => (selector === ".calendar-day-col" ? dayColB : null)
    });
    domRefs.calendarGrid = calendarGrid;
    state.tasksCache = [];

    const {
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag-lifecycle");

    let renderCount = 0;
    let clickCount = 0;
    ensureCalendarDragHandlers({
      onRender: () => {
        renderCount += 1;
      },
      onEventClick: () => {
        clickCount += 1;
      }
    });

    const pointerDown = [...calendarGrid._handlers.get("pointerdown")][0];
    const pointerMove = [...global.window._handlers.get("pointermove")][0];
    const pointerUp = [...global.window._handlers.get("pointerup")][0];
    const click = [...calendarGrid._handlers.get("click")][0];

    pointerDown({
      target: pointerTarget,
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 100
    });
    global.window._runTimers();
    pointerMove({ clientX: 15, clientY: 180 });
    Date.now = () => 2000;
    await pointerUp();
    click({});
    assert.strictEqual(clickCount, 0);
    assert.ok(renderCount > 0);

    cleanupCalendarDragHandlers();
    assert.strictEqual(calendarGrid.dataset.dragReady, "false");
  });

  it("activates drag on fast movement before the delay timer fires", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    const { state } = await import("../src/ui/state/page-state.js");
    const calendarGrid = new FakeElement("div");
    calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");

    const dayColA = new FakeElement("div");
    dayColA.dataset.day = "2026-02-01";
    dayColA.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColA.appendChild = () => {};

    const dayColB = new FakeElement("div");
    dayColB.dataset.day = "2026-02-02";
    dayColB.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColB.appendChild = () => {};

    const block = new FakeElement("div");
    block.dataset.eventSource = "task";
    block.dataset.eventTaskId = "missing-task";
    block.dataset.eventStart = "2026-02-01T10:00:00.000Z";
    block.dataset.eventEnd = "2026-02-01T11:00:00.000Z";
    block.closest = (selector) => (selector === ".calendar-day-col" ? dayColA : null);
    block.setPointerCapture = () => {};

    const pointerTarget = {
      closest: (selector) => {
        if (selector === ".calendar-event") {return block;}
        return null;
      }
    };

    global.document.elementFromPoint = () => ({
      closest: (selector) => (selector === ".calendar-day-col" ? dayColB : null)
    });
    domRefs.calendarGrid = calendarGrid;
    state.tasksCache = [];

    const {
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag-fast-move");

    let renderCount = 0;
    let clickCount = 0;
    ensureCalendarDragHandlers({
      onRender: () => {
        renderCount += 1;
      },
      onEventClick: () => {
        clickCount += 1;
      }
    });

    const pointerDown = [...calendarGrid._handlers.get("pointerdown")][0];
    const pointerMove = [...global.window._handlers.get("pointermove")][0];
    const pointerUp = [...global.window._handlers.get("pointerup")][0];
    const click = [...calendarGrid._handlers.get("click")][0];

    Date.now = () => 1500;
    pointerDown({
      target: pointerTarget,
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 100
    });
    pointerMove({ clientX: 10, clientY: 180 });
    await pointerUp();
    click({});

    assert.ok(renderCount > 0);
    assert.strictEqual(clickCount, 0);

    cleanupCalendarDragHandlers();
  });

  it("runs resize lifecycle and allows click after stale drag timestamp", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    const { state } = await import("../src/ui/state/page-state.js");
    const calendarGrid = new FakeElement("div");
    calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");

    const dayCol = new FakeElement("div");
    dayCol.dataset.day = "2026-02-03";
    dayCol.getBoundingClientRect = () => ({ top: 0, height: 240 });

    const timeLabel = new FakeElement("span");
    const block = new FakeElement("div");
    block.dataset.eventSource = "task";
    block.dataset.eventTaskId = "missing-task";
    block.dataset.eventStart = "2026-02-03T10:00:00.000Z";
    block.dataset.eventEnd = "2026-02-03T11:00:00.000Z";
    block.closest = (selector) => (selector === ".calendar-day-col" ? dayCol : null);
    block.querySelector = (selector) =>
      selector === '[data-test-skedpal="calendar-event-time"]' ? timeLabel : null;
    block.setPointerCapture = () => {};

    const resizeHandle = {
      closest: (selector) => (selector === ".calendar-event" ? block : null)
    };
    const pointerTarget = {
      closest: (selector) => {
        if (selector === "[data-calendar-event-resize]") {return resizeHandle;}
        return null;
      }
    };

    domRefs.calendarGrid = calendarGrid;
    state.tasksCache = [];

    const {
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag-resize");

    let clickCount = 0;
    ensureCalendarDragHandlers({
      onRender: () => {},
      onEventClick: () => {
        clickCount += 1;
      }
    });

    const pointerDown = [...calendarGrid._handlers.get("pointerdown")][0];
    const pointerMove = [...global.window._handlers.get("pointermove")][0];
    const pointerUp = [...global.window._handlers.get("pointerup")][0];
    const click = [...calendarGrid._handlers.get("click")][0];

    const fixedNow = 1000;
    Date.now = () => fixedNow;
    pointerDown({
      target: pointerTarget,
      button: 0,
      pointerId: 2,
      clientX: 10,
      clientY: 100
    });
    pointerMove({ clientX: 10, clientY: 210 });
    await pointerUp();

    Date.now = () => fixedNow + 500;
    click({});
    assert.strictEqual(clickCount, 1);

    cleanupCalendarDragHandlers();
  });

  it("handles external drag updates and undo flow", async () => {
    const { domRefs } = await import("../src/ui/constants.js");
    const { state } = await import("../src/ui/state/page-state.js");
    const calendarGrid = new FakeElement("div");
    calendarGrid.setAttribute("data-test-skedpal", "calendar-grid");
    const originalNotificationBanner = domRefs.notificationBanner;
    const originalNotificationMessage = domRefs.notificationMessage;
    const originalNotificationUndoButton = domRefs.notificationUndoButton;
    const originalNotificationCloseButton = domRefs.notificationCloseButton;

    const banner = new FakeElement("div");
    const message = new FakeElement("span");
    const undoButton = new FakeElement("button");
    const closeButton = new FakeElement("button");
    banner.classList.add("hidden");
    domRefs.notificationBanner = banner;
    domRefs.notificationMessage = message;
    domRefs.notificationUndoButton = undoButton;
    domRefs.notificationCloseButton = closeButton;

    const dayColA = new FakeElement("div");
    dayColA.dataset.day = "2026-02-01";
    dayColA.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColA.appendChild = () => {};

    const dayColB = new FakeElement("div");
    dayColB.dataset.day = "2026-02-02";
    dayColB.getBoundingClientRect = () => ({ top: 0, height: 240 });
    dayColB.appendChild = () => {};

    const block = new FakeElement("div");
    block.dataset.eventSource = "external";
    block.dataset.eventExternalId = "evt-1";
    block.dataset.eventCalendarId = "cal-1";
    block.dataset.eventStart = "2026-02-01T10:00:00.000Z";
    block.dataset.eventEnd = "2026-02-01T11:00:00.000Z";
    block.closest = (selector) => (selector === ".calendar-day-col" ? dayColA : null);
    block.setPointerCapture = () => {};

    const pointerTarget = {
      closest: (selector) => {
        if (selector === ".calendar-event") {return block;}
        return null;
      }
    };
    global.document.elementFromPoint = () => ({
      closest: (selector) => (selector === ".calendar-day-col" ? dayColB : null)
    });

    const sentMessages = [];
    global.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (payload, callback) => {
          sentMessages.push(payload);
          callback({ ok: true });
        }
      }
    };

    domRefs.calendarGrid = calendarGrid;
    state.calendarExternalEvents = [
      {
        id: "evt-1",
        calendarId: "cal-1",
        start: new Date("2026-02-01T10:00:00.000Z"),
        end: new Date("2026-02-01T11:00:00.000Z")
      }
    ];
    state.calendarExternalRangeKey = "";
    state.calendarExternalRange = null;

    const {
      ensureCalendarDragHandlers,
      cleanupCalendarDragHandlers
    } = await import("../src/ui/calendar-drag.js?ui=calendar-drag-external");

    let renderCount = 0;
    ensureCalendarDragHandlers({
      onRender: () => {
        renderCount += 1;
      }
    });

    const pointerDown = [...calendarGrid._handlers.get("pointerdown")][0];
    const pointerMove = [...global.window._handlers.get("pointermove")][0];
    const pointerUp = [...global.window._handlers.get("pointerup")][0];

    pointerDown({
      target: pointerTarget,
      button: 0,
      pointerId: 3,
      clientX: 10,
      clientY: 100
    });
    global.window._runTimers();
    pointerMove({ clientX: 10, clientY: 150 });
    await pointerUp();

    assert.ok(sentMessages.length >= 1);
    assert.strictEqual(state.calendarExternalAllowFetch, true);
    assert.ok(typeof undoButton.onclick === "function");
    await undoButton.onclick();
    assert.ok(sentMessages.length >= 2);
    assert.ok(renderCount >= 2);

    cleanupCalendarDragHandlers();
    domRefs.notificationBanner = originalNotificationBanner;
    domRefs.notificationMessage = originalNotificationMessage;
    domRefs.notificationUndoButton = originalNotificationUndoButton;
    domRefs.notificationCloseButton = originalNotificationCloseButton;
  });
});
