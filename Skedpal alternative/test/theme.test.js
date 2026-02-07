import assert from "assert";
import { describe, it } from "mocha";

import { applyTheme } from "../src/ui/theme.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.id = "";
    this.textContent = "";
    this.ownerDocument = null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function buildDocumentStub() {
  const head = new FakeElement("head");
  const doc = {
    head,
    documentElement: new FakeElement("html"),
    getElementById: (id) => head.children.find((child) => child.id === id) || null,
    createElement: (tag) => new FakeElement(tag)
  };
  doc.documentElement.ownerDocument = doc;
  return doc;
}

describe("theme", () => {
  it("applies theme variables to a document style tag", () => {
    const doc = buildDocumentStub();
    applyTheme(doc.documentElement);
    const style = doc.getElementById("skedpal-theme");
    assert.ok(style);
    assert.ok(style.textContent.includes(":root"));

    applyTheme(doc.documentElement);
    assert.strictEqual(doc.head.children.length, 1);
  });
});
