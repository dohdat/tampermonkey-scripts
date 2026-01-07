import assert from "assert";
import { describe, it, beforeEach } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.href = "";
    this.target = "";
    this.rel = "";
    this.listeners = {};
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        names.forEach((name) => current.add(name));
        this.className = Array.from(current).join(" ");
      },
      remove: (...names) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        names.forEach((name) => current.delete(name));
        this.className = Array.from(current).join(" ");
      },
      contains: (name) => this.className.split(" ").includes(name)
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

function buildDomRefs() {
  const modal = new FakeElement("div");
  modal.className = "hidden";
  const actions = [
    new FakeElement("button"),
    new FakeElement("button"),
    new FakeElement("button"),
    new FakeElement("button"),
    new FakeElement("button")
  ];
  actions[0].dataset.calendarEventAction = "complete";
  actions[1].dataset.calendarEventAction = "zoom";
  actions[2].dataset.calendarEventAction = "defer";
  actions[3].dataset.calendarEventAction = "edit";
  actions[4].dataset.calendarEventAction = "delete";
  return {
    modal,
    title: new FakeElement("h3"),
    time: new FakeElement("p"),
    details: new FakeElement("div"),
    complete: new FakeElement("input"),
    defer: new FakeElement("input"),
    close: new FakeElement("button"),
    actions
  };
}

