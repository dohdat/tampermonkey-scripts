import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

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
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
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
}

installDomStubs();

const { buildZoomTaskZone } = await import("../src/ui/tasks/tasks-zoom-zone.js");
const { TASK_ZONE_CLASS } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");

describe("tasks zoom zone", () => {
  let originalZoomFilter = null;

  beforeEach(() => {
    installDomStubs();
    originalZoomFilter = state.zoomFilter;
    state.zoomFilter = null;
  });

  afterEach(() => {
    state.zoomFilter = originalZoomFilter;
  });

  it("builds a zoom zone with fallback metadata", () => {
    const zone = buildZoomTaskZone([], {}, "token", null, "not-a-fn");
    assert.ok(zone.classList.contains(TASK_ZONE_CLASS));
    assert.strictEqual(zone.dataset.dropSection, "");
    assert.strictEqual(zone.dataset.dropSubsection, "");
    assert.strictEqual(zone.dataset.testSkedpal, "task-zoom-zone");
    assert.strictEqual(zone.children.length, 0);
  });

  it("adds the quick add row when zoom filter is active", () => {
    state.zoomFilter = true;
    const zone = buildZoomTaskZone(
      [],
      {},
      "token",
      { sectionId: "section-1", subsectionId: "sub-1", parentId: "task-1" },
      () => false
    );
    assert.strictEqual(zone.dataset.dropSection, "section-1");
    assert.strictEqual(zone.dataset.dropSubsection, "sub-1");
    assert.strictEqual(zone.children.length, 1);
    assert.strictEqual(zone.children[0].dataset.addTaskRow, "true");
    assert.strictEqual(zone.children[0].dataset.sectionId, "section-1");
    assert.strictEqual(zone.children[0].dataset.subsectionId, "sub-1");
  });
});
