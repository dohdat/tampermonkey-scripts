import assert from "assert";
import { describe, it, beforeEach } from "mocha";

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: () => null
  };
}

installDomStubs();

const { state } = await import("../src/ui/state/page-state.js");
const {
  getSectionById,
  getSectionName,
  getSubsectionsFor
} = await import("../src/ui/sections-data.js");

describe("subsection templates", () => {
  beforeEach(() => {
    installDomStubs();
    state.settingsCache = {
      ...state.settingsCache,
      subsections: {}
    };
  });

  it("defaults subtask scheduling mode when missing", () => {
    state.settingsCache = {
      ...state.settingsCache,
      subsections: {
        s1: [{ id: "sub1", name: "Subsection" }]
      }
    };
    const result = getSubsectionsFor("s1");
    assert.strictEqual(result[0].template.subtaskScheduleMode, "parallel");
  });

  it("normalizes invalid subtask scheduling modes", () => {
    state.settingsCache = {
      ...state.settingsCache,
      subsections: {
        s1: [{ id: "sub1", name: "Subsection", template: { subtaskScheduleMode: "bad" } }]
      }
    };
    const result = getSubsectionsFor("s1");
    assert.strictEqual(result[0].template.subtaskScheduleMode, "parallel");
  });

  it("keeps valid subtask scheduling modes", () => {
    state.settingsCache = {
      ...state.settingsCache,
      subsections: {
        s1: [{ id: "sub1", name: "Subsection", template: { subtaskScheduleMode: "sequential" } }]
      }
    };
    const result = getSubsectionsFor("s1");
    assert.strictEqual(result[0].template.subtaskScheduleMode, "sequential");
  });

  it("falls back to name-keyed subsections when id key is missing", () => {
    state.settingsCache = {
      ...state.settingsCache,
      sections: [{ id: "s1", name: "Personal" }],
      subsections: {
        Personal: [{ id: "sub1", name: "Home" }]
      }
    };
    const result = getSubsectionsFor("s1");
    assert.strictEqual(result[0].name, "Home");
  });

  it("returns empty strings and lists when identifiers are missing", () => {
    state.settingsCache = {
      ...state.settingsCache,
      sections: undefined,
      subsections: null
    };
    assert.strictEqual(getSubsectionsFor("missing").length, 0);
    assert.strictEqual(getSectionById("missing"), undefined);
    assert.strictEqual(getSectionName(""), "");
  });
});
