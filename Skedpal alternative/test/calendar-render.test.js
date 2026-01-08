import assert from "assert";
import { describe, it, beforeEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.href = "";
    this.target = "";
    this.rel = "";
    this._innerHTML = "";
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = value;
      }
    };
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
      }
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  remove() {
    if (!this.parentElement) {return;}
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }
}

function findByTestId(root, testId) {
  const matches = [];
  const visit = (node) => {
    if (node?.attributes?.["data-test-skedpal"] === testId) {
      matches.push(node);
    }
    (node?.children || []).forEach(visit);
  };
  visit(root);
  return matches;
}

async function installDomStubs() {
  global.document = {
    createElement: (tagName) => new FakeElement(tagName)
  };
  const { domRefs } = await import("../src/ui/constants.js");
  const { renderCalendar } = await import("../src/ui/calendar.js");
  domRefs.calendarGrid = new FakeElement("div");
  domRefs.calendarTitle = new FakeElement("h3");
  domRefs.calendarDayBtn = new FakeElement("button");
  domRefs.calendarThreeBtn = new FakeElement("button");
  domRefs.calendarWeekBtn = new FakeElement("button");
  return { domRefs, renderCalendar };
}

describe("calendar render", () => {
  let testRefs = null;
  beforeEach(() => {
    return installDomStubs().then(({ domRefs, renderCalendar }) => {
      state.calendarViewMode = "day";
      state.calendarAnchorDate = new Date(2026, 0, 6, 0, 0, 0);
      state.calendarExternalAllowFetch = false;
      state.calendarExternalEvents = [];
      testRefs = { domRefs, renderCalendar };
    });
  });

  it("renders scheduled events with metadata", () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 9, 0, 0);
    const end = new Date(2026, 0, 6, 10, 0, 0);
    const tasks = [
      {
        id: "task-1",
        title: "Focus block",
        link: "https://example.com",
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: start.toISOString(),
            end: end.toISOString(),
            timeMapId: "tm-1",
            occurrenceId: "occ-1"
          }
        ]
      }
    ];
    state.tasksTimeMapsCache = [{ id: "tm-1", color: "#22c55e" }];

    renderCalendar(tasks);

    assert.ok(domRefs.calendarTitle.textContent.includes("2026"));
    assert.ok(domRefs.calendarDayBtn.className.includes("calendar-view-btn--active"));
    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].dataset.eventTaskId, "task-1");
    assert.strictEqual(events[0].dataset.eventOccurrenceId, "occ-1");
    const resizeHandles = findByTestId(events[0], "calendar-event-resize-handle");
    assert.strictEqual(resizeHandles.length, 1);
    const links = findByTestId(events[0], "calendar-event-title-link");
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, "_blank");
  });

  it("renders an empty state when no events are in range", () => {
    const { domRefs, renderCalendar } = testRefs;
    state.tasksTimeMapsCache = [];
    renderCalendar([]);

    const empty = findByTestId(domRefs.calendarGrid, "calendar-empty");
    assert.strictEqual(empty.length, 1);
  });

  it("marks three day view as active", () => {
    const { domRefs, renderCalendar } = testRefs;
    state.calendarViewMode = "three";
    state.tasksTimeMapsCache = [];

    renderCalendar([]);

    assert.ok(domRefs.calendarThreeBtn.className.includes("calendar-view-btn--active"));
    assert.strictEqual(domRefs.calendarDayBtn.className.includes("calendar-view-btn--active"), false);
    assert.strictEqual(domRefs.calendarWeekBtn.className.includes("calendar-view-btn--active"), false);
  });

  it("renders delete action for external calendar events", () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 13, 0, 0);
    const end = new Date(2026, 0, 6, 14, 0, 0);
    state.calendarExternalAllowFetch = false;
    state.calendarExternalEvents = [
      {
        id: "ext-1",
        calendarId: "cal-1",
        title: "External block",
        start,
        end,
        source: "external"
      }
    ];

    renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const deleteButtons = findByTestId(events[0], "calendar-event-external-delete");
    assert.strictEqual(deleteButtons.length, 1);
    const resizeHandles = findByTestId(events[0], "calendar-event-resize-handle");
    assert.strictEqual(resizeHandles.length, 0);
    assert.strictEqual(deleteButtons[0].dataset.eventId, "ext-1");
    assert.strictEqual(deleteButtons[0].dataset.calendarId, "cal-1");
    assert.ok(events[0].dataset.eventStart);
    assert.ok(events[0].dataset.eventEnd);
  });

  it("prefers title URLs over event links and strips UID", () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 12, 0, 0);
    const end = new Date(2026, 0, 6, 13, 0, 0);
    state.calendarExternalAllowFetch = false;
    state.calendarExternalEvents = [
      {
        id: "ext-2",
        calendarId: "cal-2",
        title: "Join https://cisco.webex.com #UID:abc123",
        link: "https://calendar.google.com/event?eid=ext-2",
        start,
        end,
        source: "external"
      }
    ];

    renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const links = findByTestId(events[0], "calendar-event-title-link");
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].href, "https://cisco.webex.com");
    assert.strictEqual(links[0].textContent, "Join");
  });

  it("strips UID from titles without links", () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 15, 0, 0);
    const end = new Date(2026, 0, 6, 16, 0, 0);
    state.calendarExternalAllowFetch = false;
    state.calendarExternalEvents = [
      {
        id: "ext-3",
        calendarId: "cal-3",
        title: "Focus time #UID:xyz789",
        start,
        end,
        source: "external"
      }
    ];

    renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const titles = findByTestId(events[0], "calendar-event-title");
    assert.strictEqual(titles.length, 1);
    assert.strictEqual(titles[0].textContent, "Focus time");
  });

  it("skips scheduled instances that are already completed", () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 9, 0, 0);
    const end = new Date(2026, 0, 6, 10, 0, 0);
    const completed = new Date(start);
    completed.setHours(23, 59, 59, 999);
    const tasks = [
      {
        id: "task-2",
        title: "Repeat block",
        scheduleStatus: "scheduled",
        completedOccurrences: [completed.toISOString()],
        scheduledInstances: [
          {
            start: start.toISOString(),
            end: end.toISOString(),
            timeMapId: "tm-2",
            occurrenceId: "occ-2"
          }
        ]
      }
    ];
    state.tasksTimeMapsCache = [{ id: "tm-2", color: "#22c55e" }];

    renderCalendar(tasks);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 0);
  });
});
