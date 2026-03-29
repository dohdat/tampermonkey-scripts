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

  it("formats completed section ranges across different years", () => {
    const task = {
      id: "task-cross-year",
      title: "Cross year completed",
      startFrom: new Date(2026, 0, 5, 8, 0, 0, 0),
      repeat: { type: "custom", unit: "day", interval: 1 },
      completedOccurrences: [
        new Date(2026, 0, 2, 23, 59, 59, 999).toISOString(),
        new Date(2025, 11, 31, 23, 59, 59, 999).toISOString()
      ]
    };

    openRepeatCompleteModal(task);

    const separators = findByTestId(
      domRefs.repeatCompleteList,
      "repeat-complete-completed-separator"
    );
    assert.strictEqual(separators.length, 1);
    assert.ok(separators[0].textContent.includes("2025-Jan 2026"));
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

  it("keeps overlapping yearly ranges in the available section", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 2, 9, 12, 0, 0, 0);
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
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 14 };
      const task = {
        id: "task-year-overlap",
        title: "Yearly overlap",
        startFrom: new Date(2026, 2, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "year",
          interval: 1,
          yearlyRangeStartDate: "2026-03-01",
          yearlyRangeEndDate: "2026-04-15"
        },
        completedOccurrences: []
      };

      openRepeatCompleteModal(task);

      const options = findByTestId(domRefs.repeatCompleteList, "repeat-complete-option");
      assert.ok(options.length >= 1);
      const timeLabels = findByTestId(domRefs.repeatCompleteList, "repeat-complete-time");
      assert.ok(timeLabels.some((node) => node.textContent === "Unscheduled"));
    } finally {
      global.Date = OriginalDate;
    }
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

  it("uses range-window time matching when occurrence ids are missing", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 2, 9, 12, 0, 0, 0);
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
      const start = new Date(2026, 2, 12, 9, 0, 0, 0);
      const end = new Date(2026, 2, 12, 10, 0, 0, 0);
      const task = {
        id: "task-time-fallback",
        title: "Timed yearly range",
        startFrom: new Date(2026, 2, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "year",
          interval: 1,
          yearlyRangeStartDate: "2026-03-01",
          yearlyRangeEndDate: "2026-04-15"
        },
        scheduledInstances: [
          {
            start: start.toISOString(),
            end: end.toISOString(),
            occurrenceId: null
          }
        ],
        completedOccurrences: []
      };

      openRepeatCompleteModal(task);

      const times = findByTestId(domRefs.repeatCompleteList, "repeat-complete-time");
      assert.ok(times.length >= 1);
      assert.notStrictEqual(times[0].textContent, "Unscheduled");
    } finally {
      global.Date = OriginalDate;
    }
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

  it("renders yearly range labels for completed yearly range repeats", () => {
    const task = {
      id: "task-year-completed",
      title: "Yearly range completed",
      startFrom: new Date(2026, 0, 5, 8, 0, 0, 0),
      repeat: {
        type: "custom",
        unit: "year",
        interval: 1,
        yearlyRangeStartDate: "2026-01-01",
        yearlyRangeEndDate: "2026-01-15"
      },
      completedOccurrences: [new Date(2026, 0, 15, 23, 59, 59, 999).toISOString()]
    };

    openRepeatCompleteModal(task);

    const labels = findByTestId(domRefs.repeatCompleteList, "repeat-complete-label");
    assert.ok(labels.some((node) => node.textContent.includes(" - ")));
  });

  it("falls back to the default scheduling horizon when the saved value is invalid", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 10, 12, 0, 0, 0);
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
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 0 };
      const task = {
        id: "task-default-horizon",
        title: "Default horizon",
        startFrom: new Date(2026, 0, 10, 8, 0, 0, 0),
        repeat: { type: "custom", unit: "day", interval: 1 },
        completedOccurrences: []
      };

      openRepeatCompleteModal(task);

      const outOfRange = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-out-of-range"
      );
      assert.strictEqual(outOfRange.length, 0);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("projects available, out-of-range, and completed entries for completion-based daily repeats", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 10, 12, 0, 0, 0);
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
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
      const task = {
        id: "task-completion-daily",
        title: "Completion daily",
        repeatAnchor: new Date(2026, 0, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "day",
          interval: 1,
          dayMode: "completion"
        },
        completedOccurrences: ["2026-01-09", "2026-01-08"]
      };

      openRepeatCompleteModal(task);

      const available = findByTestId(domRefs.repeatCompleteList, "repeat-complete-option");
      const outOfRange = findByTestId(domRefs.repeatCompleteList, "repeat-complete-out-of-range");
      const completedSeparator = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-completed-separator"
      );

      assert.ok(available.length >= 1);
      assert.strictEqual(outOfRange.length, 1);
      assert.strictEqual(completedSeparator.length, 1);
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("uses singular separator labels and stops completion-based repeats at the max count", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 10, 12, 0, 0, 0);
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
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: 1 };
      const task = {
        id: "task-completion-count",
        title: "Completion count",
        repeatAnchor: new Date(2026, 0, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "day",
          interval: 1,
          dayMode: "completion",
          end: { type: "after", count: 4 }
        },
        completedOccurrences: ["2026-01-09"]
      };

      openRepeatCompleteModal(task);

      const outOfRangeSeparator = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-separator"
      );
      const completedSeparator = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-completed-separator"
      );
      const outOfRangeWrap = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-out-of-range"
      );

      assert.strictEqual(outOfRangeWrap.length, 1);
      assert.ok(outOfRangeSeparator[0].textContent.includes("(1 occurrence)"));
      assert.ok(completedSeparator[0].textContent.includes("(1 occurrence)"));
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("uses scheduled blocks for the first completion-based daily occurrence even when ids do not match", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 10, 12, 0, 0, 0);
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
      const fallbackStart = new Date(2026, 0, 9, 9, 0, 0, 0);
      const fallbackEnd = new Date(2026, 0, 9, 10, 0, 0, 0);
      const task = {
        id: "task-completion-scheduled",
        title: "Completion scheduled",
        repeatAnchor: new Date(2026, 0, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "day",
          interval: 1,
          dayMode: "completion"
        },
        scheduledInstances: [
          {
            start: fallbackStart.toISOString(),
            end: fallbackEnd.toISOString(),
            occurrenceId: "mismatch-occurrence"
          }
        ],
        completedOccurrences: ["2026-01-09"]
      };

      openRepeatCompleteModal(task);

      const times = findByTestId(domRefs.repeatCompleteList, "repeat-complete-time");
      assert.ok(times.length >= 1);
      assert.notStrictEqual(times[0].textContent, "Unscheduled");
    } finally {
      global.Date = OriginalDate;
    }
  });

  it("stops projecting completion-based daily repeats after the end date", () => {
    const OriginalDate = Date;
    const fixedNow = new OriginalDate(2026, 0, 10, 12, 0, 0, 0);
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
        id: "task-completion-ended",
        title: "Completion ended",
        repeatAnchor: new Date(2026, 0, 1, 8, 0, 0, 0),
        repeat: {
          type: "custom",
          unit: "day",
          interval: 1,
          dayMode: "completion",
          end: { type: "on", date: "2026-01-09" }
        },
        completedOccurrences: ["2026-01-09", "2026-01-08"]
      };

      openRepeatCompleteModal(task);

      const available = findByTestId(domRefs.repeatCompleteList, "repeat-complete-option");
      const completedSeparator = findByTestId(
        domRefs.repeatCompleteList,
        "repeat-complete-completed-separator"
      );

      assert.strictEqual(available.length, 0);
      assert.strictEqual(completedSeparator.length, 1);
      assert.strictEqual(domRefs.repeatCompleteEmpty.className.includes("hidden"), false);
    } finally {
      global.Date = OriginalDate;
    }
  });
});
