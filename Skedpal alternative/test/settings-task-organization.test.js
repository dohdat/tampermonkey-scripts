import "fake-indexeddb/auto.js";
import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this._innerHTML = "";
    this.disabled = false;
    this.style = {};
    this.parentElement = null;
    this._classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classSet.add(name)),
      remove: (...names) => names.forEach((name) => this._classSet.delete(name)),
      contains: (name) => this._classSet.has(name)
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML === "") {
      this.children = [];
    }
  }

  appendChild(child) {
    child.parentElement = this;
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

  removeAttribute(name) {
    delete this.attributes[name];
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) {
        return current;
      }
      current = current.parentElement || null;
    }
    return null;
  }
}

function resetFakeElement(element) {
  if (!element) {return;}
  element.children = [];
  element.dataset = {};
  element.attributes = {};
  element.className = "";
  element.textContent = "";
  element._innerHTML = "";
  element.disabled = false;
  element.style = {};
  element.parentElement = null;
  element._classSet = new Set();
  element.classList = {
    add: (...names) => names.forEach((name) => element._classSet.add(name)),
    remove: (...names) => names.forEach((name) => element._classSet.delete(name)),
    contains: (name) => element._classSet.has(name)
  };
}

function matchesSelector(node, selector) {
  const match = selector.match(/^\[([^\]=]+)(?:=["']?([^"'\\]]+)["']?)?\]$/);
  if (!match) {return false;}
  const [, attribute, value] = match;
  const attributes = node?.attributes || {};
  let currentValue = attribute in attributes ? attributes[attribute] : undefined;
  if (currentValue === undefined && attribute.startsWith("data-")) {
    const key = attribute
      .slice(5)
      .split("-")
      .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    currentValue = node?.dataset?.[key];
  }
  if (currentValue === undefined) {return false;}
  if (value === undefined) {return true;}
  return currentValue === value;
}

let sharedDomIds = null;
let sharedBody = null;

function installDomStubs() {
  if (!sharedDomIds) {
    sharedDomIds = new Map([
      ["task-organization-modal", new FakeElement("div")],
      ["task-organization-modal-title", new FakeElement("div")],
      ["task-organization-modal-subtitle", new FakeElement("div")],
      ["task-organization-modal-status", new FakeElement("div")],
      ["task-organization-modal-output", new FakeElement("div")]
    ]);
    sharedBody = new FakeElement("body");
  }
  sharedDomIds.forEach((element) => resetFakeElement(element));
  resetFakeElement(sharedBody);
  const ids = sharedDomIds;
  const modal = ids.get("task-organization-modal");
  const title = ids.get("task-organization-modal-title");
  const subtitle = ids.get("task-organization-modal-subtitle");
  const status = ids.get("task-organization-modal-status");
  const output = ids.get("task-organization-modal-output");
  modal.setAttribute("data-test-skedpal", "task-organization-modal");
  title.setAttribute("data-test-skedpal", "task-organization-modal-title");
  subtitle.setAttribute("data-test-skedpal", "task-organization-modal-subtitle");
  status.setAttribute("data-test-skedpal", "task-organization-modal-status");
  output.setAttribute("data-test-skedpal", "task-organization-modal-output");
  modal.appendChild(title);
  modal.appendChild(subtitle);
  modal.appendChild(status);
  modal.appendChild(output);
  modal.classList.add("hidden");
  global.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => ids.get(id) || null,
    body: sharedBody,
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.window = {
    prompt: () => "",
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn) => {
      fn();
      return 1;
    }
  };
  global.Element = FakeElement;
  global.crypto = {
    randomUUID: () => "uuid-test-id"
  };
  global.__skedpalTestLoadTasks = async () => {};
}

function findByTestId(root, testId) {
  const matches = [];
  const visit = (node) => {
    if (node?.attributes?.["data-test-skedpal"] === testId) {
      matches.push(node);
    }
    (node?.children || []).forEach(visit);
  };
  visit(root);
  return matches;
}

function createPanel() {
  const panel = new FakeElement("div");
  panel.setAttribute("data-test-skedpal", "task-organization-panel");
  return panel;
}

function createButton() {
  const button = new FakeElement("button");
  button.setAttribute("data-test-skedpal", "task-organization-trigger");
  return button;
}

const originalDocument = global.document;
const originalWindow = global.window;
const originalFetch = global.fetch;
const originalElement = global.Element;
const originalCrypto = global.crypto;

