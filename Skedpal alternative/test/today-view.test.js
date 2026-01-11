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

const todayList = new FakeElement("div");

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: () => [],
    getElementById: (id) => (id === "today-list" ? todayList : null)
  };
}

installDomStubs();

const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
const { refreshTodayView, renderTodayView } = await import("../src/ui/tasks/today-view.js");

describe("today view", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.todayList = todayList;
    todayList.children = [];
    todayList.attributes = {};
    state.settingsCache = { ...state.settingsCache, sections: [], subsections: {} };
    state.calendarExternalEvents = [];
    state.calendarExternalRange = null;
    state.calendarExternalRangeKey = "";
  });

  it("renders tasks scheduled for today", () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const tasks = [
      {
        id: "t1",
        title: "Today",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        scheduleStatus: "scheduled",
        scheduledInstances: [{ start: new Date(2026, 0, 6, 10, 0).toISOString() }]
      },
      {
        id: "t2",
        title: "Tomorrow",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        scheduleStatus: "scheduled",
        scheduledStart: new Date(2026, 0, 7, 10, 0).toISOString()
      }
    ];
    const timeMaps = [{ id: "tm-1", name: "Focus" }];

    renderTodayView(tasks, timeMaps, { now });

    const card = findByTestAttr(todayList, "task-card");
    assert.ok(card);
    assert.strictEqual(findByTestAttr(todayList, "today-empty"), null);
  });

  it("shows empty state when nothing is scheduled today", () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const tasks = [];
    renderTodayView(tasks, [], { now });
    assert.ok(findByTestAttr(todayList, "today-empty"));
  });

  it("renders external events scheduled for today", () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const dayStart = new Date(2026, 0, 6, 0, 0);
    const dayEnd = new Date(2026, 0, 6, 23, 59, 59, 999);
    state.calendarExternalRange = { start: dayStart, end: dayEnd };
    state.calendarExternalEvents = [
      {
        id: "evt-1",
        calendarId: "cal-1",
        title: "Standup",
        link: "https://calendar.google.com/event?eid=evt-1",
        start: new Date(2026, 0, 6, 10, 0),
        end: new Date(2026, 0, 6, 10, 30),
        source: "external"
      }
    ];

    renderTodayView([], [], { now });

    assert.ok(findByTestAttr(todayList, "today-external-card"));
    assert.strictEqual(findByTestAttr(todayList, "today-empty"), null);
  });

  it("renders external events without links", () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const dayStart = new Date(2026, 0, 6, 0, 0);
    const dayEnd = new Date(2026, 0, 6, 23, 59, 59, 999);
    state.calendarExternalRange = { start: dayStart, end: dayEnd };
    state.calendarExternalEvents = [
      {
        id: "evt-2",
        calendarId: "cal-1",
        title: "Overnight",
        link: "",
        start: new Date(2026, 0, 5, 23, 0),
        end: new Date(2026, 0, 6, 1, 0),
        source: "external"
      }
    ];

    renderTodayView([], [], { now });

    assert.ok(findByTestAttr(todayList, "today-external-title"));
    assert.strictEqual(findByTestAttr(todayList, "today-external-title-link"), null);
  });

  it("refreshes today view external events on demand", async () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const previousChrome = global.chrome;
    global.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_message, callback) => callback({ ok: true, events: [] })
      }
    };

    try {
      const updated = await refreshTodayView([], [], { now });
      assert.strictEqual(updated, true);
      assert.ok(state.calendarExternalRange);
    } finally {
      if (previousChrome === undefined) {
        delete global.chrome;
      } else {
        global.chrome = previousChrome;
      }
    }
  });

  it("returns false when external events cannot refresh", async () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const previousChrome = global.chrome;
    delete global.chrome;

    try {
      const updated = await refreshTodayView([], [], { now });
      assert.strictEqual(updated, false);
    } finally {
      if (previousChrome !== undefined) {
        global.chrome = previousChrome;
      }
    }
  });

  it("honors expanded task details state", () => {
    const now = new Date(2026, 0, 6, 9, 0);
    const tasks = [
      {
        id: "t1",
        title: "Today",
        durationMin: 30,
        minBlockMin: 30,
        timeMapIds: ["tm-1"],
        priority: 2,
        scheduleStatus: "scheduled",
        scheduledStart: new Date(2026, 0, 6, 10, 0).toISOString()
      }
    ];
    const timeMaps = [{ id: "tm-1", name: "Focus" }];

    renderTodayView(tasks, timeMaps, {
      now,
      expandedTaskDetails: new Set(["t1"])
    });

    assert.ok(findByTestAttr(todayList, "task-meta"));
  });
});
