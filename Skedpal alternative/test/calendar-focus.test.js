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
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._indicator = null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector(selector) {
    if (selector === '[data-test-skedpal="calendar-now-indicator"]') {
      return this._indicator;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  setIndicator(indicator) {
    this._indicator = indicator;
  }
}

const elements = new Map();
elements.set("calendar-grid", new FakeElement("div"));

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, new FakeElement("div"));
      }
      return elements.get(id);
    }
  };
}

installDomStubs();

const { focusCalendarNow } = await import("../src/ui/calendar.js");

describe("calendar focus", () => {
  beforeEach(() => {
    installDomStubs();
    elements.get("calendar-grid").setIndicator(null);
  });

  it("scrolls to the now indicator when present", () => {
    let scrollOptions = null;
    const indicator = {
      scrollIntoView: (options) => {
        scrollOptions = options;
      }
    };
    elements.get("calendar-grid").setIndicator(indicator);

    const didScroll = focusCalendarNow({ behavior: "auto" });

    assert.strictEqual(didScroll, true);
    assert.deepStrictEqual(scrollOptions, {
      block: "center",
      inline: "nearest",
      behavior: "auto"
    });
  });

  it("returns false when the now indicator is missing", () => {
    const didScroll = focusCalendarNow();
    assert.strictEqual(didScroll, false);
  });
});
