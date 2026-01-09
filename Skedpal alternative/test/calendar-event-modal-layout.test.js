import assert from "assert";
import { after, describe, it } from "mocha";

import {
  positionCalendarEventModal,
  resetCalendarModalPosition,
  scheduleCalendarEventModalPosition
} from "../src/ui/calendar-event-modal-layout.js";

class FakePanel {
  constructor() {
    this.style = {};
  }

  getBoundingClientRect() {
    return { width: 200, height: 120 };
  }
}

function buildModal(panel) {
  return {
    querySelector: (selector) => (selector === ".calendar-event-modal__panel" ? panel : null)
  };
}

describe("calendar event modal layout", () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousRaf = global.requestAnimationFrame;

  function installViewport(width, height) {
    global.window = { innerWidth: width, innerHeight: height };
    global.document = { documentElement: { clientWidth: 0, clientHeight: 0 } };
  }

  it("positions the modal within the viewport", () => {
    const panel = new FakePanel();
    const modal = buildModal(panel);
    installViewport(220, 160);

    positionCalendarEventModal(modal, {
      left: 10,
      right: 20,
      top: 5
    });

    assert.strictEqual(panel.style.position, "fixed");
    assert.ok(Number(panel.style.left.replace("px", "")) <= 8);
    assert.strictEqual(panel.style.top, "12px");
  });

  it("repositions the modal when it would overflow on the right", () => {
    const panel = new FakePanel();
    const modal = buildModal(panel);
    installViewport(300, 200);

    positionCalendarEventModal(modal, {
      left: 280,
      right: 290,
      top: 90
    });

    assert.strictEqual(panel.style.position, "fixed");
    assert.strictEqual(panel.style.left, "68px");
    assert.strictEqual(panel.style.top, "68px");
  });

  it("resets position when no anchor is provided", () => {
    const panel = new FakePanel();
    const modal = buildModal(panel);
    panel.style.position = "fixed";
    panel.style.top = "10px";
    panel.style.left = "10px";

    resetCalendarModalPosition(modal);
    assert.strictEqual(panel.style.position, "");
    assert.strictEqual(panel.style.top, "");
    assert.strictEqual(panel.style.left, "");
  });

  it("schedules positioning and falls back to reset without anchor", () => {
    const panel = new FakePanel();
    const modal = buildModal(panel);
    installViewport(300, 200);
    global.requestAnimationFrame = (cb) => cb();

    scheduleCalendarEventModalPosition(modal, {
      getBoundingClientRect: () => ({
        left: 50,
        right: 80,
        top: 30
      })
    });

    assert.strictEqual(panel.style.position, "fixed");

    scheduleCalendarEventModalPosition(modal, null);
    assert.strictEqual(panel.style.position, "");
  });

  after(() => {
    global.window = previousWindow;
    global.document = previousDocument;
    global.requestAnimationFrame = previousRaf;
  });
});
