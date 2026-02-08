import assert from "assert";
import { afterEach, describe, it } from "mocha";
import {
  createTimeBlock,
  createTimeline,
  minutesToTimeString,
  normalizeTimeRange,
  setupTimeMapTimelineInteractions,
  syncTimeMapTimelineHeader,
  timeStringToMinutes
} from "../src/ui/time-map-timeline.js";
import {
  TIME_MAP_LABEL_HOURS,
  TIME_MAP_MINUTES_IN_DAY,
  TIME_MAP_MINUTE_STEP
} from "../src/ui/constants.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.parentElement = null;
    this._handlers = new Map();
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  appendChild(child) {
    child.parentElement = this;
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

  addEventListener(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    const handlers = this._handlers.get(event.type);
    if (!handlers) {return;}
    handlers.forEach((handler) => handler(event));
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (selector === "[data-timeline-handle]" && current.dataset?.timelineHandle) {
        return current;
      }
      if (selector === "[data-block-remove]" && current.dataset?.blockRemove) {
        return current;
      }
      if (selector === "[data-block]" && current.dataset?.block) {
        return current;
      }
      if (selector === "[data-timeline]" && current.dataset?.timeline) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    return this._rect || { width: 200, left: 0 };
  }

  setPointerCapture() {}
}

const previousDocument = global.document;
const previousWindow = global.window;

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null
  };
}

