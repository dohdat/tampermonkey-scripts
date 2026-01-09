import assert from "assert";
import { describe, it } from "mocha";
import { buildCreateTaskUrl, extractUrlFromText } from "../src/background/context-menu.js";

describe("background context menu helpers", () => {
  it("extracts the first URL from text", () => {
    assert.strictEqual(extractUrlFromText("no url here"), "");
    assert.strictEqual(
      extractUrlFromText("See https://example.com/path for details"),
      "https://example.com/path"
    );
  });

  it("builds a create task URL with a link target", () => {
    const result = buildCreateTaskUrl(
      {
        selectionText: "Read docs",
        linkUrl: "https://example.com/docs",
        pageUrl: "https://example.com"
      },
      "https://extension/pages/index.html",
      "Example Page"
    );
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get("newTask"), "1");
    assert.strictEqual(url.searchParams.get("title"), "Read docs");
    assert.strictEqual(url.searchParams.get("url"), "https://example.com/docs");
  });

  it("prefers the page title when no selection exists", () => {
    const result = buildCreateTaskUrl(
      {
        selectionText: "",
        linkText: "Docs link",
        linkUrl: "https://example.com/docs",
        pageUrl: "https://example.com"
      },
      "https://extension/pages/index.html",
      "Example Home"
    );
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get("title"), "Example Home");
    assert.strictEqual(url.searchParams.get("url"), "https://example.com/docs");
  });

  it("uses the page title when no selection or link text exists", () => {
    const result = buildCreateTaskUrl(
      {
        selectionText: "",
        linkText: "",
        linkUrl: "",
        pageUrl: "https://example.com"
      },
      "https://extension/pages/index.html",
      "Example Home"
    );
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get("title"), "Example Home");
    assert.strictEqual(url.searchParams.get("url"), "https://example.com");
  });

  it("falls back to a URL-based title when no selection exists", () => {
    const result = buildCreateTaskUrl(
      {
        selectionText: "",
        linkUrl: "https://example.com/docs/getting-started",
        pageUrl: "https://example.com"
      },
      "https://extension/pages/index.html",
      ""
    );
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get("title"), "getting-started");
    assert.strictEqual(url.searchParams.get("url"), "https://example.com/docs/getting-started");
  });

  it("falls back to selection URLs when no link target exists", () => {
    const result = buildCreateTaskUrl(
      {
        selectionText: "https://example.com/path",
        pageUrl: "https://example.com"
      },
      "https://extension/pages/index.html"
    );
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get("url"), "https://example.com/path");
  });
});
