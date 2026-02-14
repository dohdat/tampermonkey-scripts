import assert from "assert";
import { beforeEach, describe, it } from "mocha";
import { afterEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.style = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
    this._listeners = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) {return;}
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  focus() {
    this._focused = true;
  }

  addEventListener(type, handler) {
    this._listeners[type] = handler;
  }

  removeEventListener(type) {
    delete this._listeners[type];
  }

  querySelector(selector) {
    const match = selector.match(/\[data-day="([^"]+)"\]/);
    if (match) {
      const dayKey = match[1];
      return this.children.find((child) => child.dataset?.day === dayKey) || null;
    }
    const dataTestMatch = selector.match(/\[data-test-skedpal="([^"]+)"\]/);
    if (dataTestMatch) {
      const value = dataTestMatch[1];
      return this.children.find((child) => child.attributes?.["data-test-skedpal"] === value) || null;
    }
    return null;
  }
}

const elementMap = new Map([
  ["calendar-create-modal", new FakeElement("div")],
  ["calendar-create-form", new FakeElement("form")],
  ["calendar-create-title", new FakeElement("input")],
  ["calendar-create-date", new FakeElement("input")],
  ["calendar-create-time", new FakeElement("input")],
  ["calendar-create-duration", new FakeElement("input")],
  ["calendar-create-calendar", new FakeElement("select")],
  ["calendar-event-modal", new FakeElement("div")]
]);

