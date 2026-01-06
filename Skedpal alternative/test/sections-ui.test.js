import "fake-indexeddb/auto.js";
import assert from "assert";
import { beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this._innerHTML = "";
    this.style = {};
    this.value = "";
    this.disabled = false;
    this.checked = false;
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classSet.add(n)),
      remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classSet.has(name)) this._classSet.delete(name);
          else this._classSet.add(name);
          return;
        }
        if (force) this._classSet.add(name);
        else this._classSet.delete(name);
      },
      contains: (name) => this._classSet.has(name)
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    if (this.tagName === "SELECT" && child?.selected) {
      this.value = child.value || "";
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  focus() {
    this._focused = true;
  }
}

function findByTestAttr(root, value) {
  if (!root) return null;
  if (root.attributes?.["data-test-skedpal"] === value) return root;
  for (const child of root.children || []) {
    const found = findByTestAttr(child, value);
    if (found) return found;
  }
  return null;
}

const elementIds = [
  "section-list",
  "section-new-name",
  "section-form-row",
  "section-form-toggle",
  "task-section",
  "task-subsection",
  "sidebar-favorites",
  "subsection-form-wrap",
  "subsection-form",
  "subsection-section-id",
  "subsection-parent-id",
  "subsection-name",
  "subsection-task-title",
  "subsection-task-link",
  "subsection-task-duration",
  "subsection-task-min-block",
  "subsection-task-priority",
  "subsection-task-deadline",
  "subsection-task-start-from",
  "subsection-task-repeat",
  "subsection-task-subtask-schedule",
  "subsection-timemap-options"
];

const elementMap = new Map(elementIds.map((id) => [id, new FakeElement("div")]));
elementMap.set("task-section", new FakeElement("select"));
elementMap.set("task-subsection", new FakeElement("select"));

function resetElements() {
  for (const el of elementMap.values()) {
    el.children = [];
    el.dataset = {};
    el.attributes = {};
    el.className = "";
    el.textContent = "";
    el.innerHTML = "";
    el.style = {};
    el.value = "";
    el.disabled = false;
    el.checked = false;
    el._classSet = new Set();
  }
}

function installDomStubs() {
  global.document = {
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: () => [],
    getElementById: (id) => elementMap.get(id) || null
  };
  global.confirm = () => true;
  global.alert = () => {};
  global.prompt = () => "";
}

installDomStubs();

const { state } = await import("../src/ui/state/page-state.js");
const { domRefs } = await import("../src/ui/constants.js");
const { repeatStore } = await import("../src/ui/repeat.js");

function wireDomRefs() {
  domRefs.sectionList = elementMap.get("section-list");
  domRefs.sectionInput = elementMap.get("section-new-name");
  domRefs.sectionFormRow = elementMap.get("section-form-row");
  domRefs.sectionFormToggle = elementMap.get("section-form-toggle");
  domRefs.taskSectionSelect = elementMap.get("task-section");
  domRefs.taskSubsectionSelect = elementMap.get("task-subsection");
  domRefs.sidebarFavorites = elementMap.get("sidebar-favorites");
  domRefs.subsectionFormWrap = elementMap.get("subsection-form-wrap");
  domRefs.subsectionForm = elementMap.get("subsection-form");
  domRefs.subsectionSectionIdInput = elementMap.get("subsection-section-id");
  domRefs.subsectionParentIdInput = elementMap.get("subsection-parent-id");
  domRefs.subsectionNameInput = elementMap.get("subsection-name");
  domRefs.subsectionTaskTitleInput = elementMap.get("subsection-task-title");
  domRefs.subsectionTaskLinkInput = elementMap.get("subsection-task-link");
  domRefs.subsectionTaskDurationInput = elementMap.get("subsection-task-duration");
  domRefs.subsectionTaskMinBlockInput = elementMap.get("subsection-task-min-block");
  domRefs.subsectionTaskPriorityInput = elementMap.get("subsection-task-priority");
  domRefs.subsectionTaskDeadlineInput = elementMap.get("subsection-task-deadline");
  domRefs.subsectionTaskStartFromInput = elementMap.get("subsection-task-start-from");
  domRefs.subsectionTaskRepeatSelect = elementMap.get("subsection-task-repeat");
  domRefs.subsectionTaskSubtaskScheduleSelect = elementMap.get("subsection-task-subtask-schedule");
  domRefs.subsectionTimeMapOptions = elementMap.get("subsection-timemap-options");
  domRefs.subsectionModalCloseBtns = [new FakeElement("button")];
}

