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
    this._innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._handlers = {};
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

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      if (selector === "input" && node.tagName === "INPUT") {
        matches.push(node);
      }
      if (selector === "input[type='checkbox']" && node.tagName === "INPUT") {
        matches.push(node);
      }
      if (selector === "[data-block]" && node.dataset?.block !== undefined) {
        matches.push(node);
      }
      (node.children || []).forEach(walk);
    };
    walk(this);
    return matches;
  }

  querySelector(selector) {
    if (selector?.startsWith("[data-day-row=")) {
      const value = selector.split('"')[1];
      return findFirst(this, (node) => node.dataset?.dayRow === value);
    }
    return null;
  }
}

function findFirst(root, predicate) {
  if (predicate(root)) {return root;}
  for (const child of root.children || []) {
    const found = findFirst(child, predicate);
    if (found) {return found;}
  }
  return null;
}

function createRow({
  day,
  blocks = []
}) {
  return {
    dataset: { dayRow: String(day) },
    querySelectorAll: (selector) => {
      if (selector === "[data-block]") {
        return blocks.map((block) => ({
          dataset: {
            startMinute: block.startMinute,
            endMinute: block.endMinute
          },
          querySelector: (inputSelector) => {
            if (inputSelector === "input[data-start-for]") {
              return { value: block.startTime };
            }
            if (inputSelector === "input[data-end-for]") {
              return { value: block.endTime };
            }
            return null;
          }
        }));
      }
      return [];
    }
  };
}

const elements = new Map();
elements.set("timemap-id", new FakeElement("input"));
elements.set("timemap-name", new FakeElement("input"));
elements.set("timemap-color", new FakeElement("input"));
elements.set("timemap-color-swatch", new FakeElement("div"));
elements.set("timemap-day-rows", new FakeElement("div"));
elements.set("timemap-list", new FakeElement("div"));
elements.set("timemap-form-wrap", new FakeElement("div"));
elements.set("timemap-toggle", new FakeElement("button"));
elements.set("task-timemap-options", new FakeElement("div"));

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    querySelectorAll: () => [],
    getElementById: (id) => elements.get(id) || null
  };
  global.alert = () => {};
  global.crypto = {
    randomUUID: () => "tm-uuid"
  };
}

installDomStubs();
const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");
domRefs.timeMapColorInput = elements.get("timemap-color");
domRefs.timeMapColorSwatch = elements.get("timemap-color-swatch");
domRefs.timeMapDayRows = elements.get("timemap-day-rows");
domRefs.timeMapList = elements.get("timemap-list");
domRefs.timeMapFormWrap = elements.get("timemap-form-wrap");
domRefs.timeMapToggle = elements.get("timemap-toggle");
domRefs.taskTimeMapOptions = elements.get("task-timemap-options");
const timeMaps = await import("../src/ui/time-maps.js");
const {
  collectSelectedValues,
  collectTimeMapRules,
  getTimeMapFormData,
  addTimeMapDay,
  renderDayRows,
  renderTimeMaps,
  renderTaskTimeMapOptions,
  renderTimeMapOptions,
  openTimeMapForm,
  closeTimeMapForm,
  resetTimeMapForm,
  getTimeMapUsageCounts
} = timeMaps;

