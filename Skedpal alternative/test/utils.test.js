import assert from "assert";
import { describe, it } from "mocha";

const { parseLocalDateInput, isStartAfterDeadline } = await import("../src/ui/utils.js");

describe("utils date parsing", () => {
  it("parses date input as local midnight ISO", () => {
    const iso = parseLocalDateInput("2026-01-07");
    assert.ok(iso);
    const parsed = new Date(iso);
    assert.strictEqual(parsed.getFullYear(), 2026);
    assert.strictEqual(parsed.getMonth(), 0);
    assert.strictEqual(parsed.getDate(), 7);
    assert.strictEqual(parsed.getHours(), 0);
  });

  it("returns null for invalid input", () => {
    assert.strictEqual(parseLocalDateInput(""), null);
    assert.strictEqual(parseLocalDateInput("2026-13-99"), null);
  });

  it("detects start after deadline", () => {
    assert.strictEqual(isStartAfterDeadline("2026-01-08", "2026-01-07"), true);
    assert.strictEqual(isStartAfterDeadline("2026-01-07", "2026-01-07"), false);
    assert.strictEqual(isStartAfterDeadline("", "2026-01-07"), false);
  });
});