wireDomRefs();
const sectionsModule = await import("../src/ui/sections.js");

describe("sections ui", () => {
  beforeEach(() => {
    installDomStubs();
    resetElements();
    wireDomRefs();
    state.settingsCache = {
      ...state.settingsCache,
      sections: [],
      subsections: {}
    };
  });

  it("resolves default and custom section names", () => {
    state.settingsCache.sections = [{ id: "custom", name: "Custom" }];
    assert.strictEqual(sectionsModule.getSectionName("section-work-default"), "Work");
    assert.strictEqual(sectionsModule.getSectionName("section-personal-default"), "Personal");
    assert.strictEqual(sectionsModule.getSectionName("custom"), "Custom");
    assert.strictEqual(sectionsModule.getSectionName("missing"), "");
  });

  it("renders section chips and hides default remove buttons", () => {
    state.settingsCache.sections = [
      { id: "section-work-default", name: "Work" },
      { id: "s1", name: "Projects" }
    ];

    sectionsModule.renderSections();
    const sectionList = elementMap.get("section-list");
    assert.strictEqual(sectionList.children.length, 2);
    const defaultRemove = findByTestAttr(sectionList.children[0], "section-remove-btn");
    const customRemove = findByTestAttr(sectionList.children[1], "section-remove-btn");
    assert.ok(defaultRemove.classList.contains("hidden"));
    assert.strictEqual(customRemove.classList.contains("hidden"), false);
  });

  it("toggles section form visibility and clears input", () => {
    const formRow = elementMap.get("section-form-row");
    const toggle = elementMap.get("section-form-toggle");
    const input = elementMap.get("section-new-name");
    formRow.classList.add("hidden");
    input.value = "New section";

    sectionsModule.openSectionForm();
    assert.strictEqual(formRow.classList.contains("hidden"), false);
    assert.strictEqual(toggle.textContent, "Hide section form");

    sectionsModule.closeSectionForm();
    assert.strictEqual(formRow.classList.contains("hidden"), true);
    assert.strictEqual(toggle.textContent, "Add section");
    assert.strictEqual(input.value, "");
  });

  it("renders section and subsection select options", () => {
    state.settingsCache.sections = [
      { id: "s1", name: "Work" },
      { id: "s2", name: "Personal" }
    ];
    state.settingsCache.subsections = {
      s2: [
        { id: "sub1", name: "Morning", parentId: "" },
        { id: "sub2", name: "Deep", parentId: "sub1" }
      ]
    };

    sectionsModule.renderTaskSectionOptions("s2");
    const sectionSelect = elementMap.get("task-section");
    const subsectionSelect = elementMap.get("task-subsection");
    assert.strictEqual(sectionSelect.children.length, 3);
    assert.strictEqual(sectionSelect.children[2].textContent, "Personal");
    assert.strictEqual(subsectionSelect.children.length, 3);
    assert.strictEqual(subsectionSelect.children[1].textContent, "Morning");
    assert.strictEqual(subsectionSelect.children[2].textContent, "-- Deep");

    sectionsModule.renderTaskSubsectionOptions("sub2");
    assert.strictEqual(subsectionSelect.value, "sub2");
  });

  it("renders empty favorites placeholder and favorite rows", () => {
    sectionsModule.renderFavoriteShortcuts();
    const sidebar = elementMap.get("sidebar-favorites");
    const empty = findByTestAttr(sidebar, "sidebar-fav-empty");
    assert.ok(empty);

    state.settingsCache.sections = [
      { id: "s1", name: "Work", favorite: true, favoriteOrder: 2 },
      { id: "s2", name: "Personal", favorite: true, favoriteOrder: 1 }
    ];
    state.settingsCache.subsections = {
      s1: [{ id: "sub1", name: "Deep", favorite: true, favoriteOrder: 3 }]
    };

    sectionsModule.renderFavoriteShortcuts();
    assert.strictEqual(sidebar.children.length, 3);
    assert.ok(sidebar.children[0].dataset.favKey);
    assert.ok(findByTestAttr(sidebar.children[0], "sidebar-fav-button"));
  });

  it("returns early for invalid section actions", async () => {
    const sectionInput = elementMap.get("section-new-name");
    sectionInput.value = "";
    await sectionsModule.handleAddSection();
    assert.strictEqual(state.settingsCache.sections.length, 0);

    state.settingsCache.sections = [{ id: "s1", name: "Work" }];
    sectionInput.value = "Work";
    await sectionsModule.handleAddSection();
    assert.strictEqual(sectionInput.value, "");

    global.confirm = () => false;
    await sectionsModule.handleRemoveSection("s1");
    assert.strictEqual(state.settingsCache.sections.length, 1);
  });

  it("blocks invalid subsection submissions", async () => {
    let alertMessage = "";
    global.alert = (msg) => {
      alertMessage = msg;
    };
    const startInput = elementMap.get("subsection-task-start-from");
    const deadlineInput = elementMap.get("subsection-task-deadline");
    startInput.value = "2026-01-10";
    deadlineInput.value = "2026-01-01";

    await sectionsModule.handleAddSubsection("s1", "Sub");
    assert.strictEqual(alertMessage, "Start from cannot be after deadline.");

    alertMessage = "";
    elementMap.get("subsection-section-id").value = "s1";
    elementMap.get("subsection-name").value = "Sub";
    await sectionsModule.handleSubsectionFormSubmit();
    assert.strictEqual(alertMessage, "Start from cannot be after deadline.");
  });

  it("returns early for rename and remove guards", async () => {
    await sectionsModule.handleRemoveSection("section-work-default");
    assert.strictEqual(state.settingsCache.sections.length, 0);

    await sectionsModule.handleRemoveSection("missing");
    assert.strictEqual(state.settingsCache.sections.length, 0);

    await sectionsModule.handleRenameSection("missing");
    await sectionsModule.handleRenameSubsection("", "");

    state.settingsCache.sections = [
      { id: "s1", name: "Work" },
      { id: "s2", name: "Personal" }
    ];
    global.prompt = () => null;
    await sectionsModule.handleRenameSection("s1");

    global.prompt = () => "Work";
    await sectionsModule.handleRenameSection("s1");

    global.prompt = () => "Personal";
    await sectionsModule.handleRenameSection("s1");
  });

  it("returns early when renaming subsections with invalid input", async () => {
    state.settingsCache.subsections = {
      s1: [
        { id: "sub1", name: "Deep" },
        { id: "sub2", name: "Focus" }
      ]
    };

    await sectionsModule.handleRenameSubsection("s1", "missing");

    global.prompt = () => null;
    await sectionsModule.handleRenameSubsection("s1", "sub1");

    global.prompt = () => "Deep";
    await sectionsModule.handleRenameSubsection("s1", "sub1");

    global.prompt = () => "Focus";
    await sectionsModule.handleRenameSubsection("s1", "sub1");
  });

  it("opens and closes subsection modal state", () => {
    state.settingsCache.sections = [{ id: "s1", name: "Work" }];
    state.settingsCache.subsections = {
      s1: [{ id: "sub1", name: "Deep", template: { title: "T1" } }]
    };
    sectionsModule.openSubsectionModal("s1", "", "sub1");
    assert.strictEqual(domRefs.subsectionFormWrap.classList.contains("hidden"), false);
    assert.strictEqual(sectionsModule.getEditingSubsectionId(), "sub1");
    assert.strictEqual(sectionsModule.getEditingSectionId(), "s1");

    repeatStore.subsectionRepeatSelection = { type: "custom" };
    sectionsModule.closeSubsectionModal();
    assert.strictEqual(domRefs.subsectionFormWrap.classList.contains("hidden"), true);
    assert.strictEqual(repeatStore.subsectionRepeatSelection.type, "none");
  });

  it("keeps renamed default section names", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      sections: [
        { id: "section-work-default", name: "My Work" },
        { id: "section-personal-default", name: "My Personal" }
      ],
      subsections: {
        "section-work-default": [],
        "section-personal-default": []
      }
    };

    const sections = await sectionsModule.ensureDefaultSectionsPresent();
    const nameById = new Map(sections.map((s) => [s.id, s.name]));
    assert.strictEqual(nameById.get("section-work-default"), "My Work");
    assert.strictEqual(nameById.get("section-personal-default"), "My Personal");
  });
});
