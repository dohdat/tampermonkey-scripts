import assert from "assert";
import { describe, it, beforeEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import { getCalendarRange } from "../src/ui/calendar-utils.js";
import {
  CALENDAR_EVENTS_CACHE_PREFIX,
  CALENDAR_EXTERNAL_BUFFER_HOURS,
  MS_PER_HOUR
} from "../src/constants.js";

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

function buildRangeKey(range, viewMode, calendarIds) {
  const idsKey = Array.isArray(calendarIds)
    ? calendarIds.filter(Boolean).sort().join(",") || "none"
    : "all";
  return `${CALENDAR_EVENTS_CACHE_PREFIX}${viewMode}:${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
}

function buildBufferedRange(range) {
  return {
    start: new Date(range.start.getTime() - CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    end: new Date(range.end.getTime() + CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR),
    days: range.days
  };
}

describe("calendar render", () => {
  let testRefs = null;
  beforeEach(() => {
    return installDomStubs().then(({ domRefs, renderCalendar }) => {
      state.calendarViewMode = "day";
      state.calendarAnchorDate = new Date(2026, 0, 6, 0, 0, 0);
      state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };
      state.calendarExternalEvents = [];
      state.calendarExternalRangeKey = "";
      state.calendarExternalRange = null;
      testRefs = { domRefs, renderCalendar };
    });
  });

  it("renders scheduled events with metadata", async () => {
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

    await renderCalendar(tasks);

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

  it("renders a hover-only complete control for task events", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 11, 0, 0);
    const end = new Date(2026, 0, 6, 12, 0, 0);
    const tasks = [
      {
        id: "task-complete",
        title: "Finish report",
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: start.toISOString(),
            end: end.toISOString(),
            timeMapId: "tm-quick"
          }
        ]
      }
    ];
    state.tasksTimeMapsCache = [{ id: "tm-quick", color: "#22c55e" }];

    await renderCalendar(tasks);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const completes = findByTestId(events[0], "calendar-event-complete");
    assert.strictEqual(completes.length, 1);
    assert.ok(events[0].className.includes("calendar-event--task"));
  });

  it("renders pin actions for task events", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 11, 0, 0);
    const end = new Date(2026, 0, 6, 12, 0, 0);
    const tasks = [
      {
        id: "task-1",
        title: "Pinned block",
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: start.toISOString(),
            end: end.toISOString(),
            timeMapId: "tm-1",
            occurrenceId: "occ-1",
            pinned: true
          }
        ]
      }
    ];
    state.tasksTimeMapsCache = [{ id: "tm-1", color: "#22c55e" }];

    await renderCalendar(tasks);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const pins = findByTestId(events[0], "calendar-event-pin");
    assert.strictEqual(pins.length, 1);
    assert.strictEqual(pins[0].attributes["aria-pressed"], "true");
    assert.ok(events[0].className.includes("calendar-event--pinned"));
  });

  it("renders an empty state when no events are in range", async () => {
    const { domRefs, renderCalendar } = testRefs;
    state.tasksTimeMapsCache = [];
    const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
    state.calendarExternalRange = range;
    await renderCalendar([]);

    const empty = findByTestId(domRefs.calendarGrid, "calendar-empty");
    assert.strictEqual(empty.length, 1);
  });

  it("marks three day view as active", async () => {
    const { domRefs, renderCalendar } = testRefs;
    state.calendarViewMode = "three";
    state.tasksTimeMapsCache = [];

    const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
    state.calendarExternalRange = range;
    await renderCalendar([]);

    assert.ok(domRefs.calendarThreeBtn.className.includes("calendar-view-btn--active"));
    assert.strictEqual(domRefs.calendarDayBtn.className.includes("calendar-view-btn--active"), false);
    assert.strictEqual(domRefs.calendarWeekBtn.className.includes("calendar-view-btn--active"), false);
  });

  it("renders delete action for external calendar events", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 13, 0, 0);
    const end = new Date(2026, 0, 6, 14, 0, 0);
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

    const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
    const bufferedRange = buildBufferedRange(range);
    state.calendarExternalRange = bufferedRange;
    state.calendarExternalRangeKey = buildRangeKey(
      bufferedRange,
      state.calendarViewMode,
      state.settingsCache.googleCalendarIds
    );
    await renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const deleteButtons = findByTestId(events[0], "calendar-event-external-delete");
    assert.strictEqual(deleteButtons.length, 1);
    const resizeHandles = findByTestId(events[0], "calendar-event-resize-handle");
    assert.strictEqual(resizeHandles.length, 1);
    assert.strictEqual(deleteButtons[0].dataset.eventId, "ext-1");
    assert.strictEqual(deleteButtons[0].dataset.calendarId, "cal-1");
    assert.ok(events[0].dataset.eventStart);
    assert.ok(events[0].dataset.eventEnd);
  });

  it("prefers title URLs over event links and strips UID", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 12, 0, 0);
    const end = new Date(2026, 0, 6, 13, 0, 0);
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

      const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
      const bufferedRange = buildBufferedRange(range);
      state.calendarExternalRange = bufferedRange;
      state.calendarExternalRangeKey = buildRangeKey(
        bufferedRange,
        state.calendarViewMode,
        state.settingsCache.googleCalendarIds
      );
      await renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const links = findByTestId(events[0], "calendar-event-title-link");
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].href, "https://cisco.webex.com");
    assert.strictEqual(links[0].textContent, "Join");
  });

  it("strips UID from titles without links", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 15, 0, 0);
    const end = new Date(2026, 0, 6, 16, 0, 0);
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

      const range = getCalendarRange(state.calendarAnchorDate, state.calendarViewMode);
      const bufferedRange = buildBufferedRange(range);
      state.calendarExternalRange = bufferedRange;
      state.calendarExternalRangeKey = buildRangeKey(
        bufferedRange,
        state.calendarViewMode,
        state.settingsCache.googleCalendarIds
      );
      await renderCalendar([]);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 1);
    const titles = findByTestId(events[0], "calendar-event-title");
    assert.strictEqual(titles.length, 1);
    assert.strictEqual(titles[0].textContent, "Focus time");
  });

  it("skips scheduled instances that are already completed", async () => {
    const { domRefs, renderCalendar } = testRefs;
    const start = new Date(2026, 0, 6, 9, 0, 0);
    const end = new Date(2026, 0, 6, 10, 0, 0);
    const completed = new Date(start);
    completed.setHours(23, 59, 59, 999);
    const localKey = `${completed.getFullYear()}-${String(
      completed.getMonth() + 1
    ).padStart(2, "0")}-${String(completed.getDate()).padStart(2, "0")}`;
    const tasks = [
      {
        id: "task-2",
        title: "Repeat block",
        scheduleStatus: "scheduled",
        completedOccurrences: [localKey],
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

    await renderCalendar(tasks);

    const events = findByTestId(domRefs.calendarGrid, "calendar-event");
    assert.strictEqual(events.length, 0);
  });
});
