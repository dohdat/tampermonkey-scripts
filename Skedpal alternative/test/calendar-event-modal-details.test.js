import assert from "assert";
import { beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.attributes = {};
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
      }
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

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }
}

function findZoomButton(container, type) {
  for (const row of container.children) {
    const value = row.children?.[1];
    if (value?.dataset?.zoomType && (!type || value.dataset.zoomType === type)) {
      return value;
    }
  }
  return null;
}

describe("calendar event modal details", () => {
  let state = null;
  let renderTaskDetailRows = null;
  let renderExternalDetailRows = null;
  let cleanupCalendarEventModalDetails = null;

  beforeEach(async () => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName)
    };

    ({ state } = await import("../src/ui/state/page-state.js"));
    ({
      cleanupCalendarEventModalDetails,
      renderExternalDetailRows,
      renderTaskDetailRows
    } = await import("../src/ui/calendar-event-modal-details.js"));

    state.settingsCache = {
      sections: [{ id: "section-1", name: "Work" }],
      subsections: { "section-1": [{ id: "sub-1", name: "Planning" }] }
    };
    state.tasksTimeMapsCache = [{ id: "tm-1", name: "Focus", color: "#22c55e" }];
  });

  it("returns early when the container is missing", () => {
    assert.doesNotThrow(() =>
      renderTaskDetailRows(
        { id: "task-1", section: "section-1", subsection: "sub-1" },
        { timeMapId: "tm-1" },
        null,
        () => {}
      )
    );
  });

  it("does not invoke zoom when the handler is missing", () => {
    const container = new FakeElement("div");
    renderTaskDetailRows(
      {
        id: "task-1",
        section: "section-1",
        subsection: "sub-1",
        priority: 2,
        durationMin: 30
      },
      { timeMapId: "tm-1" },
      container,
      null
    );

    const zoomButton = findZoomButton(container, "subsection");
    assert.ok(zoomButton);
    assert.doesNotThrow(() => zoomButton.listeners.click({ currentTarget: zoomButton }));
  });

  it("cleans up zoom listeners and renders external rows without links", () => {
    const container = new FakeElement("div");
    renderTaskDetailRows(
      {
        id: "task-1",
        section: "section-1",
        subsection: "sub-1",
        priority: 2,
        durationMin: 30
      },
      { timeMapId: "tm-1" },
      container,
      () => {}
    );

    const zoomButton = findZoomButton(container, "subsection");
    assert.ok(zoomButton?.listeners?.click);
    cleanupCalendarEventModalDetails();
    assert.strictEqual(zoomButton.listeners.click, undefined);

    const externalContainer = new FakeElement("div");
    renderExternalDetailRows(
      {
        id: "event-1",
        calendarId: "cal-1",
        link: ""
      },
      externalContainer
    );
    const hasAnchors = externalContainer.children.some((row) =>
      row.children.some((child) => child.tagName === "A")
    );
    assert.strictEqual(hasAnchors, false);
  });

  it("invokes the zoom handler with section metadata", () => {
    const container = new FakeElement("div");
    let zoomed = null;
    renderTaskDetailRows(
      {
        id: "task-1",
        section: "section-1",
        subsection: "sub-1"
      },
      { timeMapId: "tm-1" },
      container,
      (payload) => {
        zoomed = payload;
      }
    );

    const zoomButton = findZoomButton(container, "subsection");
    zoomButton.listeners.click({ currentTarget: zoomButton });
    assert.deepStrictEqual(zoomed, {
      type: "subsection",
      sectionId: "section-1",
      subsectionId: "sub-1"
    });
  });

  it("returns early when the external container is missing", () => {
    assert.doesNotThrow(() =>
      renderExternalDetailRows({ id: "event-1", calendarId: "cal-1" }, null)
    );
  });
});
