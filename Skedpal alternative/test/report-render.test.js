import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

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

function findAllByTestAttr(root, value) {
  if (!root) {return [];}
  const matches = [];
  if (root.attributes?.["data-test-skedpal"] === value) {
    matches.push(root);
  }
  for (const child of root.children || []) {
    matches.push(...findAllByTestAttr(child, value));
  }
  return matches;
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
    removeEventListener: () => {},
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {}
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
    state.reportTimeMapTaskSearch = "";
  });

  afterEach(() => {
    state.reportTimeMapTaskSearch = "";
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
      expectedCount: 1,
      missedLastRun: 1,
      priority: 1,
      durationMin: 30,
      timeMapIds: [],
      repeat: { type: "custom", unit: "week" }
    };
    state.expandedTaskDetails = new Set(["t100"]);
    renderReport([task]);
    const row = findByTestAttr(domRefs.reportList, "report-missed-row");
    const meta = findByTestAttr(domRefs.reportList, "report-missed-meta");
    const delayBtn = findByTestAttr(domRefs.reportList, "report-missed-delay");
    assert.ok(row);
    assert.ok(meta);
    assert.ok(delayBtn);
    assert.strictEqual(domRefs.reportBadge.textContent, "1");
    assert.strictEqual(domRefs.reportBadge.classList.contains("hidden"), false);
  });

  it("does not render delay action for non-repeating tasks", () => {
    const task = {
      id: "t120",
      title: "One-off missed",
      scheduleStatus: "scheduled",
      missedCount: 1,
      expectedCount: 0,
      missedLastRun: 0,
      priority: 2,
      durationMin: 15,
      timeMapIds: [],
      repeat: { type: "none" }
    };
    renderReport([task]);
    const row = findByTestAttr(domRefs.reportList, "report-missed-row");
    const delayBtn = findByTestAttr(domRefs.reportList, "report-missed-delay");
    assert.ok(row);
    assert.strictEqual(delayBtn, null);
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
          title: "Alpha task",
          priority: 1,
          scheduleStatus: "scheduled",
          missedCount: 0,
          expectedCount: 0,
          timeMapIds: ["tm-over"],
          scheduledInstances: [
            {
              start: "2026-01-05T09:00:00.000Z",
              end: "2026-01-05T11:00:00.000Z",
              timeMapId: "tm-over"
            }
          ]
        },
        {
          id: "t201",
          title: "Beta task",
          priority: 4,
          scheduleStatus: "scheduled",
          missedCount: 0,
          expectedCount: 0,
          timeMapIds: ["tm-over"],
          scheduledInstances: []
        }
      ];
      renderReport(tasks);
      const row = findByTestAttr(domRefs.reportList, "report-timemap-row");
      const meta = findByTestAttr(domRefs.reportList, "report-timemap-meta");
      const searchInput = findByTestAttr(domRefs.reportList, "report-timemap-search-input");
      const assignedTitle = findByTestAttr(domRefs.reportList, "report-timemap-assigned-title");
      const assignedTasks = findAllByTestAttr(domRefs.reportList, "report-timemap-assigned-task");
      const assignedLabels = findAllByTestAttr(
        domRefs.reportList,
        "report-timemap-assigned-task-label"
      );
      assert.ok(row);
      assert.ok(meta);
      assert.ok(searchInput);
      assert.ok(assignedTitle);
      assert.strictEqual(assignedTitle.textContent, "Tasks (2):");
      assert.strictEqual(assignedTasks.length, 2);
      assert.strictEqual(assignedLabels[0].textContent, "Beta task");
      assert.strictEqual(assignedLabels[1].textContent, "Alpha task");
      assert.strictEqual(assignedTasks[0].dataset.priority, "4");
      assert.strictEqual(assignedTasks[1].dataset.priority, "1");
      assert.ok((assignedTasks[0].style.backgroundColor || "").includes("--color-amber-400-rgb"));
      assert.ok((assignedTasks[1].style.backgroundColor || "").includes("--color-green-500-rgb"));
      assert.strictEqual(assignedTasks[0].dataset.reportTimemapTask, "t201");
      assert.strictEqual(assignedTasks[1].dataset.reportTimemapTask, "t200");
      assert.ok((meta.innerHTML || "").includes("report-timemap-over"));
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("hides timemap rows that have no assigned tasks", () => {
    state.tasksTimeMapsCache = [
      {
        id: "tm-empty-assignment",
        name: "Unassigned map",
        rules: []
      }
    ];
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
    renderReport([
      {
        id: "t300",
        title: "No map task",
        scheduleStatus: "scheduled",
        missedCount: 0,
        expectedCount: 0,
        timeMapIds: [],
        scheduledInstances: []
      }
    ]);
    const row = findByTestAttr(domRefs.reportList, "report-timemap-row");
    const timemapEmpty = findByTestAttr(domRefs.reportList, "report-timemap-empty");
    assert.strictEqual(row, null);
    assert.ok(timemapEmpty);
    assert.strictEqual(timemapEmpty.textContent, "No TimeMaps with assigned tasks.");
  });

  it("filters assigned tasks by the timemap search query", () => {
    state.reportTimeMapTaskSearch = "beta";
    state.tasksTimeMapsCache = [{ id: "tm-search", name: "Search", rules: [] }];
    renderReport([
      { id: "ta", title: "Alpha task", priority: 1, scheduleStatus: "scheduled", timeMapIds: ["tm-search"] },
      { id: "tb", title: "Beta task", priority: 3, scheduleStatus: "scheduled", timeMapIds: ["tm-search"] }
    ]);
    const searchInput = findByTestAttr(domRefs.reportList, "report-timemap-search-input");
    const assignedLabels = findAllByTestAttr(
      domRefs.reportList,
      "report-timemap-assigned-task-label"
    );
    assert.ok(searchInput);
    assert.strictEqual(searchInput.value, "beta");
    assert.strictEqual(assignedLabels.length, 1);
    assert.strictEqual(assignedLabels[0].textContent, "Beta task");
  });

  it("collapses long assigned task lists behind a more expander", () => {
    state.tasksTimeMapsCache = [
      {
        id: "tm-compact",
        name: "Compact",
        rules: []
      }
    ];
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
    renderReport([
      { id: "t1", title: "Task 1", scheduleStatus: "scheduled", timeMapIds: ["tm-compact"] },
      { id: "t2", title: "Task 2", scheduleStatus: "scheduled", timeMapIds: ["tm-compact"] },
      { id: "t3", title: "Task 3", scheduleStatus: "scheduled", timeMapIds: ["tm-compact"] },
      { id: "t4", title: "Task 4", scheduleStatus: "scheduled", timeMapIds: ["tm-compact"] }
    ]);
    const assignedList = findByTestAttr(domRefs.reportList, "report-timemap-assigned-list");
    const moreToggle = findByTestAttr(domRefs.reportList, "report-timemap-assigned-more-toggle");
    assert.ok(assignedList);
    assert.ok(moreToggle);
    assert.strictEqual(moreToggle.textContent, "+1 more");
    assert.strictEqual(assignedList.children.length, 4);
    assert.strictEqual(
      assignedList.children[3].attributes?.["data-test-skedpal"],
      "report-timemap-assigned-more"
    );
  });
});
