import assert from "assert";
import { afterEach, describe, it } from "mocha";
import {
  createTimeBlock,
  createTimeline,
  minutesToTimeString,
  normalizeTimeRange,
  timeStringToMinutes
} from "../src/ui/time-map-timeline.js";
import { TIME_MAP_MINUTES_IN_DAY, TIME_MAP_MINUTE_STEP } from "../src/ui/constants.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.style = {};
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
        .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  querySelector(selector) {
    if (selector === "[data-block-label]") {
      return this.children.find((child) => child?.dataset?.blockLabel) || null;
    }
    return null;
  }
}

const previousDocument = global.document;

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null
  };
}

describe("time map timeline helpers", () => {
  afterEach(() => {
    global.document = previousDocument;
  });

  it("converts between time strings and minutes", () => {
    assert.strictEqual(timeStringToMinutes("09:30", 0), 570);
    assert.strictEqual(timeStringToMinutes("bad", 15), 15);
    assert.strictEqual(minutesToTimeString(TIME_MAP_MINUTES_IN_DAY), "24:00");
  });

  it("normalizes time ranges to step boundaries", () => {
    const normalized = normalizeTimeRange(540, 720);
    assert.deepStrictEqual(normalized, { start: 540, end: 720 });
    const padded = normalizeTimeRange(540, 540 + TIME_MAP_MINUTE_STEP - 1);
    assert.strictEqual(padded.end - padded.start, TIME_MAP_MINUTE_STEP);
  });

  it("creates timeline blocks with minutes metadata", () => {
    installDomStubs();
    const block = createTimeBlock(1, { startTime: "09:00", endTime: "12:00" });
    assert.strictEqual(block.dataset.block, 1);
    assert.strictEqual(block.dataset.startMinute, "540");
    assert.strictEqual(block.dataset.endMinute, "720");
    const label = block.querySelector("[data-block-label]");
    assert.ok(label.textContent.includes("09:00"));
  });

  it("builds timelines with default blocks", () => {
    installDomStubs();
    const timelineRow = createTimeline(1, []);
    assert.strictEqual(timelineRow.children.length, 1);
    const timeline = timelineRow.children[0];
    assert.strictEqual(timeline.dataset.timeline, 1);
    assert.strictEqual(timeline.children.length, 1);
  });
});
