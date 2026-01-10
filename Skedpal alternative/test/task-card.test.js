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

function findByInnerHTML(root, text) {
  if (!root) {return null;}
  if ((root.innerHTML || "").includes(text)) {return root;}
  for (const child of root.children || []) {
    const found = findByInnerHTML(child, text);
    if (found) {return found;}
  }
  return null;
}

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: () => [],
    getElementById: () => null
  };
}

installDomStubs();

const { renderTaskCard } = await import("../src/ui/tasks/task-card.js");
const { caretRightIconSvg } = await import("../src/ui/constants.js");

describe("task card", () => {
  beforeEach(() => {
    installDomStubs();
  });
  it("renders core task fields and duration", () => {
    const task = {
      id: "t1",
      title: "Write tests",
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      completed: false,
      scheduleStatus: "unscheduled"
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    assert.strictEqual(card.attributes["data-test-skedpal"], "task-card");
    assert.strictEqual(card.dataset.taskId, "t1");
    const duration = findByTestAttr(card, "task-duration");
    assert.strictEqual(duration.textContent, "30m");
  });

  it("marks completed tasks visually", () => {
    const task = {
      id: "t2",
      title: "Done",
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      completed: true,
      scheduleStatus: "completed"
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    const title = findByTestAttr(card, "task-title");
    const completeBtn = findByTestAttr(card, "task-complete-btn");
    assert.strictEqual(title.style.textDecoration, "line-through");
    assert.strictEqual(completeBtn.classList.contains("task-complete-btn--checked"), true);
  });

  it("shows collapse toggle and aggregates child duration", () => {
    const parent = {
      id: "p1",
      title: "Parent",
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      completed: false
    };
    const child = {
      id: "c1",
      title: "Child",
      durationMin: 60,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      subtaskParentId: "p1",
      completed: false
    };
    const context = {
      tasks: [parent, child],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 90,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(parent, context);
    assert.ok(findByTestAttr(card, "task-collapse-btn"));
    const duration = findByTestAttr(card, "task-duration");
    assert.strictEqual(duration.textContent, "1.5h");
  });

  it("renders expanded details and styles subtasks", () => {
    const task = {
      id: "t3",
      title: "Details",
      durationMin: 30,
      minBlockMin: 15,
      timeMapIds: ["tm-1"],
      completed: false,
      scheduledStart: new Date(2026, 0, 1, 9, 0).toISOString(),
      scheduledEnd: new Date(2026, 0, 1, 10, 0).toISOString(),
      deadline: new Date(2026, 0, 2, 12, 0).toISOString(),
      startFrom: new Date(2026, 0, 1, 0, 0).toISOString(),
      priority: 2,
      section: "s1",
      subsection: "ss1",
      link: "https://example.com"
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus", color: "#22c55e" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(["t3"]),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 1,
      getSectionName: () => "Section",
      getSubsectionName: () => "Subsection"
    };

    const card = renderTaskCard(task, context);
    assert.strictEqual(card.style.marginLeft, "10px");
    assert.strictEqual(card.style.borderStyle, "dashed");
    assert.ok(findByInnerHTML(card, "Start"));
    assert.ok(findByInnerHTML(card, "Start from"));
  });

  it("renders link markup, repeat summary, and unknown timemap names", () => {
    const task = {
      id: "t4",
      title: "Link task",
      durationMin: 45,
      timeMapIds: ["missing"],
      completed: false,
      link: "https://example.com",
      repeat: { type: "custom", unit: "week", interval: 2, weeklyDays: [1, 3] }
    };
    const context = {
      tasks: [task],
      timeMapById: new Map(),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(["t4"]),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    const title = findByTestAttr(card, "task-title");
    assert.ok(title.innerHTML.includes('href="https://example.com"'));
    assert.ok(findByInnerHTML(card, "Repeat: Every 2 weeks"));
    assert.ok(findByInnerHTML(card, "TimeMaps: Unknown"));
  });

  it("shows scheduled summary row and collapsed caret when configured", () => {
    const task = {
      id: "t5",
      title: "Scheduled",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      completed: false,
      scheduledStart: new Date(2026, 0, 1, 9, 15).toISOString()
    };
    const context = {
      tasks: [task, { id: "child", title: "Child", timeMapIds: ["tm-1"], subtaskParentId: "t5" }],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(["t5"]),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 30,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    const summary = findByTestAttr(card, "task-summary-row");
    const collapseBtn = findByTestAttr(card, "task-collapse-btn");
    assert.ok(summary);
    assert.ok(summary.textContent.length > 0);
    assert.strictEqual(collapseBtn.innerHTML, caretRightIconSvg);
  });

  it("shows out-of-range indicator in the summary row", () => {
    const task = {
      id: "t7",
      title: "Repeat outside horizon",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      completed: false,
      scheduledStart: new Date(2026, 0, 1, 9, 15).toISOString(),
      repeat: { type: "custom", unit: "month", interval: 1 }
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => "",
      firstOccurrenceOutOfRangeByTaskId: new Map([["t7", true]])
    };

    const card = renderTaskCard(task, context);
    const summary = findByTestAttr(card, "task-summary-row");
    const indicator = findByTestAttr(card, "task-summary-out-of-range");
    assert.ok(summary);
    assert.ok(indicator);
  });

  it("shows unscheduled indicator in the summary row", () => {
    const task = {
      id: "t8",
      title: "Repeat unscheduled",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      completed: false,
      scheduledStart: new Date(2026, 0, 1, 9, 15).toISOString(),
      repeat: { type: "custom", unit: "week", interval: 1, weeklyDays: [1] }
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => "",
      firstOccurrenceUnscheduledByTaskId: new Map([["t8", true]])
    };

    const card = renderTaskCard(task, context);
    const summary = findByTestAttr(card, "task-summary-row");
    const indicator = findByTestAttr(card, "task-summary-unscheduled");
    assert.ok(summary);
    assert.ok(indicator);
  });

  it("shows future start indicator in the summary row", () => {
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
        id: "t8-future",
        title: "Future start",
        durationMin: 30,
        timeMapIds: ["tm-1"],
        completed: false,
        startFrom: "2026-02-10T12:00:00.000Z"
      };
      const context = {
        tasks: [task],
        timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
        collapsedTasks: new Set(),
        expandedTaskDetails: new Set(),
        computeTotalDuration: () => 0,
        getTaskDepthById: () => 0,
        getSectionName: () => "",
        getSubsectionName: () => ""
      };

      const card = renderTaskCard(task, context);
      const summary = findByTestAttr(card, "task-summary-row");
      const indicator = findByTestAttr(card, "task-summary-future-start");
      assert.ok(summary);
      assert.ok(indicator);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("shows reminder controls and overdue indicator", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const task = {
      id: "t9",
      title: "Reminder",
      durationMin: 20,
      timeMapIds: ["tm-1"],
      completed: false,
      reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }]
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    const remindBtn = findByTestAttr(card, "task-menu-remind");
    assert.ok(remindBtn);
    assert.strictEqual(card.classList.contains("task-card--reminder-alert"), true);
  });

  it("hides reminder alert when dismissed", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const task = {
      id: "t10",
      title: "Reminder",
      durationMin: 20,
      timeMapIds: ["tm-1"],
      completed: false,
      reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: past }]
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    assert.strictEqual(card.classList.contains("task-card--reminder-alert"), false);
  });

  it("skips details when not expanded", () => {
    const task = {
      id: "t6",
      title: "No details",
      durationMin: 15,
      timeMapIds: ["tm-1"],
      completed: false
    };
    const context = {
      tasks: [task],
      timeMapById: new Map([["tm-1", { id: "tm-1", name: "Focus" }]]),
      collapsedTasks: new Set(),
      expandedTaskDetails: new Set(),
      computeTotalDuration: () => 0,
      getTaskDepthById: () => 0,
      getSectionName: () => "",
      getSubsectionName: () => ""
    };

    const card = renderTaskCard(task, context);
    assert.strictEqual(findByTestAttr(card, "task-meta"), null);
    assert.strictEqual(findByTestAttr(card, "task-status-details"), null);
  });
});
