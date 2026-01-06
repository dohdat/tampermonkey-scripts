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
    const classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => classSet.add(n)),
      remove: (...names) => names.forEach((n) => classSet.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (classSet.has(name)) classSet.delete(name);
          else classSet.add(name);
          return;
        }
        if (force) classSet.add(name);
        else classSet.delete(name);
      },
      contains: (name) => classSet.has(name)
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
  if (!root) return null;
  if (root.attributes?.["data-test-skedpal"] === value) return root;
  for (const child of root.children || []) {
    const found = findByTestAttr(child, value);
    if (found) return found;
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
});
