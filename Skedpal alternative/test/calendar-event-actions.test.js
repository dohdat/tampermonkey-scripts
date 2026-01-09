import assert from "assert";
import { describe, it } from "mocha";

import {
  resolveCalendarEventAction,
  setActionButtonVisibility
} from "../src/ui/calendar-event-actions.js";

class FakeButton {
  constructor(action) {
    this.dataset = { calendarEventAction: action };
    this.hidden = false;
    this.tabIndex = 0;
    this._classSet = new Set();
    this.classList = {
      toggle: (name, value) => {
        if (value) {
          this._classSet.add(name);
        } else {
          this._classSet.delete(name);
        }
      }
    };
    this.style = {};
    this._attrs = new Map();
  }

  setAttribute(name, value) {
    this._attrs.set(name, value);
  }

  removeAttribute(name) {
    this._attrs.delete(name);
  }

  getAttribute(name) {
    return this._attrs.get(name);
  }
}

describe("calendar event actions", () => {
  it("toggles action buttons based on visibility map", () => {
    const complete = new FakeButton("complete");
    const edit = new FakeButton("edit");

    setActionButtonVisibility([complete, edit], { complete: false, edit: true });

    assert.strictEqual(complete.hidden, true);
    assert.strictEqual(complete.getAttribute("aria-hidden"), "true");
    assert.strictEqual(complete.getAttribute("disabled"), "true");
    assert.strictEqual(edit.hidden, false);
    assert.strictEqual(edit.getAttribute("aria-hidden"), "false");
    assert.strictEqual(edit.getAttribute("disabled"), undefined);
  });

  it("resolves task handlers and ignores unknown actions", () => {
    const onEdit = () => "edit";
    const resolved = resolveCalendarEventAction("edit", {
      activeTask: { id: "t1" },
      activeExternalEvent: null,
      onEdit
    });

    assert.strictEqual(resolved, onEdit);
    assert.strictEqual(resolveCalendarEventAction("unknown", { activeTask: {} }), null);
  });

  it("prefers external handlers when viewing external events", () => {
    const onExternalEdit = () => "external-edit";
    const onExternalDelete = () => "external-delete";

    assert.strictEqual(
      resolveCalendarEventAction("edit", {
        activeTask: null,
        activeExternalEvent: { id: "ext-1" },
        onExternalEdit,
        onExternalDelete
      }),
      onExternalEdit
    );

    assert.strictEqual(
      resolveCalendarEventAction("delete", {
        activeTask: null,
        activeExternalEvent: { id: "ext-1" },
        onExternalEdit,
        onExternalDelete
      }),
      onExternalDelete
    );

    assert.strictEqual(
      resolveCalendarEventAction("zoom", {
        activeTask: null,
        activeExternalEvent: { id: "ext-1" }
      }),
      null
    );
  });
});
