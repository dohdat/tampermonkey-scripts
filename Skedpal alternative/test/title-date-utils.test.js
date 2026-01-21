import assert from "assert";
import { describe, it } from "mocha";

const {
  buildTitleConversionHighlightsHtml,
  buildTitleConversionPreviewHtml,
  buildTitleUpdateFromInput,
  getTitleConversionRanges,
  parseTitleDates,
  parseTitleLiteralList,
  pruneTitleLiteralList,
  serializeTitleLiteralList
} = await import("../src/ui/title-date-utils.js");

describe("title date utils", () => {
  it("parses title literals defensively", () => {
    assert.deepStrictEqual(parseTitleLiteralList("not-json"), []);
    assert.strictEqual(serializeTitleLiteralList(["a", "", null]), "[\"a\"]");
    assert.deepStrictEqual(pruneTitleLiteralList("", ["a"]), []);
    assert.deepStrictEqual(pruneTitleLiteralList("Title", null), []);
  });

  it("preserves literal tokens when parsing dates", () => {
    const parsed = parseTitleDates("Meet on Friday", {
      literals: ["Friday"],
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasDate, false);
    assert.strictEqual(parsed.title, "Meet on Friday");
  });

  it("filters conversion ranges that overlap literals", () => {
    const ranges = getTitleConversionRanges("Submit by Jan 10", {
      literals: ["by Jan 10"],
      referenceDate: new Date(2026, 0, 6)
    });
    assert.deepStrictEqual(ranges, []);
  });

  it("builds conversion preview html when matches exist", () => {
    const result = buildTitleConversionPreviewHtml("Pay rent every month", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(result.hasRanges, true);
    assert.ok(result.html.includes("data-test-skedpal"));
  });

  it("returns no highlights when there are no matches", () => {
    const result = buildTitleConversionHighlightsHtml("", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(result.hasRanges, false);
    assert.strictEqual(result.html, "");
  });

  it("saves title updates when reminders are added", () => {
    const task = {
      deadline: null,
      startFrom: null,
      repeat: null,
      reminders: []
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "Call client remind me in 2 days",
      originalTitle: "Call client",
      parsingActive: true,
      literals: [],
      maxLength: 120
    });
    assert.strictEqual(update.shouldSave, true);
    assert.strictEqual(update.nextTitle, "Call client");
    assert.ok(update.nextReminders.length > 0);
  });
});
