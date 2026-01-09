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
    this.children.push(child);
    return child;
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

  beforeEach(async () => {
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
});
