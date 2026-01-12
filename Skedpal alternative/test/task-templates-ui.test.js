import assert from "assert";
import { describe, it } from "mocha";
import {
  toggleTemplateSubtaskList,
  getExpandedTemplateIds,
  getNextTemplateOrder
} from "../src/ui/task-templates-utils.js";

class FakeElement {
  constructor() {
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      toggle: (name) => {
        if (this._classSet.has(name)) {
          this._classSet.delete(name);
          return false;
        }
        this._classSet.add(name);
        return true;
      },
      contains: (name) => this._classSet.has(name)
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

describe("task template ui", () => {
  it("toggles template subtask list visibility", () => {
    const list = new FakeElement();
    list.dataset.templateSubtaskList = "template-1";
    list.classList.add("hidden");
    const card = {
      querySelector: (selector) => (selector === "[data-template-subtask-list]" ? list : null)
    };
    const btn = new FakeElement();
    btn.textContent = "Expand";
    btn.setAttribute("aria-expanded", "false");

    toggleTemplateSubtaskList(card, btn);
    assert.strictEqual(list.classList.contains("hidden"), false);
    assert.strictEqual(btn.textContent, "Collapse");
    assert.strictEqual(btn.attributes["aria-expanded"], "true");

    toggleTemplateSubtaskList(card, btn);
    assert.strictEqual(list.classList.contains("hidden"), true);
    assert.strictEqual(btn.textContent, "Expand");
    assert.strictEqual(btn.attributes["aria-expanded"], "false");
  });

  it("collects expanded template ids from the list", () => {
    const expandedList = new FakeElement();
    expandedList.dataset.templateSubtaskList = "t1";
    const collapsedList = new FakeElement();
    collapsedList.dataset.templateSubtaskList = "t2";
    collapsedList.classList.add("hidden");

    const cards = [
      {
        dataset: { templateId: "t1", templateCard: "true" },
        querySelector: (selector) =>
          selector === "[data-template-subtask-list]" ? expandedList : null
      },
      {
        dataset: { templateId: "t2", templateCard: "true" },
        querySelector: (selector) =>
          selector === "[data-template-subtask-list]" ? collapsedList : null
      }
    ];

    const list = {
      querySelectorAll: (selector) => (selector === "[data-template-card]" ? cards : [])
    };

    const expanded = getExpandedTemplateIds(list);
    assert.deepStrictEqual([...expanded], ["t1"]);
  });

  it("computes the next template order from existing items", () => {
    const templates = [{ order: 2 }, { order: "5" }, { order: null }];
    assert.strictEqual(getNextTemplateOrder(templates), 6);
  });

  it("defaults to order 1 for empty template lists", () => {
    assert.strictEqual(getNextTemplateOrder([]), 1);
  });
});
