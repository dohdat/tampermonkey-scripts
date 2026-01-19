import assert from "assert";
import { beforeEach, describe, it } from "mocha";

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
    if (child?.tagName === "FRAGMENT") {
      (child.children || []).forEach((nested) => this.appendChild(nested));
      return child;
    }
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }
}

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement("fragment"),
    querySelectorAll: () => [],
    getElementById: () => null
  };
  if (typeof global.requestAnimationFrame !== "function") {
    global.requestAnimationFrame = (callback) => callback();
  }
}

installDomStubs();

const { renderTaskCards } = await import("../src/ui/tasks/task-cards-render.js");

function buildContext(tasks) {
  return {
    tasks,
    timeMapById: new Map(),
    collapsedTasks: new Set(),
    expandedTaskDetails: new Set(),
    computeTotalDuration: () => 0,
    getTaskDepthById: () => 0,
    getSectionName: () => "",
    getSubsectionName: () => ""
  };
}

describe("task cards render", () => {
  beforeEach(() => {
    installDomStubs();
  });

  it("returns early when there are no tasks", () => {
    const container = new FakeElement();
    renderTaskCards(container, [], buildContext([]));
    assert.strictEqual(container.children.length, 0);
  });

  it("renders tasks directly when under the batch size", () => {
    const container = new FakeElement();
    const tasks = [
      { id: "t1", title: "One", durationMin: 30, minBlockMin: 15, timeMapIds: [] },
      { id: "t2", title: "Two", durationMin: 30, minBlockMin: 15, timeMapIds: [] }
    ];
    renderTaskCards(container, tasks, buildContext(tasks), { batchSize: 5 });
    assert.strictEqual(container.children.length, 2);
    assert.strictEqual(container.children[0].dataset.taskId, "t1");
    assert.strictEqual(container.children[1].dataset.taskId, "t2");
  });

  it("renders tasks in batches when above the batch size", () => {
    const container = new FakeElement();
    const tasks = [
      { id: "t3", title: "Three", order: 1, durationMin: 30, minBlockMin: 15, timeMapIds: [] },
      { id: "t4", title: "Four", order: 2, durationMin: 30, minBlockMin: 15, timeMapIds: [] }
    ];
    renderTaskCards(container, tasks, buildContext(tasks), {
      batchSize: 1,
      shouldCancel: () => false
    });
    assert.strictEqual(container.children.length, 2);
    assert.strictEqual(container.children[0].dataset.taskId, "t3");
    assert.strictEqual(container.children[1].dataset.taskId, "t4");
  });
});
