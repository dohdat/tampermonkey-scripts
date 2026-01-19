import assert from "assert";
import { describe, it } from "mocha";
import { TASK_STATUS_UNSCHEDULED } from "../src/constants.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(name) {
    this.values.add(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) {
        this.values.delete(name);
        return false;
      }
      this.values.add(name);
      return true;
    }
    if (force) {
      this.values.add(name);
      return true;
    }
    this.values.delete(name);
    return false;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.listeners = {};
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.closestResult = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }

  trigger(type, event = {}) {
    if (typeof this.listeners[type] === "function") {
      this.listeners[type](event);
    }
  }

  click() {
    if (typeof this.listeners.click === "function") {
      this.listeners.click();
    }
  }

  querySelectorAll() {
    return [];
  }

  closest(selector) {
    return this.closestResult?.[selector] || null;
  }
}

class FakeTaskList extends FakeElement {
  constructor() {
    super();
    this.selectedCards = [];
  }

  querySelectorAll() {
    return this.selectedCards;
  }
}

const elements = {
  "task-list": new FakeTaskList(),
  "task-bulk-edit-banner": new FakeElement(),
  "task-bulk-edit-count": new FakeElement(),
  "task-bulk-edit-apply": new FakeElement(),
  "task-bulk-edit-cancel": new FakeElement(),
  "task-bulk-edit-priority": new FakeElement(),
  "task-bulk-edit-deadline": new FakeElement(),
  "task-bulk-edit-start-from": new FakeElement(),
  "task-bulk-edit-duration": new FakeElement(),
  "task-bulk-edit-min-block": new FakeElement(),
  "task-bulk-edit-timemap-mode": new FakeElement(),
  "task-bulk-edit-timemap-options": new FakeElement()
};