describe("time maps", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.timeMapColorInput = elements.get("timemap-color");
    domRefs.timeMapColorSwatch = elements.get("timemap-color-swatch");
    domRefs.timeMapDayRows = elements.get("timemap-day-rows");
    domRefs.timeMapList = elements.get("timemap-list");
    domRefs.timeMapFormWrap = elements.get("timemap-form-wrap");
    domRefs.timeMapToggle = elements.get("timemap-toggle");
    domRefs.taskTimeMapOptions = elements.get("task-timemap-options");
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };
    state.googleCalendarListCache = [];
    elements.get("timemap-day-rows").children = [];
    elements.get("timemap-list").children = [];
    elements.get("task-timemap-options").children = [];
  });
  it("collects selected checkbox values", () => {
    const container = {
      querySelectorAll: () => [{ value: "1" }, { value: "tm-a" }, { value: "42" }]
    };
    assert.deepStrictEqual(collectSelectedValues(container), [1, "tm-a", 42]);
  });

  it("collects and sorts time map rules", () => {
    const container = {
      querySelectorAll: () => [
        createRow({
          day: 2,
          blocks: [
            { startMinute: 540, endMinute: 720 },
            { startMinute: 780, endMinute: 720 }
          ]
        }),
        createRow({
          day: 1,
          blocks: [{ startMinute: 600, endMinute: 660 }]
        })
      ]
    };
    const rules = collectTimeMapRules(container);
    assert.deepStrictEqual(rules, [
      { day: 1, startTime: "10:00", endTime: "11:00" },
      { day: 2, startTime: "09:00", endTime: "12:00" }
    ]);
  });

  it("builds time map form data and validates inputs", () => {
    let alertMessage = "";
    global.alert = (msg) => {
      alertMessage = msg;
    };

    elements.get("timemap-name").value = "";
    elements.get("timemap-day-rows").querySelectorAll = () => [];
    assert.strictEqual(getTimeMapFormData(), null);
    assert.strictEqual(alertMessage, "Select at least one day and a valid time window.");

    alertMessage = "";
    elements.get("timemap-name").value = "Work";
    elements.get("timemap-color").value = "#22c55e";
    elements.get("timemap-day-rows").querySelectorAll = () => [
      createRow({
        day: 1,
        blocks: [{ startMinute: 540, endMinute: 720 }]
      })
    ];
    const data = getTimeMapFormData();
    assert.strictEqual(alertMessage, "");
    assert.deepStrictEqual(data, {
      id: "tm-uuid",
      name: "Work",
      rules: [{ day: 1, startTime: "09:00", endTime: "12:00" }],
      color: "#22c55e"
    });

    alertMessage = "";
    elements.get("timemap-name").value = "";
    elements.get("timemap-day-rows").querySelectorAll = () => [
      createRow({
        day: 1,
        blocks: [{ startMinute: 540, endMinute: 720 }]
      })
    ];
    assert.strictEqual(getTimeMapFormData(), null);
    assert.strictEqual(alertMessage, "Name is required.");
  });

  it("renders day rows and toggles blocks", () => {
    const container = elements.get("timemap-day-rows");
    renderDayRows(container, [
      { day: 2, startTime: "09:00", endTime: "12:00" },
      { day: 0, startTime: "08:00", endTime: "10:00" }
    ]);
    const rows = container.children;
    assert.ok(rows.length > 0);
    assert.strictEqual(rows[0].dataset.dayRow, "0");
    assert.strictEqual(rows[1].dataset.dayRow, "2");
    const firstRow = rows[0];
    const blocksContainer = findFirst(firstRow, (child) => child.dataset?.timeline !== undefined);
    const addBlockBtn = findFirst(firstRow, (child) => child.tagName === "BUTTON");
    assert.ok(blocksContainer.children.length > 0);
    assert.ok(addBlockBtn);
  });

  it("renders time map lists and options", () => {
    const list = elements.get("timemap-list");
    renderTimeMaps([]);
    assert.ok(list.innerHTML.includes("No TimeMaps yet"));

    const timeMapsData = [
      { id: "tm-1", name: "Work", days: [1], startTime: "09:00", endTime: "11:00", color: "#22c55e" }
    ];
    state.settingsCache = { ...state.settingsCache, defaultTimeMapId: "tm-1" };
    renderTimeMaps(timeMapsData);
    assert.strictEqual(list.children.length, 1);
    assert.ok(list.children[0].innerHTML.includes("Default"));

    renderTaskTimeMapOptions(timeMapsData, [], "tm-1");
    assert.strictEqual(elements.get("task-timemap-options").children.length, 1);

    renderTaskTimeMapOptions([], [], "tm-1");
    assert.ok(elements.get("task-timemap-options").innerHTML.includes("Create TimeMaps first."));

    const container = new FakeElement("div");
    renderTimeMapOptions(container, ["tm-1"], timeMapsData);
    assert.strictEqual(container.children.length, 1);
  });

  it("counts timemap usage for parent tasks only", () => {
    const tasks = [
      { id: "t1", timeMapIds: ["tm-1", "tm-2"] },
      { id: "t2", timeMapIds: ["tm-1"], subtaskParentId: "t1" },
      { id: "t3", timeMapIds: ["tm-2"] }
    ];
    const counts = getTimeMapUsageCounts(tasks);
    assert.strictEqual(counts.get("tm-1"), 1);
    assert.strictEqual(counts.get("tm-2"), 2);
  });

  it("opens, closes, and resets the time map form", () => {
    const formWrap = elements.get("timemap-form-wrap");
    const toggle = elements.get("timemap-toggle");
    formWrap.classList.add("hidden");
    openTimeMapForm();
    assert.strictEqual(formWrap.classList.contains("hidden"), false);
    assert.strictEqual(toggle.textContent, "Hide TimeMap form");
    closeTimeMapForm();
    assert.strictEqual(formWrap.classList.contains("hidden"), true);
    assert.strictEqual(toggle.textContent, "Show TimeMap form");

    elements.get("timemap-id").value = "tm-1";
    elements.get("timemap-name").value = "Work";
    resetTimeMapForm();
    assert.strictEqual(elements.get("timemap-id").value, "");
    assert.strictEqual(elements.get("timemap-name").value, "");
  });

  it("adds day rows defensively", () => {
    const container = elements.get("timemap-day-rows");
    addTimeMapDay("bad");
    assert.strictEqual(container.children.length, 0);
    addTimeMapDay(1);
    assert.strictEqual(container.children.length, 1);
    addTimeMapDay(1);
    assert.strictEqual(container.children.length, 1);
  });
});