installDomStubs();

const dbModule = await import("../src/data/db.js");
const { getAllTasks, restoreBackup, saveTask, DEFAULT_SETTINGS } = dbModule;
const { state } = await import("../src/ui/state/page-state.js");

describe("task organization review", () => {
  beforeEach(async () => {
    installDomStubs();
    state.settingsCache = {
      ...DEFAULT_SETTINGS,
      sections: [
        { id: "section-money", name: "Money" },
        { id: "section-home", name: "Home" }
      ],
      subsections: {
        "section-money": [{ id: "sub-finance", name: "Finance" }],
        "section-home": [
          { id: "sub-cleaning", name: "Cleaning", parentId: "" },
          { id: "sub-bathroom", name: "Bathroom", parentId: "sub-cleaning" }
        ]
      },
      groqApiKey: "test-key"
    };
    state.taskOrganizationSuggestions = [];
    state.taskOrganizationRawOutput = "";
    state.taskOrganizationScopeLabel = "";
    state.taskOrganizationBusy = false;
    await restoreBackup({ tasks: [], timeMaps: [], settings: state.settingsCache, taskTemplates: [] });
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    global.fetch = originalFetch;
    global.Element = originalElement;
    global.crypto = originalCrypto || global.crypto;
    delete global.__skedpalTestLoadTasks;
  });

  it("filters review items to active root tasks with placement labels", async () => {
    const { buildTaskOrganizationReviewItems } =
      await import("../src/ui/settings-task-organization.js?task-org=1");

    const result = buildTaskOrganizationReviewItems(
      [
        {
          id: "task-1",
          title: " Clean toilet ",
          section: "section-money",
          subsection: "sub-finance"
        },
        { id: "task-2", title: "Done", completed: true },
        { id: "task-3", title: "Deleted", deletedAt: new Date().toISOString() },
        { id: "task-4", title: "Child", subtaskParentId: "task-1" },
        { id: "task-5", title: "   " }
      ],
      state.settingsCache
    );

    assert.deepStrictEqual(result, [
      {
        id: "task-1",
        title: "Clean toilet",
        currentSectionName: "Money",
        currentSubsectionName: "Finance"
      }
    ]);
  });

  it("filters scoped review items for a section or subsection tree", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2");

    const tasks = [
      {
        id: "task-section",
        title: "Clean kitchen",
        section: "section-home",
        subsection: "sub-cleaning"
      },
      {
        id: "task-child-subsection",
        title: "Scrub toilet",
        section: "section-home",
        subsection: "sub-bathroom"
      },
      {
        id: "task-other-section",
        title: "Review taxes",
        section: "section-money",
        subsection: "sub-finance"
      }
    ];

    const sectionItems = buildTaskOrganizationScopeItems(
      tasks,
      { sectionId: "section-home" },
      state.settingsCache
    );
    const subsectionItems = buildTaskOrganizationScopeItems(
      tasks,
      { sectionId: "section-home", subsectionId: "sub-cleaning" },
      state.settingsCache
    );

    assert.deepStrictEqual(
      sectionItems.map((item) => item.id),
      ["task-section", "task-child-subsection"]
    );
    assert.deepStrictEqual(
      subsectionItems.map((item) => item.id),
      ["task-section", "task-child-subsection"]
    );
  });

  it("falls back to an exact subsection id when the subsection is missing from settings", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2b");

    const items = buildTaskOrganizationScopeItems(
      [
        {
          id: "task-missing-sub",
          title: "Loose task",
          section: "section-home",
          subsection: "sub-missing"
        }
      ],
      { sectionId: "section-home", subsectionId: "sub-missing" },
      state.settingsCache
    );

    assert.deepStrictEqual(items.map((item) => item.id), ["task-missing-sub"]);
  });

  it("returns all active root tasks when no scope is provided", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2c");

    const items = buildTaskOrganizationScopeItems(
      [
        { id: "task-1", title: "One", section: "section-home", subsection: "sub-cleaning" },
        { id: "task-2", title: "Two", section: "section-money", subsection: "sub-finance" },
        { id: "task-3", title: "Done", completed: true }
      ],
      {},
      state.settingsCache
    );

    assert.deepStrictEqual(
      items.map((item) => item.id),
      ["task-1", "task-2"]
    );
  });

  it("filters subsection scopes to matching section tasks that actually belong to that subtree", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2d");

    const items = buildTaskOrganizationScopeItems(
      [
        { id: "task-match", title: "Match", section: "section-home", subsection: "sub-bathroom" },
        { id: "task-no-sub", title: "No Sub", section: "section-home", subsection: "" },
        { id: "task-wrong-section", title: "Wrong", section: "section-money", subsection: "sub-bathroom" }
      ],
      { sectionId: "section-home", subsectionId: "sub-cleaning" },
      state.settingsCache
    );

    assert.deepStrictEqual(items.map((item) => item.id), ["task-match"]);
  });

  it("returns no items for an invalid subsection scope without a section id", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2e");

    const items = buildTaskOrganizationScopeItems(
      [
        { id: "task-1", title: "Loose", section: "section-home", subsection: "sub-cleaning" }
      ],
      { sectionId: "", subsectionId: "sub-cleaning" },
      state.settingsCache
    );

    assert.deepStrictEqual(items, []);
  });

  it("handles null scopes and missing subsection maps defensively", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2g");

    const allItems = buildTaskOrganizationScopeItems(
      [
        { id: "task-1", title: "Match", section: "section-home", subsection: "sub-cleaning" }
      ],
      null,
      state.settingsCache
    );
    const missingMapItems = buildTaskOrganizationScopeItems(
      [
        { id: "task-1", title: "Match", section: "section-home", subsection: "sub-cleaning" }
      ],
      { sectionId: "section-home", subsectionId: "sub-cleaning" },
      { ...state.settingsCache, subsections: undefined }
    );

    assert.deepStrictEqual(allItems.map((item) => item.id), ["task-1"]);
    assert.deepStrictEqual(missingMapItems.map((item) => item.id), ["task-1"]);
  });

  it("section scopes exclude tasks that are missing the selected section id", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2f");

    const items = buildTaskOrganizationScopeItems(
      [
        { id: "task-1", title: "Match", section: "section-home", subsection: "sub-cleaning" },
        { id: "task-2", title: "Missing", subsection: "sub-cleaning" }
      ],
      { sectionId: "section-home" },
      state.settingsCache
    );

    assert.deepStrictEqual(items.map((item) => item.id), ["task-1"]);
  });

  it("handles undefined task collections across all scope modes", async () => {
    const { buildTaskOrganizationScopeItems } =
      await import("../src/ui/settings-task-organization.js?task-org=2h");

    assert.deepStrictEqual(
      buildTaskOrganizationScopeItems(undefined, {}, state.settingsCache),
      []
    );
    assert.deepStrictEqual(
      buildTaskOrganizationScopeItems(undefined, { sectionId: "section-home" }, state.settingsCache),
      []
    );
    assert.deepStrictEqual(
      buildTaskOrganizationScopeItems(
        undefined,
        { sectionId: "section-home", subsectionId: "sub-cleaning" },
        state.settingsCache
      ),
      []
    );
  });

  it("batches review items with a safe fallback batch size", async () => {
    const { buildTaskOrganizationBatches } =
      await import("../src/ui/settings-task-organization.js?task-org=3");
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `task-${index}` }));

    assert.deepStrictEqual(
      buildTaskOrganizationBatches(items, 2).map((batch) => batch.length),
      [2, 2, 1]
    );
    assert.deepStrictEqual(
      buildTaskOrganizationBatches(items, 0).map((batch) => batch.length),
      [5]
    );
  });

  it("parses and normalizes task placement suggestions", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4");
    const parsed = parseTaskOrganizationResponse(
      JSON.stringify({
        reasoning: "These are obvious mismatches.",
        suggestions: [
          {
            taskId: "task-1",
            sectionName: "Home",
            subsectionName: "Bathroom",
            createSubsection: false,
            reason: "House chore."
          },
          {
            taskId: "task-2",
            sectionName: "Home",
            subsectionName: "Household",
            reason: "Needs a broader home bucket."
          },
          {
            taskId: "task-1",
            sectionName: "Money",
            subsectionName: "Finance"
          }
        ]
      }),
      [
        {
          id: "task-1",
          title: "Clean toilet",
          currentSectionName: "Money",
          currentSubsectionName: "Finance"
        },
        {
          id: "task-2",
          title: "Wash dishes",
          currentSectionName: "Money",
          currentSubsectionName: "Finance"
        }
      ],
      state.settingsCache
    );

    assert.deepStrictEqual(parsed, [
      {
        taskId: "task-1",
        taskTitle: "Clean toilet",
        currentSectionName: "Money",
        currentSubsectionName: "Finance",
        suggestedSectionName: "Home",
        suggestedSubsectionName: "Bathroom",
        suggestedParentSubsectionName: "",
        createSubsection: false,
        reason: "House chore."
      },
      {
        taskId: "task-2",
        taskTitle: "Wash dishes",
        currentSectionName: "Money",
        currentSubsectionName: "Finance",
        suggestedSectionName: "Home",
        suggestedSubsectionName: "Household",
        suggestedParentSubsectionName: "",
        createSubsection: true,
        reason: "Needs a broader home bucket."
      }
    ]);
  });

  it("returns null when no JSON object can be extracted", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4b");
    assert.strictEqual(parseTaskOrganizationResponse("plain text", [], state.settingsCache), null);
  });

  it("returns an empty list when the parsed payload has no suggestions array", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4c");
    assert.deepStrictEqual(
      parseTaskOrganizationResponse("{\"result\":\"ok\"}", [], state.settingsCache),
      []
    );
  });

  it("preserves explicit create-subsection suggestions during normalization", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4d");
    const parsed = parseTaskOrganizationResponse(
      JSON.stringify({
        suggestions: [
          {
            taskId: "task-1",
            sectionName: "Home",
            subsectionName: "Deep Cleaning",
            parentSubsectionName: "Cleaning",
            createSubsection: true
          }
        ]
      }),
      [
        {
          id: "task-1",
          title: "Clean toilet",
          currentSectionName: "Money",
          currentSubsectionName: "Finance"
        }
      ],
      state.settingsCache
    );

    assert.strictEqual(parsed[0].createSubsection, true);
    assert.strictEqual(parsed[0].suggestedParentSubsectionName, "Cleaning");
  });

  it("drops suggestions that point to non-leaf subsection headers", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4f");
    const parsed = parseTaskOrganizationResponse(
      JSON.stringify({
        suggestions: [
          {
            taskId: "task-1",
            sectionName: "Home",
            subsectionName: "Cleaning",
            createSubsection: false,
            reason: "Home cleaning bucket."
          }
        ]
      }),
      [
        {
          id: "task-1",
          title: "Clean toilet",
          currentSectionName: "Money",
          currentSubsectionName: "Finance"
        }
      ],
      state.settingsCache
    );

    assert.deepStrictEqual(parsed, []);
  });

  it("drops section-only suggestions when the target section already has subsections", async () => {
    const { parseTaskOrganizationResponse } =
      await import("../src/ui/settings-task-organization.js?task-org=4e");
    const parsed = parseTaskOrganizationResponse(
      JSON.stringify({
        suggestions: [
          {
            taskId: "task-1",
            sectionName: "Home",
            subsectionName: "",
            createSubsection: false,
            reason: "Home catch-all."
          }
        ]
      }),
      [
        {
          id: "task-1",
          title: "Clean toilet",
          currentSectionName: "Money",
          currentSubsectionName: "Finance"
        }
      ],
      state.settingsCache
    );

    assert.deepStrictEqual(parsed, []);
  });

  it("reviews only the selected section scope and renders suggestions inline", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    await saveTask({
      id: "task-money",
      title: "Review taxes",
      section: "section-money",
      subsection: "sub-finance"
    });

    let requestBody = null;
    global.fetch = async (_url, options = {}) => {
      requestBody = JSON.parse(options.body || "{}");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      taskId: "task-home",
                      sectionName: "Home",
                      subsectionName: "Bathroom",
                      createSubsection: false,
                      reason: "Bathroom chore."
                    }
                  ]
                })
              }
            }
          ]
        })
      };
    };

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=5");
    const panel = createPanel();
    const button = createButton();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button
    });

    const payloadText = requestBody?.messages?.[1]?.content || "";
    assert.ok(payloadText.includes("task-home"));
    assert.ok(!payloadText.includes("task-money"));
    assert.strictEqual(requestBody?.response_format?.type, "json_object");
    assert.strictEqual(requestBody?.temperature, 0);
    assert.strictEqual(button.disabled, false);
    assert.strictEqual(button.dataset.loading, "false");
    assert.strictEqual(findByTestId(panel, "task-organization-task-title-0")[0].textContent, "Clean toilet");
    assert.ok(findByTestId(panel, "task-organization-suggested-0")[0].textContent.includes("Home / Bathroom"));
    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("Suggested 1 move"));
  });

  it("renders create-subsection badges when Groq suggests a new subsection", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Deep Cleaning",
                    createSubsection: true,
                    reason: "Needs its own bucket."
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=5c");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.strictEqual(findByTestId(panel, "task-organization-badge-0")[0].textContent, "Create subsection");
    assert.strictEqual(findByTestId(panel, "task-organization-reason-0")[0].textContent, "Needs its own bucket.");
  });

  it("uses plural wording when Groq suggests multiple moves", async () => {
    await saveTask({
      id: "task-home-1",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    await saveTask({
      id: "task-home-2",
      title: "Wash mirror",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home-1",
                    sectionName: "Home",
                    subsectionName: "Bathroom"
                  },
                  {
                    taskId: "task-home-2",
                    sectionName: "Home",
                    subsectionName: "Bathroom"
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=5f");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("Suggested 2 moves across 2 tasks"));
  });

  it("still reviews through the modal when the legacy panel target is missing", async () => {
    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=5b");

    const handled = await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel: null,
      button: createButton()
    });

    assert.strictEqual(handled, true);
  });

  it("can review a scope without a trigger button element", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=5c2");
    const panel = createPanel();

    const handled = await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: null
    });

    assert.strictEqual(handled, true);
    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("No moves suggested"));
  });

  it("can reset and hide an existing scope panel", async () => {
    const {
      resetTaskOrganizationScopePanel,
      reviewTaskOrganizationScope
    } = await import("../src/ui/settings-task-organization.js?task-org=5d");
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }]
      })
    });
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });
    assert.strictEqual(panel.classList.contains("hidden"), false);

    assert.strictEqual(resetTaskOrganizationScopePanel(panel), true);
    assert.strictEqual(findByTestId(panel, "task-organization-status")[0].textContent, "");
    assert.strictEqual(panel.classList.contains("hidden"), true);
  });

  it("returns false when resetting a missing scope panel", async () => {
    const { resetTaskOrganizationScopePanel } =
      await import("../src/ui/settings-task-organization.js?task-org=5e");

    assert.strictEqual(resetTaskOrganizationScopePanel(null), false);
  });

  it("prompts for an API key and reports when no moves are suggested", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    state.settingsCache = { ...state.settingsCache, groqApiKey: "" };
    global.window.prompt = () => " new-key ";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=6");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.strictEqual(state.settingsCache.groqApiKey, "new-key");
    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("No moves suggested"));
  });

  it("shows an API key error when the prompt is dismissed", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    state.settingsCache = { ...state.settingsCache, groqApiKey: "" };
    global.window.prompt = () => "";

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=6b");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("API key required"));
  });

  it("renders raw output when Groq returns malformed content", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json" } }]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=7");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.strictEqual(findByTestId(panel, "task-organization-raw")[0].textContent, "not json");
    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("without valid JSON"));
  });

  it("renders raw output when Groq returns malformed JSON inside a JSON candidate", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{\"suggestions\":[}" } }]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=7c");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.strictEqual(findByTestId(panel, "task-organization-raw")[0].textContent, "{\"suggestions\":[}");
  });

  it("falls back to a default raw message when Groq returns empty content", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=7b");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.strictEqual(findByTestId(panel, "task-organization-raw")[0].textContent, "No response");
  });

  it("splits validation-failing batches and still returns scoped suggestions", async () => {
    await saveTask({
      id: "task-1",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    await saveTask({
      id: "task-2",
      title: "Wash mirror",
      section: "section-home",
      subsection: "sub-bathroom"
    });

    let callCount = 0;
    global.fetch = async (_url, options = {}) => {
      callCount += 1;
      const body = JSON.parse(options.body || "{}");
      const payloadText = body?.messages?.[1]?.content || "";
      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: async () => ({
            error: {
              message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
              code: "json_validate_failed",
              failed_generation: ""
            }
          })
        };
      }
      if (payloadText.includes("task-1")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [
                      {
                        taskId: "task-1",
                        sectionName: "Home",
                        subsectionName: "Bathroom",
                        reason: "Bathroom chore."
                      }
                    ]
                  })
                }
              }
            ]
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }]
        })
      };
    };

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=8");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.ok(callCount >= 3);
    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("Suggested 1 move"));
  });

  it("skips irreducible json validation failures instead of aborting the scope review", async () => {
    await saveTask({
      id: "task-1",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({
        error: {
          message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
          code: "json_validate_failed",
          failed_generation: ""
        }
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=9");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    const status = findByTestId(panel, "task-organization-status")[0].textContent;
    assert.ok(status.includes("No moves suggested."));
    assert.ok(status.includes("Skipped 1 task"));
    assert.strictEqual(findByTestId(panel, "task-organization-output")[0].classList.contains("hidden"), true);
  });

  it("uses plural skipped wording when multiple split tasks fail Groq JSON validation", async () => {
    await saveTask({
      id: "task-1",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    await saveTask({
      id: "task-2",
      title: "Wash mirror",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({
        error: {
          message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
          code: "json_validate_failed",
          failed_generation: ""
        }
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=9b");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    const status = findByTestId(panel, "task-organization-status")[0].textContent;
    assert.ok(status.includes("Skipped 2 tasks"));
  });

  it("reports section-specific failures and empty scopes", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => {
      throw new Error("network fail");
    };

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=10");
    const failingPanel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel: failingPanel,
      button: createButton()
    });

    assert.ok(findByTestId(failingPanel, "task-organization-status")[0].textContent.includes("Groq request failed for Home"));

    await restoreBackup({ tasks: [], timeMaps: [], settings: state.settingsCache, taskTemplates: [] });
    const emptyPanel = createPanel();
    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel: emptyPanel,
      button: createButton()
    });

    assert.ok(findByTestId(emptyPanel, "task-organization-status")[0].textContent.includes("No active root tasks in Home"));
  });

  it("reports when there are no configured sections", async () => {
    state.settingsCache = {
      ...state.settingsCache,
      sections: [],
      subsections: {}
    };

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=11");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("Add at least one section"));
  });

  it("falls back to the response status text when Groq returns a non-json error body", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-home",
      subsection: "sub-cleaning"
    });
    global.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: "Server exploded",
      json: async () => {
        throw new Error("bad json");
      }
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=11b");
    const panel = createPanel();

    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      panel,
      button: createButton()
    });

    assert.ok(findByTestId(panel, "task-organization-status")[0].textContent.includes("Groq request failed for Home"));
  });

  it("uses a subsection scope label and the generic selected-tasks fallback", async () => {
    await saveTask({
      id: "task-bathroom",
      title: "Scrub toilet",
      section: "section-home",
      subsection: "sub-bathroom"
    });
    global.fetch = async (_url, options = {}) => {
      const body = JSON.parse(options.body || "{}");
      const payloadText = body?.messages?.[1]?.content || "";
      assert.ok(payloadText.includes("task-bathroom"));
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }]
        })
      };
    };

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=12");
    const subsectionPanel = createPanel();
    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      subsectionId: "sub-cleaning",
      panel: subsectionPanel,
      button: createButton()
    });
    assert.ok(findByTestId(subsectionPanel, "task-organization-status")[0].textContent.includes("Home / Cleaning"));

    await restoreBackup({ tasks: [], timeMaps: [], settings: state.settingsCache, taskTemplates: [] });
    const genericPanel = createPanel();
    await reviewTaskOrganizationScope({
      panel: genericPanel,
      button: createButton()
    });
    assert.ok(findByTestId(genericPanel, "task-organization-status")[0].textContent.includes("selected tasks"));
  });

  it("renders review suggestions in the modal with accept and reject actions", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-money",
      subsection: "sub-finance"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Bathroom",
                    reason: "Bathroom chore."
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const { reviewTaskOrganizationScope } =
      await import("../src/ui/settings-task-organization.js?task-org=13");
    await reviewTaskOrganizationScope({
      sectionId: "section-money",
      button: createButton()
    });

    const modal = document.getElementById("task-organization-modal");
    assert.strictEqual(modal.classList.contains("hidden"), false);
    assert.strictEqual(findByTestId(modal, "task-organization-accept-0")[0].textContent, "Accept");
    assert.strictEqual(findByTestId(modal, "task-organization-reject-0")[0].textContent, "Reject");
  });

  it("accepts a suggestion from the modal and moves the task", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-money",
      subsection: "sub-finance"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Bathroom",
                    reason: "Bathroom chore."
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const {
      handleTaskOrganizationModalClick,
      reviewTaskOrganizationScope
    } = await import("../src/ui/settings-task-organization.js?task-org=14");
    await reviewTaskOrganizationScope({
      sectionId: "section-money",
      button: createButton()
    });

    const modal = document.getElementById("task-organization-modal");
    const acceptBtn = findByTestId(modal, "task-organization-accept-0")[0];
    await handleTaskOrganizationModalClick({ target: acceptBtn });

    const updatedTask = (await getAllTasks()).find((task) => task.id === "task-home");
    assert.strictEqual(updatedTask.section, "section-home");
    assert.strictEqual(updatedTask.subsection, "sub-bathroom");
    assert.strictEqual(findByTestId(modal, "task-organization-empty")[0].textContent, "No pending suggestions.");
    assert.ok(findByTestId(modal, "task-organization-modal-status")[0].textContent.includes("Moved"));
  });

  it("creates a subsection when accepting a create-subsection suggestion", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean ceiling fan",
      section: "section-money",
      subsection: "sub-finance"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Deep Cleaning",
                    parentSubsectionName: "Cleaning",
                    createSubsection: true,
                    reason: "Needs its own bucket."
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const {
      handleTaskOrganizationModalClick,
      reviewTaskOrganizationScope
    } = await import("../src/ui/settings-task-organization.js?task-org=15");
    await reviewTaskOrganizationScope({
      sectionId: "section-money",
      button: createButton()
    });

    const modal = document.getElementById("task-organization-modal");
    const acceptBtn = findByTestId(modal, "task-organization-accept-0")[0];
    await handleTaskOrganizationModalClick({ target: acceptBtn });

    const created = (state.settingsCache.subsections["section-home"] || []).find(
      (entry) => entry.name === "Deep Cleaning"
    );
    const updatedTask = (await getAllTasks()).find((task) => task.id === "task-home");
    assert.ok(created);
    assert.strictEqual(created.parentId, "sub-cleaning");
    assert.strictEqual(updatedTask.section, "section-home");
    assert.strictEqual(updatedTask.subsection, created.id);
  });

  it("creates a suggested subsection under the closest existing parent in the same section", async () => {
    await saveTask({
      id: "task-home",
      title: "Deep scrub shower glass",
      section: "section-home",
      subsection: "sub-bathroom"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Shower Deep Clean",
                    createSubsection: true,
                    reason: "Needs a sibling bucket."
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const {
      handleTaskOrganizationModalClick,
      reviewTaskOrganizationScope
    } = await import("../src/ui/settings-task-organization.js?task-org=15b");
    await reviewTaskOrganizationScope({
      sectionId: "section-home",
      button: createButton()
    });

    const modal = document.getElementById("task-organization-modal");
    const acceptBtn = findByTestId(modal, "task-organization-accept-0")[0];
    await handleTaskOrganizationModalClick({ target: acceptBtn });

    const created = (state.settingsCache.subsections["section-home"] || []).find(
      (entry) => entry.name === "Shower Deep Clean"
    );
    const updatedTask = (await getAllTasks()).find((task) => task.id === "task-home");

    assert.ok(created);
    assert.strictEqual(created.parentId, "sub-cleaning");
    assert.strictEqual(updatedTask.section, "section-home");
    assert.strictEqual(updatedTask.subsection, created.id);
  });

  it("rejects a suggestion from the modal without moving the task", async () => {
    await saveTask({
      id: "task-home",
      title: "Clean toilet",
      section: "section-money",
      subsection: "sub-finance"
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    taskId: "task-home",
                    sectionName: "Home",
                    subsectionName: "Bathroom"
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const {
      handleTaskOrganizationModalClick,
      reviewTaskOrganizationScope
    } = await import("../src/ui/settings-task-organization.js?task-org=16");
    await reviewTaskOrganizationScope({
      sectionId: "section-money",
      button: createButton()
    });

    const modal = document.getElementById("task-organization-modal");
    const rejectBtn = findByTestId(modal, "task-organization-reject-0")[0];
    await handleTaskOrganizationModalClick({ target: rejectBtn });

    const updatedTask = (await getAllTasks()).find((task) => task.id === "task-home");
    assert.strictEqual(updatedTask.section, "section-money");
    assert.strictEqual(updatedTask.subsection, "sub-finance");
    assert.ok(findByTestId(modal, "task-organization-modal-status")[0].textContent.includes("Rejected"));
  });
});