global.document = {
  getElementById: (id) => elements[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => new FakeElement()
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

const { buildBulkEditUpdates, openBulkEditBanner } = await import(
  "../src/ui/tasks/task-bulk-edit.js"
);
const { domRefs } = await import("../src/ui/constants.js");
const { state } = await import("../src/ui/state/page-state.js");

domRefs.taskList = elements["task-list"];
domRefs.taskBulkEditBanner = elements["task-bulk-edit-banner"];
domRefs.taskBulkEditCount = elements["task-bulk-edit-count"];
domRefs.taskBulkEditApplyBtn = elements["task-bulk-edit-apply"];
domRefs.taskBulkEditCancelBtn = elements["task-bulk-edit-cancel"];
domRefs.taskBulkEditPriorityInput = elements["task-bulk-edit-priority"];
domRefs.taskBulkEditDeadlineInput = elements["task-bulk-edit-deadline"];
domRefs.taskBulkEditStartFromInput = elements["task-bulk-edit-start-from"];
domRefs.taskBulkEditDurationInput = elements["task-bulk-edit-duration"];
domRefs.taskBulkEditMinBlockInput = elements["task-bulk-edit-min-block"];
domRefs.taskBulkEditTimeMapMode = elements["task-bulk-edit-timemap-mode"];
domRefs.taskBulkEditTimeMapOptions = elements["task-bulk-edit-timemap-options"];

describe("task bulk edit", () => {
  it("updates fields and clears scheduling metadata", () => {
    const task = {
      id: "task-1",
      priority: 2,
      deadline: null,
      startFrom: null,
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      scheduleStatus: "scheduled",
      scheduledStart: "2026-01-02T10:00:00.000Z",
      scheduledEnd: "2026-01-02T10:30:00.000Z",
      scheduledTimeMapId: "tm-1",
      scheduledInstances: [{ start: "2026-01-02T10:00:00.000Z" }]
    };
    const values = {
      priority: 4,
      deadline: "2026-01-05T00:00:00.000Z",
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "keep",
      timeMapIds: []
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-1"], values);
    assert.strictEqual(changed, true);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].priority, 4);
    assert.strictEqual(updates[0].deadline, "2026-01-05T00:00:00.000Z");
    assert.strictEqual(updates[0].scheduleStatus, TASK_STATUS_UNSCHEDULED);
    assert.strictEqual(updates[0].scheduledStart, null);
    assert.strictEqual(updates[0].scheduledEnd, null);
    assert.strictEqual(updates[0].scheduledTimeMapId, null);
    assert.deepStrictEqual(updates[0].scheduledInstances, []);
  });

  it("replaces timemaps when requested", () => {
    const task = {
      id: "task-2",
      priority: 3,
      deadline: null,
      startFrom: null,
      durationMin: 45,
      minBlockMin: 30,
      timeMapIds: ["tm-1", "tm-2"],
      scheduleStatus: "scheduled",
      scheduledStart: "2026-01-02T10:00:00.000Z",
      scheduledEnd: "2026-01-02T10:45:00.000Z",
      scheduledTimeMapId: "tm-1",
      scheduledInstances: [{ start: "2026-01-02T10:00:00.000Z" }]
    };
    const values = {
      priority: undefined,
      deadline: undefined,
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "replace",
      timeMapIds: ["tm-3"]
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-2"], values);
    assert.strictEqual(changed, true);
    assert.strictEqual(updates.length, 1);
    assert.deepStrictEqual(updates[0].timeMapIds, ["tm-3"]);
  });

  it("updates timemaps when existing ids are missing", () => {
    const task = {
      id: "task-2b",
      timeMapIds: null
    };
    const values = {
      priority: undefined,
      deadline: undefined,
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "replace",
      timeMapIds: ["tm-9"]
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-2b"], values);
    assert.strictEqual(changed, true);
    assert.deepStrictEqual(updates[0].timeMapIds, ["tm-9"]);
  });

  it("returns no updates when nothing changes", () => {
    const task = {
      id: "task-3",
      priority: 3,
      deadline: null,
      startFrom: null,
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"],
      scheduleStatus: TASK_STATUS_UNSCHEDULED,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledTimeMapId: null,
      scheduledInstances: []
    };
    const values = {
      priority: undefined,
      deadline: undefined,
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "keep",
      timeMapIds: []
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-3"], values);
    assert.strictEqual(changed, false);
    assert.strictEqual(updates.length, 0);
  });

  it("returns empty updates for empty or unknown task ids", () => {
    const values = {
      priority: 1,
      deadline: undefined,
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "keep",
      timeMapIds: []
    };
    const empty = buildBulkEditUpdates([{ id: "t1" }], [], values);
    assert.deepStrictEqual(empty, { updates: [], changed: false });

    const unknown = buildBulkEditUpdates(null, ["missing"], values);
    assert.deepStrictEqual(unknown, { updates: [], changed: false });
  });

  it("skips updates when values match existing task fields", () => {
    const task = {
      id: "task-same",
      priority: 2,
      deadline: null,
      startFrom: null,
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: []
    };
    const values = {
      priority: 2,
      deadline: null,
      startFrom: null,
      durationMin: 30,
      minBlockMin: 30,
      timeMapMode: "keep",
      timeMapIds: []
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-same"], values);
    assert.strictEqual(changed, false);
    assert.strictEqual(updates.length, 0);
  });

  it("opens the bulk edit banner and disables drag", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-4";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    const sortableState = { disabled: null };
    state.sortableInstances = [
      {
        option: (key, value) => {
          if (key === "disabled") {
            sortableState.disabled = value;
          }
        }
      }
    ];
    state.tasksTimeMapsCache = [];
    openBulkEditBanner("task-4");
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    assert.strictEqual(elements["task-bulk-edit-count"].textContent, "1 selected");
    assert.strictEqual(sortableState.disabled, true);
    elements["task-bulk-edit-cancel"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), true);
    assert.strictEqual(sortableState.disabled, false);
  });

  it("falls back to the clicked task when nothing is selected", () => {
    elements["task-list"].selectedCards = [];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.sortableInstances = [];
    openBulkEditBanner("task-fallback");
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    assert.strictEqual(elements["task-bulk-edit-count"].textContent, "1 selected");
    elements["task-bulk-edit-cancel"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), true);
  });

  it("validates bulk edit inputs before applying", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-5";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("task-5");

    elements["task-bulk-edit-priority"].value = "6";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-priority"].value = "abc";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-priority"].value = "0";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-priority"].value = "";
    elements["task-bulk-edit-duration"].value = "20";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-duration"].value = "";
    elements["task-bulk-edit-deadline"].value = "2026-13-40";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-deadline"].value = "";
    elements["task-bulk-edit-duration"].value = "abc";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-duration"].value = "";
    elements["task-bulk-edit-min-block"].value = "abc";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);

    elements["task-bulk-edit-cancel"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), true);
  });

  it("blocks invalid date ranges", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-11";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("task-11");

    elements["task-bulk-edit-start-from"].value = "2026-01-10";
    elements["task-bulk-edit-deadline"].value = "2026-01-01";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });

  it("closes when no target ids are available", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-13";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("");
    elements["task-list"].selectedCards = [];
    domRefs.taskList.querySelectorAll = () => [];
    state.bulkEditSelectionIds = null;
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), true);
  });

  it("keeps selected ids when both selection and fallback exist", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-17";
    elements["task-list"].selectedCards = [selectedCard];
    domRefs.taskList.querySelectorAll = () => [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("fallback-17");
    assert.deepStrictEqual(state.bulkEditSelectionIds, ["task-17"]);
    elements["task-bulk-edit-cancel"].click();
  });

  it("uses explicit selection ids and handles no-change apply", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-12";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.tasksCache = [
      { id: "task-12", priority: 2, durationMin: 30, minBlockMin: 30, timeMapIds: [] }
    ];
    openBulkEditBanner("task-12");

    state.bulkEditSelectionIds = ["task-12"];
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });

  it("reuses existing cleanup before reopening", () => {
    let cleaned = false;
    state.bulkEditCleanup = () => {
      cleaned = true;
    };
    elements["task-list"].selectedCards = [];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("task-cleanup");
    assert.strictEqual(cleaned, true);
    elements["task-bulk-edit-cancel"].click();
  });

  it("validates and skips unchanged values with valid inputs", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-18";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.tasksCache = [
      { id: "task-18", priority: 3, durationMin: 30, minBlockMin: 30, timeMapIds: [] }
    ];
    openBulkEditBanner("task-18");

    elements["task-bulk-edit-priority"].value = "3";
    elements["task-bulk-edit-duration"].value = "30";
    elements["task-bulk-edit-min-block"].value = "30";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });

  it("returns early when banner nodes are missing", () => {
    const originalBanner = domRefs.taskBulkEditBanner;
    domRefs.taskBulkEditBanner = null;
    openBulkEditBanner("task-missing");
    domRefs.taskBulkEditBanner = originalBanner;
  });

  it("skips timemap updates when unchanged", () => {
    const task = {
      id: "task-6",
      priority: 3,
      deadline: null,
      startFrom: null,
      durationMin: 30,
      minBlockMin: 30,
      timeMapIds: ["tm-1"]
    };
    const values = {
      priority: undefined,
      deadline: undefined,
      startFrom: undefined,
      durationMin: undefined,
      minBlockMin: undefined,
      timeMapMode: "replace",
      timeMapIds: ["tm-1"]
    };
    const { updates, changed } = buildBulkEditUpdates([task], ["task-6"], values);
    assert.strictEqual(changed, false);
    assert.strictEqual(updates.length, 0);
  });

  it("disables sortable instances without option()", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-7";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.sortableInstances = [{ disabled: false }];
    openBulkEditBanner("task-7");
    assert.strictEqual(state.sortableInstances[0].disabled, true);
    elements["task-bulk-edit-cancel"].click();
    assert.strictEqual(state.sortableInstances[0].disabled, false);
  });

  it("skips null sortable instances", () => {
    elements["task-list"].selectedCards = [];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.sortableInstances = [null];
    openBulkEditBanner("task-null");
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });

  it("handles timemap replace with existing selection", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-8";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.tasksCache = [
      { id: "task-8", timeMapIds: ["tm-1"], priority: 3, durationMin: 30, minBlockMin: 30 }
    ];
    const checkedInput = { checked: true, value: "tm-1" };
    elements["task-bulk-edit-timemap-options"].querySelectorAll = () => [checkedInput];
    openBulkEditBanner("task-8");
    elements["task-bulk-edit-timemap-mode"].value = "replace";
    elements["task-bulk-edit-timemap-mode"].trigger("change");
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), true);
  });

  it("defaults to keep when timemap mode is empty", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-15";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    openBulkEditBanner("task-15");
    elements["task-bulk-edit-timemap-mode"].value = "";
    elements["task-bulk-edit-timemap-mode"].trigger("change");
    elements["task-bulk-edit-cancel"].click();
  });

  it("handles missing count nodes", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-16";
    elements["task-list"].selectedCards = [selectedCard];
    const originalCount = domRefs.taskBulkEditCount;
    domRefs.taskBulkEditCount = null;
    openBulkEditBanner("task-16");
    domRefs.taskBulkEditCount = originalCount;
  });

  it("handles missing timemap mode controls", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-14";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    const originalMode = domRefs.taskBulkEditTimeMapMode;
    domRefs.taskBulkEditTimeMapMode = null;
    openBulkEditBanner("task-14");
    domRefs.taskBulkEditTimeMapMode = originalMode;
    elements["task-bulk-edit-cancel"].click();
  });

  it("handles missing timemap options", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-19";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    const originalOptions = domRefs.taskBulkEditTimeMapOptions;
    domRefs.taskBulkEditTimeMapOptions = null;
    openBulkEditBanner("task-19");
    domRefs.taskBulkEditTimeMapOptions = originalOptions;
    elements["task-bulk-edit-cancel"].click();
  });

  it("applies with an empty timemap mode value", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-20";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-banner"].classList.add("hidden");
    state.tasksCache = [
      { id: "task-20", priority: 3, durationMin: 30, minBlockMin: 30, timeMapIds: [] }
    ];
    openBulkEditBanner("task-20");
    elements["task-bulk-edit-timemap-mode"].value = "";
    elements["task-bulk-edit-apply"].click();
    assert.strictEqual(elements["task-bulk-edit-banner"].classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });
  it("toggles timemap wrap visibility based on mode", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-9";
    elements["task-list"].selectedCards = [selectedCard];
    const wrap = new FakeElement();
    elements["task-bulk-edit-timemap-options"].closestResult = {
      '[data-test-skedpal="task-bulk-edit-timemap-wrap"]': wrap
    };
    wrap.classList.remove("hidden");
    elements["task-bulk-edit-timemap-mode"].value = "keep";
    openBulkEditBanner("task-9");
    assert.strictEqual(wrap.classList.contains("hidden"), true);
    elements["task-bulk-edit-timemap-mode"].value = "replace";
    elements["task-bulk-edit-timemap-mode"].trigger("change");
    assert.strictEqual(wrap.classList.contains("hidden"), false);
    elements["task-bulk-edit-cancel"].click();
  });

  it("handles timemap mode change without a wrap element", () => {
    const selectedCard = new FakeElement();
    selectedCard.dataset.taskId = "task-10";
    elements["task-list"].selectedCards = [selectedCard];
    elements["task-bulk-edit-timemap-options"].closestResult = {};
    elements["task-bulk-edit-timemap-mode"].value = "replace";
    openBulkEditBanner("task-10");
    elements["task-bulk-edit-timemap-mode"].trigger("change");
    elements["task-bulk-edit-cancel"].click();
  });
});
