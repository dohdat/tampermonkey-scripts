import assert from "assert";
import { describe, it, beforeEach } from "mocha";
import { appendExternalCalendarOptions } from "../src/ui/time-map-external-options.js";
import { state } from "../src/ui/state/page-state.js";
import { EXTERNAL_CALENDAR_TIMEMAP_PREFIX } from "../src/constants.js";
import { themeColors } from "../src/ui/theme.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.checked = false;
    this.value = "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

function findFirstByTag(root, tagName) {
  if (root.tagName === tagName) {return root;}
  for (const child of root.children || []) {
    const found = findFirstByTag(child, tagName);
    if (found) {return found;}
  }
  return null;
}

function findFirstByText(root, text) {
  if (root.textContent === text) {return root;}
  for (const child of root.children || []) {
    const found = findFirstByText(child, text);
    if (found) {return found;}
  }
  return null;
}

function findFirstByAttribute(root, name, value) {
  if (root.attributes?.[name] === value) {return root;}
  for (const child of root.children || []) {
    const found = findFirstByAttribute(child, name, value);
    if (found) {return found;}
  }
  return null;
}

describe("time map external options", () => {
  beforeEach(() => {
    global.document = {
      createElement: (tag) => new FakeElement(tag)
    };
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: [] };
    state.googleCalendarListCache = [];
  });

  it("renders nothing when no calendars are selected", () => {
    const container = new FakeElement("div");
    appendExternalCalendarOptions(container, []);
    assert.strictEqual(container.children.length, 0);
  });

  it("renders selected external calendar options", () => {
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: ["cal-1"] };
    state.googleCalendarListCache = [
      { id: "cal-1", summary: "Primary", backgroundColor: "#112233" }
    ];
    const container = new FakeElement("div");
    appendExternalCalendarOptions(container, [`${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`]);
    assert.strictEqual(container.children.length, 2);
    const input = findFirstByTag(container, "INPUT");
    assert.ok(input);
    assert.strictEqual(input.checked, true);
  });

  it("falls back to the calendar id when metadata is missing", () => {
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: ["cal-2"] };
    state.googleCalendarListCache = [{ id: "cal-2", summary: "", backgroundColor: "" }];
    const container = new FakeElement("div");
    appendExternalCalendarOptions(container, []);
    const input = findFirstByTag(container, "INPUT");
    assert.ok(input);
    assert.strictEqual(input.checked, false);
    const label = findFirstByText(container, "cal-2");
    assert.ok(label);
  });

  it("skips rendering when calendar ids are invalid", () => {
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: "nope" };
    const container = new FakeElement("div");
    appendExternalCalendarOptions(container, []);
    assert.strictEqual(container.children.length, 0);
  });

  it("uses theme colors when a calendar has no color metadata", () => {
    state.settingsCache = { ...state.settingsCache, googleCalendarIds: ["cal-3"] };
    state.googleCalendarListCache = null;
    const container = new FakeElement("div");
    appendExternalCalendarOptions(container, "not-array");
    const swatch = findFirstByAttribute(container, "data-test-skedpal", "timemap-external-option-color");
    assert.ok(swatch);
    assert.strictEqual(swatch.style.backgroundColor, themeColors.sky400);
    assert.strictEqual(swatch.style.borderColor, themeColors.slate500);
    const label = findFirstByText(container, "cal-3");
    assert.ok(label);
  });
});