describe("time map timeline helpers", () => {
  afterEach(() => {
    global.document = previousDocument;
    global.window = previousWindow;
  });

  it("converts between time strings and minutes", () => {
    assert.strictEqual(timeStringToMinutes("09:30", 0), 570);
    assert.strictEqual(timeStringToMinutes("bad", 15), 15);
    assert.strictEqual(timeStringToMinutes("", 20), 20);
    assert.strictEqual(timeStringToMinutes("1e308:1e308", 30), 30);
    assert.strictEqual(minutesToTimeString(TIME_MAP_MINUTES_IN_DAY), "24:00");
  });

  it("normalizes time ranges to step boundaries", () => {
    const normalized = normalizeTimeRange(540, 720);
    assert.deepStrictEqual(normalized, { start: 540, end: 720 });
    const padded = normalizeTimeRange(540, 540 + TIME_MAP_MINUTE_STEP - 1);
    assert.strictEqual(padded.end - padded.start, TIME_MAP_MINUTE_STEP);
    const reversed = normalizeTimeRange(720, 540);
    assert.ok(reversed.end > reversed.start);
    const shortRange = normalizeTimeRange(7, 8);
    assert.strictEqual(shortRange.end - shortRange.start, TIME_MAP_MINUTE_STEP);
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

  it("syncs timeline headers when present or missing", () => {
    const header = new FakeElement("div");
    global.document = {
      createElement: (tag) => new FakeElement(tag),
      getElementById: (id) => (id === "timemap-timeline-header" ? header : null)
    };
    syncTimeMapTimelineHeader();
    assert.strictEqual(header.children.length, TIME_MAP_LABEL_HOURS.length);

    global.document = {
      createElement: (tag) => new FakeElement(tag),
      getElementById: () => null
    };
    assert.doesNotThrow(() => syncTimeMapTimelineHeader());
  });

  it("handles drag interactions on time blocks", () => {
    const originalElement = global.Element;
    const container = new FakeElement("div");
    const timeline = new FakeElement("div");
    timeline.dataset.timeline = "mon";
    const block = new FakeElement("div");
    block.dataset.block = "mon";
    block.dataset.startMinute = "60";
    block.dataset.endMinute = "120";
    timeline.appendChild(block);
    container.appendChild(timeline);

    global.Element = FakeElement;
    global.document = {
      createElement: (tag) => new FakeElement(tag),
      getElementById: () => null
    };
    global.window = {
      _handlers: new Map(),
      addEventListener(type, handler) {
        if (!this._handlers.has(type)) {
          this._handlers.set(type, new Set());
        }
        this._handlers.get(type).add(handler);
      },
      removeEventListener(type, handler) {
        this._handlers.get(type)?.delete(handler);
      }
    };

    const cleanup = setupTimeMapTimelineInteractions(container);
    const pointerDownHandlers = [...(container._handlers.get("pointerdown") || [])];
    pointerDownHandlers[0]({
      target: block,
      pointerType: "mouse",
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1
    });

    const pointerMoveHandlers = [...(global.window._handlers.get("pointermove") || [])];
    if (pointerMoveHandlers.length) {
      pointerMoveHandlers[0]({ pointerId: 1, clientX: 20 });
    }

    const pointerUpHandlers = [...(global.window._handlers.get("pointerup") || [])];
    if (pointerUpHandlers.length) {
      pointerUpHandlers[0]({ pointerId: 1 });
    }
    cleanup();
    global.Element = originalElement;
  });

  it("updates start and end handles during drags", () => {
    const originalElement = global.Element;
    const container = new FakeElement("div");
    const timeline = new FakeElement("div");
    timeline.dataset.timeline = "mon";
    timeline._rect = { width: 200, left: 0 };
    const block = new FakeElement("div");
    block.dataset.block = "mon";
    block.dataset.startMinute = "60";
    block.dataset.endMinute = "120";

    const startHandle = new FakeElement("span");
    startHandle.setAttribute("data-timeline-handle", "start");
    block.appendChild(startHandle);
    const endHandle = new FakeElement("span");
    endHandle.setAttribute("data-timeline-handle", "end");
    block.appendChild(endHandle);

    timeline.appendChild(block);
    container.appendChild(timeline);

    global.Element = FakeElement;
    global.window = {
      _handlers: new Map(),
      addEventListener(type, handler) {
        if (!this._handlers.has(type)) {
          this._handlers.set(type, new Set());
        }
        this._handlers.get(type).add(handler);
      },
      removeEventListener(type, handler) {
        this._handlers.get(type)?.delete(handler);
      }
    };

    const cleanup = setupTimeMapTimelineInteractions(container);
    const pointerDown = [...(container._handlers.get("pointerdown") || [])][0];

    pointerDown({
      target: startHandle,
      pointerType: "mouse",
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 3
    });
    const pointerMove = [...(global.window._handlers.get("pointermove") || [])][0];
    pointerMove?.({ pointerId: 3, clientX: 20 });
    assert.ok(Number(block.dataset.startMinute) >= 0);

    pointerDown({
      target: endHandle,
      pointerType: "mouse",
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 4
    });
    pointerMove?.({ pointerId: 4, clientX: 20 });
    assert.ok(Number(block.dataset.endMinute) >= 0);

    cleanup();
    global.Element = originalElement;
  });

  it("ignores invalid drag targets and pointer moves", () => {
    const originalElement = global.Element;
    const container = new FakeElement("div");
    const timeline = new FakeElement("div");
    timeline.dataset.timeline = "mon";
    const block = new FakeElement("div");
    block.dataset.block = "mon";
    block.dataset.startMinute = "bad";
    block.dataset.endMinute = "120";
    timeline.appendChild(block);
    container.appendChild(timeline);

    global.Element = FakeElement;
    global.window = {
      _handlers: new Map(),
      addEventListener(type, handler) {
        if (!this._handlers.has(type)) {
          this._handlers.set(type, new Set());
        }
        this._handlers.get(type).add(handler);
      },
      removeEventListener(type, handler) {
        this._handlers.get(type)?.delete(handler);
      }
    };

    const cleanup = setupTimeMapTimelineInteractions(container);
    const pointerDown = [...(container._handlers.get("pointerdown") || [])][0];

    pointerDown({ pointerType: "mouse", button: 0 });

    global.Element = undefined;
    pointerDown({ target: block, pointerType: "mouse", button: 0 });

    global.Element = FakeElement;
    pointerDown({ target: {}, pointerType: "mouse", button: 0 });
    pointerDown({ target: block, pointerType: "mouse", button: 1 });

    block.dataset.blockRemove = "true";
    pointerDown({ target: block, pointerType: "mouse", button: 0 });
    delete block.dataset.blockRemove;

    const orphan = new FakeElement("div");
    pointerDown({ target: orphan, pointerType: "mouse", button: 0 });

    pointerDown({ target: block, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, pointerId: 2 });

    block.dataset.startMinute = "60";
    block.dataset.endMinute = "120";
    pointerDown({ target: block, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    const pointerMove = [...(global.window._handlers.get("pointermove") || [])][0];
    pointerMove?.({ pointerId: 2, clientX: 0 });

    cleanup();
    global.Element = originalElement;
  });
});