describe("calendar event modal", () => {
  let refs = null;
  let openCalendarEventModal = null;
  let initCalendarEventModal = null;
  let formatCalendarEventWindow = null;
  let state = null;
  let domRefs = null;

  beforeEach(async () => {
    refs = buildDomRefs();
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (id === "calendar-event-modal") return refs.modal;
        if (id === "calendar-event-modal-title") return refs.title;
        if (id === "calendar-event-modal-time") return refs.time;
        if (id === "calendar-event-modal-details") return refs.details;
        if (id === "calendar-event-modal-complete-checkbox") return refs.complete;
        if (id === "calendar-event-modal-defer-date") return refs.defer;
        return null;
      }
    };
    global.document.body = new FakeElement("body");
    global.window = { dispatchEvent: () => {} };
    global.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail || null;
      }
    };

    ({ domRefs } = await import("../src/ui/constants.js"));
    ({ state } = await import("../src/ui/state/page-state.js"));
    ({ openCalendarEventModal, initCalendarEventModal, formatCalendarEventWindow } =
      await import("../src/ui/calendar-event-modal.js"));

    domRefs.calendarEventModal = refs.modal;
    domRefs.calendarEventModalTitle = refs.title;
    domRefs.calendarEventModalTime = refs.time;
    domRefs.calendarEventModalDetails = refs.details;
    domRefs.calendarEventModalComplete = refs.complete;
    domRefs.calendarEventModalDeferInput = refs.defer;
    domRefs.calendarEventModalCloseButtons = [refs.close];
    domRefs.calendarEventModalActionButtons = refs.actions;

    state.tasksCache = [
      {
        id: "task-1",
        title: "Prep for interview",
        durationMin: 90,
        priority: 3,
        deadline: new Date(2026, 0, 10).toISOString(),
        startFrom: new Date(2026, 0, 6).toISOString(),
        link: "https://example.com",
        section: "section-work",
        subsection: "subsection-1",
        completed: false
      }
    ];
    state.settingsCache = {
      sections: [{ id: "section-work", name: "Work" }],
      subsections: { "section-work": [{ id: "subsection-1", name: "Planning" }] }
    };
    state.tasksTimeMapsCache = [{ id: "tm-1", name: "Focus", color: "#22c55e" }];
  });

  it("formats a same-day window with date and time", () => {
    const start = new Date(2026, 0, 6, 9, 0, 0);
    const end = new Date(2026, 0, 6, 10, 30, 0);
    const label = formatCalendarEventWindow(start, end);
    assert.ok(label.includes("|"));
    assert.ok(label.includes("9"));
  });

  it("formats a cross-day window with both dates", () => {
    const start = new Date(2026, 0, 6, 23, 0, 0);
    const end = new Date(2026, 0, 7, 1, 0, 0);
    const label = formatCalendarEventWindow(start, end);
    const startLabel = start.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
    const endLabel = end.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
    assert.ok(label.includes(startLabel));
    assert.ok(label.includes(endLabel));
  });

  it("renders event details and action icons", () => {
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    let pickerOpened = false;
    refs.defer.showPicker = () => {
      pickerOpened = true;
    };
    refs.actions[2].listeners.click();
    assert.strictEqual(domRefs.calendarEventModal, refs.modal);
    assert.ok(typeof domRefs.calendarEventModal.classList.remove === "function");
    const modalFromDom = document.getElementById("calendar-event-modal");
    assert.ok(modalFromDom);
    openCalendarEventModal(eventMeta);

    assert.strictEqual(refs.modal.classList.contains("hidden"), false);
    assert.strictEqual(refs.title.textContent, "Prep for interview");
    assert.ok(refs.details.children.length > 0);
    refs.actions.forEach((btn) => {
      assert.ok(btn.innerHTML.length > 0);
    });
    assert.strictEqual(pickerOpened, true);
  });

  it("falls back to focus when the date picker is unavailable", () => {
    let focused = false;
    refs.defer.showPicker = undefined;
    refs.defer.focus = () => {
      focused = true;
    };

    initCalendarEventModal();
    refs.actions[2].listeners.click();

    assert.strictEqual(focused, true);
  });

  it("renders detail rows without link markup", () => {
    state.tasksCache = [
      {
        id: "task-2",
        title: "Status review",
        durationMin: 30,
        section: "section-work",
        subsection: "",
        completed: false
      }
    ];
    const eventMeta = {
      taskId: "task-2",
      timeMapId: "",
      start: new Date(2026, 0, 8, 9, 0, 0),
      end: new Date(2026, 0, 8, 9, 30, 0)
    };

    openCalendarEventModal(eventMeta);

    assert.ok(refs.details.children.length > 0);
    const hasLink = refs.details.children.some((child) =>
      child.children.some((inner) => inner.tagName === "A")
    );
    assert.strictEqual(hasLink, false);
  });

  it("uses the existing complete button when available", () => {
    let clicked = false;
    document.querySelector = (selector) => {
      if (selector === '[data-complete-task="task-1"]') {
        return { click: () => { clicked = true; } };
      }
      return null;
    };
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[0].listeners.click();

    assert.strictEqual(clicked, true);
  });

  it("dispatches repeat occurrence completion from the calendar modal", () => {
    let dispatched = null;
    window.dispatchEvent = (event) => {
      dispatched = event;
    };
    state.tasksCache = [
      {
        id: "task-3",
        title: "Daily standup",
        durationMin: 15,
        repeat: { type: "custom", unit: "day", interval: 1 },
        completed: false
      }
    ];
    const eventMeta = {
      taskId: "task-3",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 9, 15, 0)
    };
    const expected = new Date(eventMeta.start);
    expected.setHours(23, 59, 59, 999);

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[0].listeners.click();

    assert.ok(dispatched);
    assert.strictEqual(dispatched.type, "skedpal:repeat-occurrence-complete");
    assert.strictEqual(dispatched.detail.taskId, "task-3");
    assert.strictEqual(dispatched.detail.occurrenceIso, expected.toISOString());
  });

  it("dispatches edit events without switching views", () => {
    let dispatched = null;
    window.dispatchEvent = (event) => {
      dispatched = event;
    };
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[3].listeners.click();

    assert.ok(dispatched);
    assert.strictEqual(dispatched.type, "skedpal:task-edit");
    assert.strictEqual(dispatched.detail.taskId, "task-1");
    assert.strictEqual(dispatched.detail.switchView, false);
  });

  it("returns early when the task is missing", () => {
    const eventMeta = {
      taskId: "missing-task",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    openCalendarEventModal(eventMeta);

    assert.strictEqual(refs.title.textContent, "");
  });
});
