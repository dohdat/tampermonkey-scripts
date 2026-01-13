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

function findByTestAttr(root, value) {
  if (!root) {return null;}
  if (root.attributes?.["data-test-skedpal"] === value) {return root;}
  for (const child of root.children || []) {
    const found = findByTestAttr(child, value);
    if (found) {return found;}
  }
  return null;
}

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement("fragment"),
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

installDomStubs();

const { buildZoomTaskZone } = await import("../src/ui/tasks/tasks-zoom-zone.js");
const { TASK_ZONE_CLASS } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");

describe("tasks render", () => {
  beforeEach(() => {
    installDomStubs();
    state.zoomFilter = {
      type: "task",
      taskId: "task-1",
      sectionId: "section-1",
      subsectionId: "sub-1"
    };
  });

  it("builds a zoom task drop zone with add-row metadata", () => {
    const zone = buildZoomTaskZone([], {}, 1, {
      sectionId: "section-1",
      subsectionId: "sub-1",
      parentId: "task-1"
    });

    assert.ok(zone.classList.contains(TASK_ZONE_CLASS));
    assert.strictEqual(zone.dataset.dropSection, "section-1");
    assert.strictEqual(zone.dataset.dropSubsection, "sub-1");
    const addRow = findByTestAttr(zone, "task-add-row");
    assert.ok(addRow);
    assert.strictEqual(addRow.dataset.sectionId, "section-1");
    assert.strictEqual(addRow.dataset.subsectionId, "sub-1");
  });
});