function installDomStubs() {
  global.document = {
    body: new FakeElement("body"),
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elementMap.get(id) || null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.chrome = {
    runtime: {
      sendMessage: (_message, callback) => {
        callback({
          ok: true,
          calendars: [{ id: "cal-1", summary: "Work", primary: true }]
        });
      }
    }
  };
}

function resetElements() {
  elementMap.forEach((el) => {
    el.children = [];
    el.dataset = {};
    el.attributes = {};
    el.className = "";
    el.textContent = "";
    el.value = "";
    el._classSet = new Set();
  });
}

describe("calendar create modal", () => {
  let domRefs = null;
  let openCalendarCreateModal = null;
  let originalWarn = null;

  beforeEach(async () => {
    originalWarn = console.warn;
    console.warn = () => {};
    installDomStubs();
    resetElements();
    const constants = await import("../src/ui/constants.js");
    domRefs = constants.domRefs;
    domRefs.calendarCreateModal = elementMap.get("calendar-create-modal");
    domRefs.calendarCreateForm = elementMap.get("calendar-create-form");
    domRefs.calendarCreateTitle = elementMap.get("calendar-create-title");
    domRefs.calendarCreateDate = elementMap.get("calendar-create-date");
    domRefs.calendarCreateTime = elementMap.get("calendar-create-time");
    domRefs.calendarCreateDuration = elementMap.get("calendar-create-duration");
    domRefs.calendarCreateCalendarSelect = elementMap.get("calendar-create-calendar");
    domRefs.calendarCreateModal.classList.add("hidden");
    domRefs.calendarEventModal = elementMap.get("calendar-event-modal");
    domRefs.calendarEventModal.classList.add("hidden");
    domRefs.calendarCreateCloseButtons = [];
    domRefs.calendarGrid = new FakeElement("div");
    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-08");
    domRefs.calendarGrid.appendChild(dayCol);
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: ["cal-1"] };
    openCalendarCreateModal = (await import("../src/ui/calendar-create-event.js"))
      .openCalendarCreateModal;
  });

  afterEach(() => {
    if (originalWarn) {
      console.warn = originalWarn;
      originalWarn = null;
    }
    if (domRefs) {
      domRefs.calendarGrid = null;
    }
  });

  it("prefills date/time and default calendar", async () => {
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 540 });
    assert.strictEqual(domRefs.calendarCreateDate.value, "2026-01-08");
    assert.strictEqual(domRefs.calendarCreateTime.value, "09:00");
    assert.strictEqual(domRefs.calendarCreateDuration.value, "60");
    assert.strictEqual(domRefs.calendarCreateCalendarSelect.value, "cal-1");
    assert.strictEqual(domRefs.calendarCreateModal.classList.contains("hidden"), false);
    assert.strictEqual(domRefs.calendarGrid.children[0].children.length, 1);
  });

  it("prefers a primary calendar when no selection exists", async () => {
    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({
        ok: true,
        calendars: [
          { id: "cal-2", summary: "Team", primary: true },
          { id: "cal-3", summary: "Personal" }
        ]
      });
    };
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };

    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 540 });
    assert.strictEqual(domRefs.calendarCreateCalendarSelect.value, "cal-2");
  });

  it("shows an empty calendar option when runtime is unavailable", async () => {
    global.chrome = {};
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };

    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 540 });
    const select = domRefs.calendarCreateCalendarSelect;
    assert.strictEqual(select.children.length, 1);
    assert.strictEqual(select.children[0].textContent, "No calendars available");
    assert.strictEqual(select.value, "");
  });

  it("opens from calendar grid click coordinates", async () => {
    const { openCalendarCreateFromClick, initCalendarCreateModal, cleanupCalendarCreateModal } =
      await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-09");
    dayCol.getBoundingClientRect = () => ({ top: 0, height: 1440 });
    domRefs.calendarGrid = new FakeElement("div");
    domRefs.calendarGrid.appendChild(dayCol);
    const target = {
      closest: (selector) => (selector === ".calendar-day-col" ? dayCol : null)
    };
    const handled = openCalendarCreateFromClick({ target, clientY: 360 });
    assert.strictEqual(handled, true);
    assert.strictEqual(domRefs.calendarCreateDate.value, "2026-01-09");
    assert.strictEqual(domRefs.calendarCreateTime.value, "06:00");
    assert.strictEqual(domRefs.calendarGrid.children[0].children.length, 1);
    cleanupCalendarCreateModal();
  });

  it("snaps empty-slot click time to half-hour increments", async () => {
    const { openCalendarCreateFromClick, initCalendarCreateModal, cleanupCalendarCreateModal } =
      await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-09");
    dayCol.getBoundingClientRect = () => ({ top: 0, height: 1440 });
    domRefs.calendarGrid = new FakeElement("div");
    domRefs.calendarGrid.appendChild(dayCol);
    const target = {
      closest: (selector) => (selector === ".calendar-day-col" ? dayCol : null)
    };

    const handled = openCalendarCreateFromClick({ target, clientY: 375 });
    assert.strictEqual(handled, true);
    assert.strictEqual(domRefs.calendarCreateTime.value, "06:30");
    cleanupCalendarCreateModal();
  });

  it("returns false when clicking outside a day column", async () => {
    const { openCalendarCreateFromClick } =
      await import("../src/ui/calendar-create-event.js");
    const handled = openCalendarCreateFromClick({
      target: { closest: () => null },
      clientY: 0
    });
    assert.strictEqual(handled, false);
  });

  it("returns false when the day column has no bounds", async () => {
    const { openCalendarCreateFromClick } =
      await import("../src/ui/calendar-create-event.js");
    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-11");
    const handled = openCalendarCreateFromClick({
      target: { closest: () => dayCol },
      clientY: 0
    });
    assert.strictEqual(handled, false);
  });

  it("closes the event modal instead of creating on empty slot click", async () => {
    const { openCalendarCreateFromClick } =
      await import("../src/ui/calendar-create-event.js");
    domRefs.calendarEventModal.classList.remove("hidden");
    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-10");
    dayCol.getBoundingClientRect = () => ({ top: 0, height: 1440 });
    domRefs.calendarGrid = new FakeElement("div");
    domRefs.calendarGrid.appendChild(dayCol);
    const target = {
      closest: (selector) => (selector === ".calendar-day-col" ? dayCol : null)
    };
    const handled = openCalendarCreateFromClick({ target, clientY: 360 });
    assert.strictEqual(handled, true);
    assert.strictEqual(domRefs.calendarEventModal.classList.contains("hidden"), true);
    assert.strictEqual(domRefs.calendarCreateDate.value, "");
    assert.strictEqual(domRefs.calendarGrid.children[0].children.length, 0);
  });

  it("closes create modal instead of reopening when already open", async () => {
    const { openCalendarCreateFromClick } =
      await import("../src/ui/calendar-create-event.js");
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 540 });
    assert.strictEqual(domRefs.calendarCreateModal.classList.contains("hidden"), false);

    const dayCol = new FakeElement("div");
    dayCol.setAttribute("data-day", "2026-01-09");
    dayCol.getBoundingClientRect = () => ({ top: 0, height: 1440 });
    domRefs.calendarGrid = new FakeElement("div");
    domRefs.calendarGrid.appendChild(dayCol);
    const target = {
      closest: (selector) => (selector === ".calendar-day-col" ? dayCol : null)
    };

    const handled = openCalendarCreateFromClick({ target, clientY: 360 });
    assert.strictEqual(handled, true);
    assert.strictEqual(domRefs.calendarCreateModal.classList.contains("hidden"), true);
    assert.strictEqual(domRefs.calendarGrid.children[0].children.length, 0);
  });

  it("wires and cleans up create modal listeners", async () => {
    const {
      initCalendarCreateModal,
      cleanupCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");

    const closeButton = new FakeElement("button");
    domRefs.calendarCreateCloseButtons = [closeButton];

    initCalendarCreateModal({ onRender: () => {} });
    assert.strictEqual(domRefs.calendarCreateModal.dataset.modalReady, "true");
    assert.ok(closeButton._listeners.click);

    cleanupCalendarCreateModal();
    assert.strictEqual(domRefs.calendarCreateModal.dataset.modalReady, "false");
    assert.strictEqual(closeButton._listeners.click, undefined);
  });

  it("updates the draft title and ignores invalid time input changes", async () => {
    const {
      initCalendarCreateModal,
      openCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });

    domRefs.calendarCreateTitle.value = "Updated title";
    domRefs.calendarCreateTitle._listeners.input();
    const draftBlock = domRefs.calendarGrid.children[0].children[0];
    const title = draftBlock.querySelector('[data-test-skedpal="calendar-event-draft-title"]');
    assert.strictEqual(title.textContent, "Updated title");

    domRefs.calendarCreateTime.value = "not-a-time";
    assert.doesNotThrow(() => domRefs.calendarCreateTime._listeners.change());
  });

  it("returns early when the draft title element is missing", async () => {
    const {
      initCalendarCreateModal,
      openCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });

    const dayCol = domRefs.calendarGrid.children[0];
    const draftBlock = dayCol.children[0];
    draftBlock.querySelector = () => null;
    domRefs.calendarCreateTitle.value = "Updated title";
    assert.doesNotThrow(() => domRefs.calendarCreateTitle._listeners.input());
  });

  it("updates the draft block on valid input changes", async () => {
    const {
      initCalendarCreateModal,
      openCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });

    const dayCol = domRefs.calendarGrid.children[0];
    const originalBlock = dayCol.children[0];

    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "12:00";
    domRefs.calendarCreateDuration.value = "30";
    domRefs.calendarCreateTime._listeners.change();

    const updatedBlock = dayCol.children[0];
    assert.notStrictEqual(updatedBlock, originalBlock);
    assert.notStrictEqual(updatedBlock.style.top, originalBlock.style.top);
  });

  it("uses the draft day key and default title when inputs are empty", async () => {
    const {
      initCalendarCreateModal,
      openCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 120 });

    domRefs.calendarCreateDate.value = "";
    domRefs.calendarCreateTime.value = "11:00";
    domRefs.calendarCreateDuration.value = "30";
    domRefs.calendarCreateTime._listeners.change();

    domRefs.calendarCreateTitle.value = "";
    domRefs.calendarCreateTitle._listeners.input();
    const dayCol = domRefs.calendarGrid.children[0];
    const draftBlock = dayCol.children[0];
    const title = draftBlock.querySelector('[data-test-skedpal="calendar-event-draft-title"]');
    assert.strictEqual(title.textContent, "(No title)");
  });

  it("validates the create payload on submit", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const submitEvent = { preventDefault: () => {} };

    domRefs.calendarCreateCalendarSelect.value = "";
    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "09:00";
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);

    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "";
    domRefs.calendarCreateTime.value = "09:00";
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);

    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "bad";
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);

    domRefs.calendarCreateDate.value = "invalid-date";
    domRefs.calendarCreateTime.value = "09:00";
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
  });

  it("adds created events and handles failures", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const submitEvent = { preventDefault: () => {} };
    state.calendarExternalEvents = null;

    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "10:00";
    domRefs.calendarCreateDuration.value = "45";

    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({
        ok: true,
        event: {
          id: "evt-1",
          calendarId: "cal-1",
          title: "Meeting",
          start: new Date(2026, 0, 8, 10, 0, 0).toISOString(),
          end: new Date(2026, 0, 8, 10, 45, 0).toISOString()
        }
      });
    };

    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
    assert.strictEqual(state.calendarExternalEvents.length, 1);

    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({ ok: false, error: "nope" });
    };
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
    assert.strictEqual(state.calendarExternalEvents.length, 1);
  });

  it("handles missing time inputs and response payloads without events", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const submitEvent = { preventDefault: () => {} };

    const originalTimeInput = domRefs.calendarCreateTime;
    domRefs.calendarCreateTime = null;
    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "2026-01-08";
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
    domRefs.calendarCreateTime = originalTimeInput;

    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "10:00";
    domRefs.calendarCreateDuration.value = "30";
    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({ ok: true, event: null });
    };
    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
  });

  it("returns early when opening without a modal element", async () => {
    const { openCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    const originalModal = domRefs.calendarCreateModal;
    domRefs.calendarCreateModal = null;

    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });
    domRefs.calendarCreateModal = originalModal;
  });

  it("skips closing when the modal is missing", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const submitEvent = { preventDefault: () => {} };
    const originalModal = domRefs.calendarCreateModal;
    domRefs.calendarCreateModal = null;

    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "10:00";
    domRefs.calendarCreateDuration.value = "30";
    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({
        ok: true,
        event: {
          id: "evt-2",
          calendarId: "cal-1",
          title: "Meeting",
          start: new Date(2026, 0, 8, 10, 0, 0).toISOString(),
          end: new Date(2026, 0, 8, 10, 30, 0).toISOString()
        }
      });
    };

    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
    domRefs.calendarCreateModal = originalModal;
  });

  it("falls back to empty calendars when the runtime errors", async () => {
    const { openCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    global.chrome.runtime.lastError = { message: "boom" };
    global.chrome.runtime.sendMessage = (_message, callback) => {
      callback({ ok: true, calendars: [{ id: "cal-1", summary: "Work" }] });
    };

    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });
    const select = domRefs.calendarCreateCalendarSelect;
    assert.strictEqual(select.value, "");
    assert.strictEqual(select.children[0].textContent, "No calendars available");
    global.chrome.runtime.lastError = null;
  });

  it("closes the modal via overlay click and escape key", async () => {
    const {
      initCalendarCreateModal,
      openCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");
    let keydownHandler = null;
    global.document.addEventListener = (type, handler) => {
      if (type === "keydown") {
        keydownHandler = handler;
      }
    };
    global.document.removeEventListener = () => {};

    initCalendarCreateModal();
    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });

    domRefs.calendarCreateModal._listeners.click({ target: domRefs.calendarCreateModal });
    assert.strictEqual(domRefs.calendarCreateModal.classList.contains("hidden"), true);

    await openCalendarCreateModal({ dayKey: "2026-01-08", startMinutes: 60 });
    keydownHandler({ key: "Escape" });
    assert.strictEqual(domRefs.calendarCreateModal.classList.contains("hidden"), true);
  });

  it("guards init and cleanup when missing modal refs", async () => {
    const {
      initCalendarCreateModal,
      cleanupCalendarCreateModal
    } = await import("../src/ui/calendar-create-event.js");

    const originalModal = domRefs.calendarCreateModal;
    const originalForm = domRefs.calendarCreateForm;
    domRefs.calendarCreateModal = null;
    domRefs.calendarCreateForm = null;

    assert.doesNotThrow(() => initCalendarCreateModal());
    assert.doesNotThrow(() => cleanupCalendarCreateModal());

    domRefs.calendarCreateModal = originalModal;
    domRefs.calendarCreateForm = originalForm;
  });

  it("skips re-initializing the modal when already ready", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    assert.strictEqual(domRefs.calendarCreateModal.dataset.modalReady, "true");
    assert.doesNotThrow(() => initCalendarCreateModal());
  });

  it("ignores draft input updates before a draft is created", async () => {
    const { initCalendarCreateModal, cleanupCalendarCreateModal } =
      await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();

    assert.doesNotThrow(() => domRefs.calendarCreateTitle._listeners.input());
    assert.doesNotThrow(() => domRefs.calendarCreateTime._listeners.change());

    cleanupCalendarCreateModal();
    assert.doesNotThrow(() => cleanupCalendarCreateModal());
  });

  it("handles submit errors without a message", async () => {
    const { initCalendarCreateModal } = await import("../src/ui/calendar-create-event.js");
    initCalendarCreateModal();
    const submitEvent = { preventDefault: () => {} };

    domRefs.calendarCreateCalendarSelect.value = "cal-1";
    domRefs.calendarCreateDate.value = "2026-01-08";
    domRefs.calendarCreateTime.value = "10:00";
    domRefs.calendarCreateDuration.value = "30";
    global.chrome.runtime.sendMessage = () => {
      throw {};
    };

    await domRefs.calendarCreateForm._listeners.submit(submitEvent);
  });
});
