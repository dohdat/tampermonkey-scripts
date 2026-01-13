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
    this.style = {};
    this._classSet = new Set();
    this.listeners = {};
    this.classList = {
      add: (...names) => names.forEach((n) => this._classSet.add(n)),
      remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classSet.has(name)) {this._classSet.delete(name);}
          else {this._classSet.add(name);}
          return;
        }
        if (force) {this._classSet.add(name);}
        else {this._classSet.delete(name);}
      },
      contains: (name) => this._classSet.has(name)
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

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }

  dispatchEvent(event) {
    const handler = this.listeners[event.type];
    if (handler) {
      handler(event);
    }
    return true;
  }

  querySelector(selector) {
    if (!selector) {return null;}
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      if ((this.className || "").split(" ").includes(className)) {
        return this;
      }
    }
    for (const child of this.children) {
      const match = child.querySelector?.(selector);
      if (match) {return match;}
    }
    return null;
  }
}

function findByTestAttr(root, value) {
  if (!root) {return null;}
  if (root.attributes?.["data-test-skedpal"] === value) {return root;}
  for (const child of root.children || []) {
    const found = findByTestAttr(child, value);
    if (found) {return found;}
  }
  return null;
}

function installDomStubs(elements) {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement("fragment"),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: (selector) => elements.get(selector) || null,
    getElementById: (id) => elements.get(id) || null
  };
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.requestAnimationFrame = (cb) => cb();
}

const elements = new Map();
elements.set("report-list", new FakeElement("div"));
elements.set("[data-test-skedpal='nav-report-badge']", new FakeElement("span"));

installDomStubs(elements);

const { renderReport } = await import("../src/ui/report.js");
const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");

describe("report render", () => {
  beforeEach(() => {
    installDomStubs(elements);
    domRefs.reportList = elements.get("report-list");
    domRefs.reportBadge = elements.get("[data-test-skedpal='nav-report-badge']");
    domRefs.reportList.children = [];
    domRefs.reportBadge.textContent = "";
    domRefs.reportBadge.classList.remove("hidden");
    state.tasksTimeMapsCache = [];
    state.expandedTaskDetails = new Set();
  });

  it("renders an empty report state and hides the badge", () => {
    renderReport([]);
    const empty = findByTestAttr(domRefs.reportList, "report-empty");
    assert.ok(empty);
    assert.strictEqual(domRefs.reportBadge.textContent, "");
    assert.strictEqual(domRefs.reportBadge.classList.contains("hidden"), true);
  });

  it("renders missed rows and badge count", () => {
    const task = {
      id: "t100",
      title: "Missed task",
      scheduleStatus: "scheduled",
      missedCount: 2,
      expectedCount: 0,
      missedLastRun: 0,
      priority: 1,
      durationMin: 30,
      timeMapIds: []
    };
    state.expandedTaskDetails = new Set(["t100"]);
    renderReport([task]);
    const row = findByTestAttr(domRefs.reportList, "report-missed-row");
    const meta = findByTestAttr(domRefs.reportList, "report-missed-meta");
    assert.ok(row);
    assert.ok(meta);
    assert.strictEqual(domRefs.reportBadge.textContent, "1");
    assert.strictEqual(domRefs.reportBadge.classList.contains("hidden"), false);
  });

  it("does not render missed rows for future startFrom tasks", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      const task = {
        id: "t110",
        title: "Future task",
        scheduleStatus: "unscheduled",
        missedCount: 1,
        expectedCount: 0,
        missedLastRun: 0,
        startFrom: "2026-02-02T12:00:00.000Z",
        timeMapIds: []
      };
      renderReport([task]);
      const row = findByTestAttr(domRefs.reportList, "report-missed-row");
      const empty = findByTestAttr(domRefs.reportList, "report-empty");
      assert.strictEqual(row, null);
      assert.ok(empty);
      assert.strictEqual(domRefs.reportBadge.textContent, "");
      assert.strictEqual(domRefs.reportBadge.classList.contains("hidden"), true);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("renders timemap usage rows when data is available", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(Date.UTC(2026, 0, 5, 12, 0, 0));
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new OriginalDate(fixedNow.getTime());
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixedNow.getTime();
      }
    };
    try {
      state.tasksTimeMapsCache = [
        {
          id: "tm-over",
          name: "Over",
          color: "#f97316",
          rules: [{ day: 1, startTime: "09:00", endTime: "10:00" }]
        }
      ];
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
      const tasks = [
        {
          id: "t200",
          scheduleStatus: "scheduled",
          missedCount: 0,
          expectedCount: 0,
          scheduledInstances: [
            {
              start: "2026-01-05T09:00:00.000Z",
              end: "2026-01-05T11:00:00.000Z",
              timeMapId: "tm-over"
            }
          ]
        }
      ];
      renderReport(tasks);
      const row = findByTestAttr(domRefs.reportList, "report-timemap-row");
      const meta = findByTestAttr(domRefs.reportList, "report-timemap-meta");
      assert.ok(row);
      assert.ok(meta);
      assert.ok((meta.innerHTML || "").includes("report-timemap-over"));
    } finally {
      global.Date = OriginalDate;
    }
  });
});
