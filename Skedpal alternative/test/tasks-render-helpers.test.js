import assert from "assert";
import { beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.title = "";
    this.type = "";
    this.innerHTML = "";
    this.disabled = false;
    this.style = {};
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      contains: (name) => this._classSet.has(name)
    };
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

function installDomStubs() {
  global.document = {
    createElement: (tagName) => new FakeElement(tagName),
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  };
}

installDomStubs();

describe("tasks render helpers", () => {
  beforeEach(() => {
    installDomStubs();
  });

  it("builds section and subsection organization review buttons", async () => {
    const {
      buildDragHandleButton,
      buildSectionActionButtons,
      buildSubsectionActionButtons
    } = await import("../src/ui/tasks/tasks-render-helpers.js?task-org-buttons=1");

    const themeColors = {
      cyan400: "#22d3ee",
      green500: "#22c55e",
      orange500: "#f97316",
      lime400: "#a3e635",
      sky400: "#38bdf8"
    };
    const icons = {
      caretDownIconSvg: "<svg></svg>",
      caretRightIconSvg: "<svg></svg>",
      editIconSvg: "<svg></svg>",
      favoriteIconSvg: "<svg></svg>",
      zoomInIconSvg: "<svg></svg>",
      removeIconSvg: "<svg></svg>",
      sparklesIconSvg: "<svg></svg>",
      subtaskIconSvg: "<svg></svg>",
      sortIconSvg: "<svg></svg>"
    };

    const sectionButtons = buildSectionActionButtons({
      section: { id: "section-home", favorite: false },
      isCollapsed: false,
      themeColors,
      icons
    });
    const subsectionButtons = buildSubsectionActionButtons({
      sub: { id: "sub-cleaning", favorite: false },
      sectionId: "section-home",
      isNoSection: false,
      themeColors,
      icons
    });
    const noSectionSubsectionButtons = buildSubsectionActionButtons({
      sub: { id: "sub-loose", favorite: true },
      sectionId: "section-home",
      isNoSection: true,
      themeColors,
      icons
    });
    const defaultSectionButtons = buildSectionActionButtons({
      section: { id: "section-work-default", favorite: true },
      isCollapsed: true,
      themeColors,
      icons
    });
    const dragHandle = buildDragHandleButton({
      label: "Drag subsection",
      datasetKey: "subsectionDragHandle",
      datasetValue: "sub-cleaning",
      testId: "drag-handle"
    });

    assert.strictEqual(
      sectionButtons.reviewSectionBtn.dataset.reviewSectionOrganization,
      "section-home"
    );
    assert.strictEqual(
      sectionButtons.reviewSectionBtn.attributes["data-test-skedpal"],
      "section-review-organization-btn"
    );
    assert.strictEqual(
      subsectionButtons.reviewSubBtn.dataset.reviewSubsectionOrganization,
      "sub-cleaning"
    );
    assert.strictEqual(
      subsectionButtons.reviewSubBtn.dataset.parentSection,
      "section-home"
    );
    assert.strictEqual(
      subsectionButtons.reviewSubBtn.attributes["data-test-skedpal"],
      "subsection-review-organization-btn"
    );
    assert.strictEqual(defaultSectionButtons.removeSectionBtn.disabled, true);
    assert.ok(defaultSectionButtons.removeSectionBtn.classList.contains("cursor-not-allowed"));
    assert.ok(defaultSectionButtons.collapseBtn.innerHTML.includes("<svg>"));
    assert.ok(defaultSectionButtons.favoriteSectionBtn.className.includes("favorite-active"));
    assert.strictEqual(subsectionButtons.favoriteSubBtn.className.includes("favorite-active"), false);
    assert.ok(noSectionSubsectionButtons.favoriteSubBtn.className.includes("favorite-active"));
    assert.strictEqual(noSectionSubsectionButtons.addChildSubBtn.dataset.sectionId, "");
    assert.strictEqual(dragHandle.dataset.subsectionDragHandle, "sub-cleaning");
    assert.strictEqual(dragHandle.attributes["data-test-skedpal"], "drag-handle");
  });
});
