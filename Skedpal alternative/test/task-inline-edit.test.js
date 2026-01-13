import assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";

describe("inline edit parsing guard", () => {
  const originalDocument = global.document;

  beforeEach(() => {
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it("skips parsing when parsing is inactive", async () => {
    const { buildTitleUpdateFromInput } = await import(
      "../src/ui/title-date-utils.js"
    );
    const task = {
      title: "Setup weekly",
      deadline: null,
      startFrom: null,
      repeat: { type: "none" }
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "Setup weekly",
      originalTitle: "Setup weekly",
      parsingActive: false,
      literals: [],
      maxLength: 200
    });
    assert.strictEqual(update.shouldSave, false);
    assert.strictEqual(update.nextTitle, "Setup weekly");
    assert.strictEqual(update.nextRepeat, task.repeat);
  });

  it("parses when parsing is active", async () => {
    const { buildTitleUpdateFromInput } = await import(
      "../src/ui/title-date-utils.js"
    );
    const task = {
      title: "Setup weekly",
      deadline: null,
      startFrom: null,
      repeat: { type: "none" }
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "Setup weekly",
      originalTitle: "Setup weekly",
      parsingActive: true,
      literals: [],
      maxLength: 200
    });
    assert.strictEqual(update.shouldSave, true);
    assert.strictEqual(update.nextTitle, "Setup");
  });
});
