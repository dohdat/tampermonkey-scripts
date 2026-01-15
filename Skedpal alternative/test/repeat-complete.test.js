import assert from "assert";
import { describe, it, before, beforeEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import { domRefs, REPEAT_COMPLETE_COMPLETED_LIMIT } from "../src/ui/constants.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.id = "";
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        names.forEach((name) => current.add(name));
        this.className = Array.from(current).join(" ");
      },
      remove: (...names) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        names.forEach((name) => current.delete(name));
        this.className = Array.from(current).join(" ");
      },
      toggle: (name, force) => {
        const current = new Set(this.className.split(" ").filter(Boolean));
        const shouldAdd = typeof force === "boolean" ? force : !current.has(name);
        if (shouldAdd) {
          current.add(name);
        } else {
          current.delete(name);
        }
        this.className = Array.from(current).join(" ");
      },
      contains: (name) => this.className.split(" ").includes(name)
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelectorAll() {
    return [];
  }
}

function findByTestId(root, testId) {
  const matches = [];
  const visit = (node) => {
    if (node?.attributes?.["data-test-skedpal"] === testId) {
      matches.push(node);
    }
    (node?.children || []).forEach(visit);
  };
  visit(root);
  return matches;
}

function buildCompletedIsoList(baseDate, count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    date.setHours(23, 59, 59, 999);
    list.push(date.toISOString());
  }
  return list;
}

describe("repeat complete modal", () => {
  let openRepeatCompleteModal = null;
  let closeRepeatCompleteModal = null;

  before(async () => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      body: new FakeElement("body")
    };
    domRefs.repeatCompleteModal = new FakeElement("div");
    domRefs.repeatCompleteList = new FakeElement("div");
    domRefs.repeatCompleteEmpty = new FakeElement("div");
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 14 };
    const module = await import("../src/ui/tasks/repeat-complete.js");
    openRepeatCompleteModal = module.openRepeatCompleteModal;
    closeRepeatCompleteModal = module.closeRepeatCompleteModal;
  });

  beforeEach(() => {
    domRefs.repeatCompleteList.children = [];
    domRefs.repeatCompleteList.className = "";
    domRefs.repeatCompleteEmpty.children = [];
    domRefs.repeatCompleteEmpty.className = "";
    domRefs.repeatCompleteModal.className = "";
    document.body.className = "";
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 14 };
  });

  it("renders a collapsed completed section with recent entries", () => {
    const task = {
      id: "task-1",
      title: "Repeat task",
      startFrom: new Date(2026, 0, 5, 8, 0, 0, 0),
      repeat: { type: "custom", unit: "day", interval: 1 },
      completedOccurrences: buildCompletedIsoList(new Date(2026, 0, 10), 8)
    };

    openRepeatCompleteModal(task);

    const separators = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-completed-separator"
    );
    assert.strictEqual(separators.length, 1);
    const wraps = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-completed-wrap"
    );
    assert.strictEqual(wraps.length, 1);
    assert.ok(wraps[0].className.includes("hidden"));
    const rows = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-completed-option"
    );
    assert.strictEqual(rows.length, REPEAT_COMPLETE_COMPLETED_LIMIT);
  });

  it("shows the empty state when no occurrences are available", () => {
    domRefs.repeatCompleteEmpty.className = "hidden";
    const task = {
      id: "task-empty",
      title: "Past task",
      deadline: new Date(2020, 0, 1, 12, 0, 0, 0),
      repeat: { type: "none" },
      completedOccurrences: []
    };

    openRepeatCompleteModal(task);

    assert.strictEqual(domRefs.repeatCompleteEmpty.className.includes("hidden"), false);
  });

  it("renders an out-of-range section when upcoming items exceed the horizon", () => {
    state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
    const task = {
      id: "task-range",
      title: "Weekly task",
      startFrom: new Date(),
      repeat: { type: "custom", unit: "day", interval: 1 },
      completedOccurrences: []
    };

    openRepeatCompleteModal(task);

    const outOfRange = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-out-of-range"
    );
    assert.strictEqual(outOfRange.length, 1);
  });

  it("parses completed occurrences stored as local date keys", () => {
    const task = {
      id: "task-local",
      title: "Local completed",
      startFrom: new Date(2026, 0, 5, 8, 0, 0, 0),
      repeat: { type: "custom", unit: "day", interval: 1 },
      completedOccurrences: ["2026-01-05", "bad-value"]
    };

    openRepeatCompleteModal(task);

    const rows = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-completed-option"
    );
    assert.ok(rows.length >= 1);
  });

  it("closes the modal and clears the modal-open body class", () => {
    const task = {
      id: "task-close",
      title: "Close modal",
      startFrom: new Date(2026, 0, 5, 8, 0, 0, 0),
      repeat: { type: "custom", unit: "day", interval: 1 },
      completedOccurrences: []
    };

    openRepeatCompleteModal(task);
    assert.strictEqual(domRefs.repeatCompleteModal.className.includes("hidden"), false);
    document.body.classList.add("modal-open");
    closeRepeatCompleteModal();
    assert.ok(domRefs.repeatCompleteModal.className.includes("hidden"));
    assert.strictEqual(document.body.className.includes("modal-open"), false);
  });

  it("uses scheduled instance times when available", () => {
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);
    const task = {
      id: "task-time",
      title: "Timed task",
      startFrom: start,
      repeat: { type: "custom", unit: "day", interval: 1 },
      scheduledInstances: [
        {
          occurrenceId: "task-time-occ-0",
          start: start.toISOString(),
          end: end.toISOString()
        }
      ],
      completedOccurrences: []
    };

    openRepeatCompleteModal(task);

    const times = findByTestId(domRefs.repeatCompleteList, "repeat-complete-time");
    assert.ok(times.length >= 1);
    assert.notStrictEqual(times[0].textContent, "Unscheduled");
  });

  it("renders yearly range labels for yearly range repeats", () => {
    const startFrom = new Date(2026, 0, 5, 8, 0, 0, 0);
    const task = {
      id: "task-year",
      title: "Yearly range",
      startFrom,
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2026-01-01",
        yearlyRangeEndDate: "2026-01-15"
      },
      completedOccurrences: []
    };

    openRepeatCompleteModal(task);

    const labels = findByTestId(domRefs.repeatCompleteList, "repeat-complete-label");
    assert.ok(labels.length >= 1);
    assert.ok(labels[0].textContent.includes(" - "));
  });
});
