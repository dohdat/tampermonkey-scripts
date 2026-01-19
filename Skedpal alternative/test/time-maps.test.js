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
    this._innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._handlers = {};
    this._classSet = new Set();
    this.closestResult = {};
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

  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  appendChild(child) {
    if (child?.parentNode) {
      const siblings = child.parentNode.children || [];
      child.parentNode.children = siblings.filter((node) => node !== child);
    }
    this.children = this.children.filter((node) => node !== child);
    this.children.push(child);
    if (child && typeof child === "object") {
      child.parentNode = this;
    }
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((node) => node !== child);
    if (child && typeof child === "object") {
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this._handlers[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this._handlers[type] === handler) {
      delete this._handlers[type];
    }
  }

  remove() {
    if (!this.parentNode) {return;}
    const next = this.parentNode.children.filter((child) => child !== this);
    this.parentNode.children = next;
    this.parentNode = null;
  }

  closest(selector) {
    return this.closestResult?.[selector] || null;
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
    if (selector?.startsWith("[data-timeline=")) {
      const value = selector.split('"')[1];
      return findFirst(this, (node) => node.dataset?.timeline === value);
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
const { domRefs, dayOptions } = await import("../src/ui/constants.js");
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
  initTimeMapFormInteractions,
  openTimeMapForm,
  closeTimeMapForm,
  resetTimeMapForm,
  getTimeMapUsageCounts
} = timeMaps;

describe("time maps", () => {
  const originalElement = global.Element;
  const originalWindow = global.window;

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

  afterEach(() => {
    global.Element = originalElement;
    global.window = originalWindow;
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

  it("collects rules from input values when minute metadata is missing", () => {
    const container = {
      querySelectorAll: () => [
        {
          dataset: { dayRow: "2" },
          querySelectorAll: () => [
            {
              dataset: {},
              querySelector: (selector) => {
                if (selector === "input[data-start-for]") {
                  return { value: "08:00" };
                }
                if (selector === "input[data-end-for]") {
                  return { value: "10:30" };
                }
                return null;
              }
            }
          ]
        }
      ]
    };
    const rules = collectTimeMapRules(container);
    assert.deepStrictEqual(rules, [{ day: 2, startTime: "08:00", endTime: "10:30" }]);
  });

  it("collects rules with fallback time strings", () => {
    const container = {
      querySelectorAll: () => [
        {
          dataset: { dayRow: "3" },
          querySelectorAll: () => [
            {
              dataset: {},
              querySelector: () => null
            }
          ]
        }
      ]
    };
    const rules = collectTimeMapRules(container);
    assert.strictEqual(rules.length, 1);
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

  it("handles missing form inputs and placeholder colors", () => {
    domRefs.timeMapColorInput = null;
    assert.strictEqual(getTimeMapFormData(), null);

    domRefs.timeMapColorInput = elements.get("timemap-color");
    domRefs.timeMapDayRows = elements.get("timemap-day-rows");
    elements.get("timemap-name").value = "Focus";
    elements.get("timemap-color").value = "#000000";
    elements.get("timemap-day-rows").querySelectorAll = () => [
      createRow({
        day: 1,
        blocks: [{ startMinute: 540, endMinute: 720 }]
      })
    ];
    domRefs.timeMapColorSwatch = null;
    const data = getTimeMapFormData();
    assert.strictEqual(data.name, "Focus");
    assert.notStrictEqual(data.color, "#000000");
    assert.notStrictEqual(elements.get("timemap-color").value, "#000000");
  });

  it("assigns a default color when input is empty", () => {
    elements.get("timemap-name").value = "Default Color";
    elements.get("timemap-color").value = "";
    elements.get("timemap-day-rows").querySelectorAll = () => [
      createRow({
        day: 1,
        blocks: [{ startMinute: 540, endMinute: 720 }]
      })
    ];
    const data = getTimeMapFormData();
    assert.ok(data.color);
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

  it("syncs day select options for full and partial day sets", () => {
    const daySelect = new FakeElement("select");
    daySelect.value = "2";
    domRefs.timeMapDaySelect = daySelect;
    domRefs.timeMapDayRows = elements.get("timemap-day-rows");

    renderDayRows(
      elements.get("timemap-day-rows"),
      dayOptions.map((day) => ({
        day: day.value,
        startTime: "09:00",
        endTime: "10:00"
      }))
    );
    assert.strictEqual(daySelect.options.length, 1);
    assert.strictEqual(daySelect.options[0].textContent, "All days added");
    assert.strictEqual(daySelect.value, "");

    elements.get("timemap-day-rows").children = [];
    daySelect.value = "2";
    renderDayRows(elements.get("timemap-day-rows"), [
      { day: 1, startTime: "09:00", endTime: "10:00" },
      { day: 3, startTime: "09:00", endTime: "10:00" }
    ]);
    assert.strictEqual(daySelect.value, "2");
  });

  it("renders day rows with a container that cannot remove children", () => {
    class BareContainer {
      constructor() {
        this.children = [];
        this._innerHTML = "";
      }

      set innerHTML(value) {
        this._innerHTML = value;
        this.children = [];
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }
    }

    const container = new BareContainer();
    domRefs.timeMapDayRows = container;
    domRefs.timeMapDaySelect = null;
    addTimeMapDay(1);
    addTimeMapDay(0);
    assert.strictEqual(container.children.length, 2);
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

  it("handles missing option containers and unnamed time maps", () => {
    const originalOptions = domRefs.taskTimeMapOptions;
    domRefs.taskTimeMapOptions = null;
    renderTaskTimeMapOptions([{ id: "tm-missing", name: "Missing" }], [], "");
    domRefs.taskTimeMapOptions = originalOptions;

    renderTimeMapOptions(null, ["tm-1"], [{ id: "tm-1", name: "Work" }]);

    const container = new FakeElement("div");
    renderTimeMapOptions(container, [], [{ id: "tm-2" }]);
    assert.strictEqual(container.children.length, 1);
  });

  it("handles non-array selections in time map options", () => {
    const container = new FakeElement("div");
    renderTimeMapOptions(container, "tm-1", [{ id: "tm-1", name: "Solo" }]);
    assert.strictEqual(container.children.length, 1);
  });

  it("supports explicit and implicit time map selections", () => {
    const container = elements.get("task-timemap-options");
    renderTaskTimeMapOptions([{ id: "tm-a", name: "Alpha", color: "#123456" }], "tm-a", "");
    assert.strictEqual(container.children.length, 1);

    container.children = [];
    renderTaskTimeMapOptions([{ id: "tm-b", name: "Bravo" }], ["tm-b"], "");
    const input = container.children[0].children[0];
    assert.strictEqual(input.checked, true);
  });

  it("renders fallback timemap content and handles missing lists", () => {
    domRefs.timeMapList = null;
    renderTimeMaps([{ id: "tm-2", name: "No List" }]);

    domRefs.timeMapList = elements.get("timemap-list");
    renderTimeMaps([{ id: "tm-3", name: "Empty", rules: [] }]);
    assert.strictEqual(elements.get("timemap-list").children.length, 1);
    assert.ok(elements.get("timemap-list").children[0].innerHTML.includes("No time ranges yet."));

    elements.get("timemap-list").children = [];
    renderTimeMaps([
      { id: "tm-4", name: "Fallback", rules: [{ day: 9, startTime: "09:00", endTime: "11:00" }] }
    ]);
    assert.strictEqual(elements.get("timemap-list").children.length, 1);
  });

  it("counts timemap usage excluding external ids", () => {
    const tasks = [
      { id: "t1", timeMapIds: ["tm-1", "external-calendar:cal-1"] },
      { id: "t2", timeMapIds: ["tm-1"], subtaskParentId: "t1" },
      { id: "t3", timeMapIds: ["tm-2"] }
    ];
    const counts = getTimeMapUsageCounts(tasks);
    assert.strictEqual(counts.get("tm-1"), 1);
    assert.strictEqual(counts.get("tm-2"), 1);
    assert.strictEqual(counts.has("external-calendar:cal-1"), false);
  });

  it("returns empty usage counts for missing tasks", () => {
    const counts = getTimeMapUsageCounts();
    assert.strictEqual(counts.size, 0);
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

  it("wires day list interactions and cleans up listeners", () => {
    global.Element = FakeElement;
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const dayAdd = new FakeElement("button");
    const dayRows = new FakeElement("div");
    domRefs.timeMapDayAdd = dayAdd;
    domRefs.timeMapDayRows = dayRows;
    domRefs.timeMapDaySelect = new FakeElement("select");
    domRefs.timeMapColorInput.value = "";

    const dayRow = new FakeElement("div");
    dayRow.dataset.dayRow = "1";
    const timeline = new FakeElement("div");
    timeline.dataset.timeline = "1";
    dayRow.appendChild(timeline);
    dayRows.appendChild(dayRow);

    const addBlockBtn = new FakeElement("button");
    addBlockBtn.dataset.day = "1";
    addBlockBtn.closestResult = { "[data-day-row]": dayRow, "[data-block-add]": addBlockBtn };
    const removeDayBtn = new FakeElement("button");
    removeDayBtn.closestResult = { "[data-day-remove]": removeDayBtn, "[data-day-row]": dayRow };
    const block = new FakeElement("div");
    block.dataset.block = "1";
    const removeBlockBtn = new FakeElement("button");
    removeBlockBtn.closestResult = { "[data-block]": block, "[data-block-remove]": removeBlockBtn };
    timeline.appendChild(block);

    const cleanup = initTimeMapFormInteractions();
    dayRows._handlers.click({ target: {} });
    dayRows._handlers.click({ target: addBlockBtn });
    dayRows._handlers.click({ target: removeBlockBtn });
    dayRows._handlers.click({ target: removeDayBtn });
    cleanup();
  });

  it("handles day row click edge cases and fallback labels", () => {
    global.Element = FakeElement;
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    const dayRows = new FakeElement("div");
    domRefs.timeMapDayRows = dayRows;
    domRefs.timeMapDaySelect = new FakeElement("select");
    const addBlockBtn = new FakeElement("button");
    addBlockBtn.closestResult = { "[data-block-add]": addBlockBtn };
    const addBlockNoTimeline = new FakeElement("button");
    addBlockNoTimeline.dataset.day = "1";
    addBlockNoTimeline.closestResult = {
      "[data-block-add]": addBlockNoTimeline,
      "[data-day-row]": { querySelector: () => null }
    };
    const removeDayBtn = new FakeElement("button");
    removeDayBtn.closestResult = { "[data-day-remove]": removeDayBtn };
    const removeBlockBtn = new FakeElement("button");
    removeBlockBtn.closestResult = { "[data-block-remove]": removeBlockBtn };

    const cleanup = initTimeMapFormInteractions();
    dayRows._handlers.click({ target: addBlockBtn });
    dayRows._handlers.click({ target: addBlockNoTimeline });
    dayRows._handlers.click({ target: removeDayBtn });
    dayRows._handlers.click({ target: removeBlockBtn });
    addTimeMapDay(99);
    cleanup();
  });

  it("adds day rows defensively", () => {
    const container = elements.get("timemap-day-rows");
    addTimeMapDay("bad");
    assert.strictEqual(container.children.length, 0);
    addTimeMapDay(1);
    assert.strictEqual(container.children.length, 1);
    addTimeMapDay(1);
    assert.strictEqual(container.children.length, 1);

    domRefs.timeMapDayRows = null;
    addTimeMapDay(2);
  });
});
