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
    this.style = { cssText: "" };
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
      toggle: (name, force) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        const shouldAdd = typeof force === "boolean" ? force : !current.has(name);
        if (shouldAdd) {
          current.add(name);
        } else {
          current.delete(name);
        }
        this.className = Array.from(current).join(" ");
      },
      contains: (name) => this.className.split(" ").includes(name)
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }

  dispatchEvent(event) {
    this.lastDispatched = event;
    const handler = this.listeners[event.type];
    if (handler) {
      handler(event);
    }
    return true;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (
        selector === ".calendar-event-modal__panel" &&
        current.className.split(" ").includes("calendar-event-modal__panel")
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll() {
    return [];
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
    eyebrow: new FakeElement("p"),
    title: new FakeElement("h3"),
    time: new FakeElement("p"),
    details: new FakeElement("div"),
    complete: new FakeElement("input"),
    defer: new FakeElement("input"),
    close: new FakeElement("button"),
    toolbar: new FakeElement("div"),
    actions
  };
}

describe("calendar event modal", () => {
  let refs = null;
  let openCalendarEventModal = null;
  let openExternalEventModal = null;
  let initCalendarEventModal = null;
  let closeCalendarEventModal = null;
  let isCalendarEventModalOpen = null;
  let formatCalendarEventWindow = null;
  let state = null;
  let domRefs = null;

  beforeEach(async () => {
    refs = buildDomRefs();
    const documentListeners = {};
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      querySelectorAll: () => [],
      addEventListener: (type, handler) => {
        documentListeners[type] = handler;
      },
      removeEventListener: () => {},
      getElementById: (id) => {
        if (id === "calendar-event-modal") {return refs.modal;}
        if (id === "calendar-event-modal-title") {return refs.title;}
        if (id === "calendar-event-modal-time") {return refs.time;}
        if (id === "calendar-event-modal-details") {return refs.details;}
        if (id === "calendar-event-modal-complete-checkbox") {return refs.complete;}
        if (id === "calendar-event-modal-defer-date") {return refs.defer;}
        if (id === "task-list") {return new FakeElement("div");}
        return null;
      }
    };
    global.document.body = new FakeElement("body");
    global.document.head = new FakeElement("head");
    global.window = {
      dispatchEvent: () => {},
      location: { href: "https://example.com" },
      innerWidth: 900,
      innerHeight: 700
    };
    global.requestAnimationFrame = (cb) => cb();
    global.history = { replaceState: () => {} };
    global.Event = class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = init?.bubbles || false;
      }
    };
    global.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail || null;
      }
    };

    ({ domRefs } = await import("../src/ui/constants.js"));
    ({ state } = await import("../src/ui/state/page-state.js"));
    ({
      openCalendarEventModal,
      openExternalEventModal,
      initCalendarEventModal,
      closeCalendarEventModal,
      isCalendarEventModalOpen,
      formatCalendarEventWindow
    } = await import("../src/ui/calendar-event-modal.js"));

    domRefs.calendarEventModal = refs.modal;
    domRefs.calendarEventModalEyebrow = refs.eyebrow;
    domRefs.calendarEventModalTitle = refs.title;
    domRefs.calendarEventModalTime = refs.time;
    domRefs.calendarEventModalDetails = refs.details;
    domRefs.calendarEventModalComplete = refs.complete;
    domRefs.calendarEventModalDeferInput = refs.defer;
    domRefs.calendarEventModalToolbar = refs.toolbar;
    domRefs.calendarEventModalCloseButtons = [refs.close];
    domRefs.calendarEventModalActionButtons = refs.actions;
    domRefs.taskList = new FakeElement("div");
    window.__skedpalZoomFromModal = ({ type, sectionId, subsectionId, taskId }) => {
      state.zoomFilter = { type, sectionId, subsectionId, taskId };
    };
    refs.documentListeners = documentListeners;

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
        timeMapIds: ["tm-1"],
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
    refs.actions[2].listeners.click({ currentTarget: refs.actions[2] });
    assert.strictEqual(domRefs.calendarEventModal, refs.modal);
    assert.ok(typeof domRefs.calendarEventModal.classList.remove === "function");
    const modalFromDom = document.getElementById("calendar-event-modal");
    assert.ok(modalFromDom);
    openCalendarEventModal(eventMeta);

    assert.strictEqual(refs.modal.classList.contains("hidden"), false);
    assert.strictEqual(refs.eyebrow.className.includes("hidden"), true);
    assert.strictEqual(refs.eyebrow.hidden, true);
    assert.strictEqual(refs.title.textContent, "Prep for interview");
    assert.ok(refs.details.children.length > 0);
    const timeMapRow = refs.details.children.find((child) => {
      const label = child.children[0];
      return label?.textContent === "TimeMap";
    });
    const timeMapValue = timeMapRow?.children?.[1];
    assert.strictEqual(timeMapValue?.style?.color, "#22c55e");
    refs.actions.forEach((btn) => {
      assert.ok(btn.innerHTML.length > 0);
    });
    assert.strictEqual(refs.defer.lastDispatched?.type, "click");
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

  it("zooms to subsection when clicking detail value", async () => {
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    openCalendarEventModal(eventMeta);

    const subsectionRow = refs.details.children.find((child) => {
      const value = child.children?.[1];
      return value?.dataset?.zoomType === "subsection";
    });
    const value = subsectionRow?.children?.[1];
    assert.strictEqual(value?.dataset?.zoomType, "subsection");
    await value?.listeners?.click?.({ currentTarget: value });

    assert.strictEqual(state.zoomFilter?.type, "subsection");
    assert.strictEqual(state.zoomFilter?.sectionId, "section-work");
    assert.strictEqual(state.zoomFilter?.subsectionId, "subsection-1");
    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
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
    refs.actions[0].listeners.click({ currentTarget: refs.actions[0] });

    assert.strictEqual(clicked, true);
  });

  it("falls back to modal zoom when task button is missing", () => {
    document.querySelector = () => null;
    state.tasksCache = [
      {
        id: "task-0",
        title: "Parent task",
        section: "section-work",
        subsection: "subsection-1",
        completed: false
      },
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
        subtaskParentId: "task-0",
        timeMapIds: ["tm-1"],
        completed: false
      }
    ];
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[1].listeners.click({ currentTarget: refs.actions[1] });

    assert.strictEqual(state.zoomFilter?.type, "task");
    assert.strictEqual(state.zoomFilter?.taskId, "task-0");
    assert.strictEqual(state.zoomFilter?.sectionId, "section-work");
    assert.strictEqual(state.zoomFilter?.subsectionId, "subsection-1");
    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
  });

  it("uses task zoom button when available", () => {
    let clicked = false;
    document.querySelector = (selector) => {
      if (selector === '[data-zoom-task="task-0"]') {
        return { click: () => { clicked = true; } };
      }
      return null;
    };
    state.tasksCache = [
      {
        id: "task-0",
        title: "Parent task",
        section: "section-work",
        subsection: "subsection-1",
        completed: false
      },
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
        subtaskParentId: "task-0",
        timeMapIds: ["tm-1"],
        completed: false
      }
    ];
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[1].listeners.click({ currentTarget: refs.actions[1] });

    assert.strictEqual(clicked, true);
    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
  });

  it("rebuilds modal button refs when missing", () => {
    const actionBtn = new FakeElement("button");
    actionBtn.dataset.calendarEventAction = "zoom";
    const closeBtn = new FakeElement("button");
    closeBtn.dataset.calendarEventClose = "true";
    refs.modal.querySelectorAll = (selector) => {
      if (selector === "[data-calendar-event-action]") {return [actionBtn];}
      if (selector === "[data-calendar-event-close]") {return [closeBtn];}
      return [];
    };
    domRefs.calendarEventModalActionButtons = [];
    domRefs.calendarEventModalCloseButtons = [];

    initCalendarEventModal();

    assert.strictEqual(domRefs.calendarEventModalActionButtons[0], actionBtn);
    assert.strictEqual(domRefs.calendarEventModalCloseButtons[0], closeBtn);
  });

  it("closes when zoom fallback lacks section info", () => {
    document.querySelector = () => null;
    state.tasksCache = [
      {
        id: "task-2",
        title: "Loose task",
        durationMin: 30,
        section: "",
        subsection: "",
        completed: false
      }
    ];
    const eventMeta = {
      taskId: "task-2",
      timeMapId: "",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[1].listeners.click({ currentTarget: refs.actions[1] });

    assert.strictEqual(state.zoomFilter?.type, "task");
    assert.strictEqual(state.zoomFilter?.taskId, "task-2");
    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
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
    refs.actions[0].listeners.click({ currentTarget: refs.actions[0] });

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
    refs.actions[3].listeners.click({ currentTarget: refs.actions[3] });

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

  it("positions the modal when an anchor element is provided", () => {
    const panel = new FakeElement("div");
    panel.getBoundingClientRect = () => ({ width: 320, height: 240 });
    panel.style = {};
    refs.modal.querySelector = (selector) =>
      selector === ".calendar-event-modal__panel" ? panel : null;
    const anchorEl = {
      getBoundingClientRect: () => ({ top: 120, left: 160, right: 260 })
    };
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    openCalendarEventModal(eventMeta, anchorEl);

    assert.strictEqual(panel.style.position, "fixed");
    assert.ok(panel.style.left);
    assert.ok(panel.style.top);
  });

  it("renders external calendar event details without task actions", () => {
    const externalEvent = {
      id: "ext-1",
      calendarId: "cal-1",
      title: "External meeting",
      link: "https://calendar.google.com/event?eid=ext-1",
      start: new Date(2026, 0, 8, 8, 0, 0),
      end: new Date(2026, 0, 8, 9, 0, 0)
    };

    openExternalEventModal(externalEvent);

    assert.strictEqual(refs.eyebrow.textContent, "Google Calendar");
    assert.strictEqual(refs.eyebrow.className.includes("hidden"), false);
    assert.strictEqual(refs.eyebrow.hidden, false);
    assert.strictEqual(refs.toolbar.className.includes("hidden"), false);
    assert.strictEqual(refs.toolbar.hidden, false);
    assert.ok(refs.actions[0].className.includes("hidden"));
    assert.ok(refs.actions[1].className.includes("hidden"));
    assert.ok(refs.actions[2].className.includes("hidden"));
    assert.strictEqual(refs.actions[0].hidden, true);
    assert.strictEqual(refs.actions[1].hidden, true);
    assert.strictEqual(refs.actions[2].hidden, true);
    assert.strictEqual(refs.actions[3].className.includes("hidden"), false);
    assert.strictEqual(refs.actions[4].className.includes("hidden"), false);
    assert.strictEqual(refs.title.textContent, "External meeting");
    assert.ok(refs.details.children.length > 0);
  });

  it("returns early when modal refs are missing", () => {
    const originalModal = domRefs.calendarEventModal;
    domRefs.calendarEventModal = null;
    assert.doesNotThrow(() => initCalendarEventModal());
    assert.doesNotThrow(() => closeCalendarEventModal());
    domRefs.calendarEventModal = originalModal;
  });

  it("uses modal fallback refs when domRefs are empty", () => {
    const originalModal = domRefs.calendarEventModal;
    domRefs.calendarEventModal = null;
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    openCalendarEventModal(eventMeta);

    assert.strictEqual(refs.modal.classList.contains("hidden"), false);
    domRefs.calendarEventModal = originalModal;
  });

  it("returns false when modal lacks a classList", () => {
    const originalModal = domRefs.calendarEventModal;
    domRefs.calendarEventModal = {};
    assert.strictEqual(isCalendarEventModalOpen(), false);
    domRefs.calendarEventModal = originalModal;
  });

  it("uses action handlers without an explicit event object", () => {
    domRefs.calendarEventModalActionButtons = refs.actions;
    initCalendarEventModal();
    assert.doesNotThrow(() => refs.actions[0].listeners.click.call(refs.actions[0]));
  });

  it("skips defer action when the input is unavailable", () => {
    const originalGetElementById = document.getElementById;
    const originalDeferInput = domRefs.calendarEventModalDeferInput;
    document.getElementById = (id) =>
      id === "calendar-event-modal-defer-date" ? null : originalGetElementById(id);
    domRefs.calendarEventModalDeferInput = null;
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.actions[2].listeners.click({ currentTarget: refs.actions[2] });

    assert.strictEqual(refs.defer.lastDispatched, undefined);
    document.getElementById = originalGetElementById;
    domRefs.calendarEventModalDeferInput = originalDeferInput;
  });

  it("ignores outside clicks when the modal is closed", () => {
    initCalendarEventModal();
    refs.documentListeners.click({ target: new FakeElement("div") });
    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
  });

  it("keeps the modal open when clicking inside the panel without closest", () => {
    const panel = { className: "calendar-event-modal__panel", style: {} };
    refs.modal.querySelector = (selector) =>
      selector === ".calendar-event-modal__panel" ? panel : null;
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    refs.documentListeners.click({ target: panel });

    assert.strictEqual(refs.modal.classList.contains("hidden"), false);
  });

  it("returns early for external modal with missing references", () => {
    const originalModal = domRefs.calendarEventModal;
    domRefs.calendarEventModal = null;
    assert.doesNotThrow(() => openExternalEventModal(null));
    domRefs.calendarEventModal = originalModal;
  });

  it("closes the modal when clicking outside the panel", () => {
    const panel = new FakeElement("div");
    panel.className = "calendar-event-modal__panel";
    refs.modal.querySelector = (selector) =>
      selector === ".calendar-event-modal__panel" ? panel : null;
    refs.modal.appendChild(panel);
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    assert.strictEqual(refs.modal.classList.contains("hidden"), false);

    const outsideTarget = new FakeElement("div");
    refs.documentListeners.click({ target: outsideTarget });

    assert.strictEqual(refs.modal.classList.contains("hidden"), true);
  });

  it("keeps the modal open when clicking on another calendar event", () => {
    const panel = new FakeElement("div");
    panel.className = "calendar-event-modal__panel";
    refs.modal.querySelector = (selector) =>
      selector === ".calendar-event-modal__panel" ? panel : null;
    refs.modal.appendChild(panel);
    const eventMeta = {
      taskId: "task-1",
      timeMapId: "tm-1",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 6, 10, 30, 0)
    };

    initCalendarEventModal();
    openCalendarEventModal(eventMeta);
    assert.strictEqual(refs.modal.classList.contains("hidden"), false);

    const eventTarget = {
      closest: (selector) => (selector === ".calendar-event" ? {} : null)
    };
    refs.documentListeners.click({ target: eventTarget });

    assert.strictEqual(refs.modal.classList.contains("hidden"), false);
  });
});
