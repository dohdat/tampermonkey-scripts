import assert from "assert";
import { describe, it, afterEach } from "mocha";

import { buildReminderDetailItem } from "../src/ui/tasks/task-card-details.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .split("-")
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
      this.dataset[key] = stringValue;
    }
  }
}

const originalDocument = global.document;

function installDomStubs() {
  global.document = {
    createElement: (tagName) => new FakeElement(tagName)
  };
}

function buildDetailItemElement() {
  const item = new FakeElement("div");
  const valueEl = new FakeElement("div");
  item.appendChild(valueEl);
  return { item, valueEl };
}

describe("task card details", () => {
  afterEach(() => {
    global.document = originalDocument;
  });

  it("returns null when there are no active reminders", () => {
    installDomStubs();
    const result = buildReminderDetailItem({
      task: {
        id: "task-1",
        reminders: [{ remindAt: "2026-02-01T09:00:00Z", dismissedAt: "2026-02-01T08:00:00Z" }]
      },
      buildDetailItemElement,
      formatDateTime: (value) => value,
      reminderIconSvg: "<svg />"
    });
    assert.strictEqual(result, null);
  });

  it("renders reminder labels with unknown times", () => {
    installDomStubs();
    const item = buildReminderDetailItem({
      task: {
        id: "task-2",
        reminders: [
          { remindAt: "", dismissedAt: null },
          { remindAt: "bad", dismissedAt: null }
        ]
      },
      buildDetailItemElement,
      formatDateTime: (value) => `formatted:${value}`,
      reminderIconSvg: "<svg />"
    });
    assert.ok(item);
    const valueEl = item.children[0];
    const label = valueEl.children.find(
      (child) => child.attributes?.["data-test-skedpal"] === "task-reminders-label"
    );
    assert.ok(label.textContent.includes("Unknown time"));
  });

  it("renders singular reminder labels with formatted times", () => {
    installDomStubs();
    const item = buildReminderDetailItem({
      task: {
        id: "task-3",
        reminders: [{ remindAt: "2026-02-01T09:00:00Z", dismissedAt: null }]
      },
      buildDetailItemElement,
      formatDateTime: () => "formatted",
      reminderIconSvg: "<svg />"
    });
    const valueEl = item.children[0];
    const label = valueEl.children.find(
      (child) => child.attributes?.["data-test-skedpal"] === "task-reminders-label"
    );
    assert.ok(label.textContent.includes("1 reminder"));
    assert.ok(label.textContent.includes("formatted"));
  });

  it("sorts reminders by valid dates and ignores invalid ones", () => {
    installDomStubs();
    const item = buildReminderDetailItem({
      task: {
        id: "task-4",
        reminders: [
          { remindAt: "2026-02-01T09:00:00Z", dismissedAt: null },
          { remindAt: "bad", dismissedAt: null }
        ]
      },
      buildDetailItemElement,
      formatDateTime: () => "formatted",
      reminderIconSvg: "<svg />"
    });
    const valueEl = item.children[0];
    const label = valueEl.children.find(
      (child) => child.attributes?.["data-test-skedpal"] === "task-reminders-label"
    );
    assert.ok(label.textContent.includes("formatted"));
  });

  it("sorts reminders by earliest valid date", () => {
    installDomStubs();
    const item = buildReminderDetailItem({
      task: {
        id: "task-5",
        reminders: [
          { remindAt: "2026-02-03T09:00:00Z", dismissedAt: null },
          { remindAt: "2026-02-02T08:00:00Z", dismissedAt: null }
        ]
      },
      buildDetailItemElement,
      formatDateTime: (value) => `formatted:${value}`,
      reminderIconSvg: "<svg />"
    });
    const valueEl = item.children[0];
    const label = valueEl.children.find(
      (child) => child.attributes?.["data-test-skedpal"] === "task-reminders-label"
    );
    assert.ok(label.textContent.includes("formatted:2026-02-02T08:00:00Z"));
  });
});
