import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => null
  };
}

installDomStubs();

const { domRefs } = await import("../src/ui/constants.js");
const { initTimeMapSectionToggle } = await import("../src/ui/time-map-settings-toggle.js");

function makeElement(hidden = false) {
  const listeners = new Map();
  const classSet = new Set(hidden ? ["hidden"] : []);
  const element = {
    dataset: { testSkedpal: "time-map-toggle-test" },
    textContent: "",
    attributes: {},
    classList: {
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classSet.has(cls)) {classSet.delete(cls);}
          else {classSet.add(cls);}
          return;
        }
        if (force) {classSet.add(cls);}
        else {classSet.delete(cls);}
      },
      contains: (cls) => classSet.has(cls)
    },
    setAttribute: (name, value) => {
      element.attributes[name] = value;
    },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    _listeners: listeners,
    _classSet: classSet
  };
  return element;
}

describe("time map settings toggle", () => {
  let cleanup;

  beforeEach(() => {
    domRefs.timeMapSectionToggleBtn = null;
    domRefs.timeMapSectionContent = null;
  });

  afterEach(() => {
    if (typeof cleanup === "function") {
      cleanup();
    }
    cleanup = null;
  });

  it("returns a noop when toggle refs are missing", () => {
    cleanup = initTimeMapSectionToggle();
    assert.strictEqual(typeof cleanup, "function");
    cleanup();
  });

  it("toggles collapsed state and cleans up the click handler", () => {
    const toggleBtn = makeElement(false);
    const content = makeElement(false);
    domRefs.timeMapSectionToggleBtn = toggleBtn;
    domRefs.timeMapSectionContent = content;

    cleanup = initTimeMapSectionToggle();

    assert.strictEqual(toggleBtn.dataset.collapsed, "false");
    assert.strictEqual(toggleBtn.textContent, "Collapse");
    const clickHandler = toggleBtn._listeners.get("click");
    assert.ok(clickHandler);

    clickHandler();
    assert.strictEqual(content._classSet.has("hidden"), true);
    assert.strictEqual(toggleBtn.dataset.collapsed, "true");
    assert.strictEqual(toggleBtn.textContent, "Expand");
    assert.strictEqual(toggleBtn.attributes["aria-expanded"], "false");

    cleanup();
    assert.strictEqual(toggleBtn._listeners.has("click"), false);
  });
});
