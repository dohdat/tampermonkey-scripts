import assert from "assert";
import { describe, it } from "mocha";

import {
  toggleTemplateSubtaskList,
  getNextTemplateOrder,
  getExpandedTemplateIds,
  getTemplateCardFromNode
} from "../src/ui/task-templates-utils.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name) {
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.textContent = "";
    this.attributes = {};
    this.className = "";
    this.classList = new FakeClassList();
    this.closestResult = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector() {
    return this.queryResult || null;
  }

  querySelectorAll() {
    return this.children;
  }

  closest(selector) {
    return this.closestResult?.[selector] || null;
  }
}

describe("task template utils", () => {
  it("toggles subtask list visibility and labels", () => {
    const card = new FakeElement();
    const subtaskList = new FakeElement();
    subtaskList.classList.toggle("hidden");
    card.queryResult = subtaskList;
    const button = new FakeElement();

    toggleTemplateSubtaskList(card, button);
    assert.strictEqual(button.textContent, "Collapse");
    assert.strictEqual(button.attributes["aria-expanded"], "true");
  });

  it("returns early when required nodes are missing", () => {
    toggleTemplateSubtaskList(null, null);
    const card = new FakeElement();
    card.queryResult = null;
    const button = new FakeElement();
    toggleTemplateSubtaskList(card, button);
    assert.strictEqual(button.textContent, "");
  });

  it("computes next template order and expanded ids", () => {
    assert.strictEqual(getNextTemplateOrder([{ order: 2 }, { order: "3" }]), 4);
    assert.strictEqual(getNextTemplateOrder([{ order: "bad" }]), 1);
    assert.strictEqual(getNextTemplateOrder(null), 1);

    const list = new FakeElement();
    const cardA = new FakeElement();
    cardA.dataset.templateId = "t1";
    const subtaskA = new FakeElement();
    cardA.queryResult = subtaskA;
    const cardB = new FakeElement();
    cardB.dataset.templateId = "t2";
    const subtaskB = new FakeElement();
    subtaskB.classList.toggle("hidden");
    cardB.queryResult = subtaskB;
    list.appendChild(cardA);
    list.appendChild(cardB);

    const expanded = getExpandedTemplateIds(list);
    assert.ok(expanded.has("t1"));
    assert.ok(expanded.has("t2") === false);
    assert.deepStrictEqual(Array.from(getExpandedTemplateIds(null)), []);
  });

  it("skips cards without template ids or subtask lists", () => {
    const list = new FakeElement();
    const cardMissingId = new FakeElement();
    cardMissingId.dataset.templateId = "";
    const cardMissingList = new FakeElement();
    cardMissingList.dataset.templateId = "t3";
    cardMissingList.queryResult = null;
    list.appendChild(cardMissingId);
    list.appendChild(cardMissingList);

    const expanded = getExpandedTemplateIds(list);
    assert.strictEqual(expanded.size, 0);
  });

  it("falls back to className when classList is missing", () => {
    const list = new FakeElement();
    const card = new FakeElement();
    card.dataset.templateId = "t4";
    const subtaskList = { className: "hidden" };
    card.queryResult = subtaskList;
    list.appendChild(card);
    const expanded = getExpandedTemplateIds(list);
    assert.strictEqual(expanded.size, 0);
  });

  it("expands when className omits hidden", () => {
    const list = new FakeElement();
    const card = new FakeElement();
    card.dataset.templateId = "t5";
    const subtaskList = { className: "visible" };
    card.queryResult = subtaskList;
    list.appendChild(card);
    const expanded = getExpandedTemplateIds(list);
    assert.ok(expanded.has("t5"));
  });

  it("resolves template cards from nodes defensively", () => {
    assert.strictEqual(getTemplateCardFromNode(null), null);
    const node = new FakeElement();
    const card = new FakeElement();
    node.closestResult = { "[data-template-card]": card };
    assert.strictEqual(getTemplateCardFromNode(node), card);
  });
});
