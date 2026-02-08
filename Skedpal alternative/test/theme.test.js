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

  it("no-ops when the target is missing or has no ownerDocument", () => {
    assert.doesNotThrow(() => applyTheme(null));
    const orphan = new FakeElement("div");
    assert.doesNotThrow(() => applyTheme(orphan));
  });

  it("handles documents without a head element", () => {
    const doc = {
      head: null,
      documentElement: new FakeElement("html"),
      getElementById: () => null,
      createElement: (tag) => new FakeElement(tag)
    };
    doc.documentElement.ownerDocument = doc;
    assert.doesNotThrow(() => applyTheme(doc.documentElement));
  });

  it("handles missing global document on default target", () => {
    const originalDocument = global.document;
    global.document = undefined;
    assert.doesNotThrow(() => applyTheme());
    global.document = originalDocument;
  });

  it("uses the global document for the default target", () => {
    const originalDocument = global.document;
    const doc = buildDocumentStub();
    global.document = doc;
    applyTheme();
    const style = doc.getElementById("skedpal-theme");
    assert.ok(style);
    global.document = originalDocument;
  });
});
