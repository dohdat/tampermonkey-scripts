import assert from "assert";
import { describe, it } from "mocha";

const {
  buildTitleConversionHighlightsHtml,
  buildTitleConversionPreviewHtml,
  buildTitleUpdateFromInput,
  getTitleConversionRanges,
  parseTitleDates,
  parseTitleLiteralList,
  resolveMergedDateRange,
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

  it("collects conversion ranges from titles", () => {
    const ranges = getTitleConversionRanges("Submit by Jan 10", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.ok(ranges.length > 0);
  });

  it("collects conversion ranges for reminder phrases", () => {
    const ranges = getTitleConversionRanges("Email report remind me in 2 days", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.ok(ranges.length > 0);
  });

  it("includes between ranges for repeat phrases", () => {
    const ranges = getTitleConversionRanges("Repeat monthly between 5 and 10", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.ok(ranges.length > 0);
  });

  it("builds conversion preview html when matches exist", () => {
    const result = buildTitleConversionPreviewHtml("Pay rent every month", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(result.hasRanges, true);
    assert.ok(result.html.includes("data-test-skedpal"));
  });

  it("renders preview html with trailing text", () => {
    const result = buildTitleConversionPreviewHtml("Pay rent every month please", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(result.hasRanges, true);
    assert.ok(result.html.includes("please"));
  });

  it("builds conversion highlight html when matches exist", () => {
    const result = buildTitleConversionHighlightsHtml("Pay rent every month", {
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

  it("parses dates from titles with chrono matches", () => {
    const parsed = parseTitleDates("Call mom tomorrow", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasDate, true);
    assert.strictEqual(parsed.startFrom, null);
    assert.ok(parsed.deadline);
    assert.ok(parsed.title.includes("Call mom"));
  });

  it("parses start-from intent when keywords are present", () => {
    const parsed = parseTitleDates("Start project from Jan 10", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.startFrom !== null, true);
    assert.strictEqual(parsed.deadline, null);
  });

  it("parses reminders from titles", () => {
    const parsed = parseTitleDates("Email report remind me in 2 days", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasReminder, true);
    assert.deepStrictEqual(parsed.reminderDays, [2]);
  });

  it("returns safe values for empty titles", () => {
    const parsed = parseTitleDates("", { referenceDate: new Date(2026, 0, 6) });
    assert.strictEqual(parsed.hasDate, false);
    assert.strictEqual(parsed.title, "");
  });

  it("handles non-string titles and empty conversion previews", () => {
    assert.deepStrictEqual(getTitleConversionRanges(null), []);
    const preview = buildTitleConversionPreviewHtml("Just text", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(preview.hasRanges, false);
    assert.strictEqual(preview.html, "");
    const highlights = buildTitleConversionHighlightsHtml(123, {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(highlights.hasRanges, false);
    assert.strictEqual(highlights.html, "");
  });

  it("preserves literal tokens and skips missing literal entries", () => {
    const parsed = parseTitleDates("Meet on Friday", {
      literals: ["Friday", "Missing", ""],
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasDate, false);
    assert.strictEqual(parsed.title, "Meet on Friday");
  });

  it("parses chrono reminders from titles", () => {
    const parsed = parseTitleDates("Remind me tomorrow about billing", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasReminder, true);
    assert.deepStrictEqual(parsed.reminderDays, [1]);
  });

  it("parses a start and deadline range", () => {
    const parsed = parseTitleDates("Project from Jan 10 to Jan 12", {
      referenceDate: new Date(2026, 0, 6)
    });
    assert.strictEqual(parsed.hasDate, true);
    assert.ok(parsed.startFrom);
    assert.ok(parsed.deadline);
  });

  it("uses fallback titles when parsing strips everything", () => {
    const task = {
      deadline: null,
      startFrom: null,
      repeat: null,
      reminders: [2]
    };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "by Jan 10",
      originalTitle: "Old title",
      parsingActive: true,
      literals: [],
      maxLength: 120
    });
    assert.strictEqual(update.nextTitle, "by Jan 10");
    assert.deepStrictEqual(update.nextReminders, [2]);
  });

  it("parses literal lists from json arrays", () => {
    assert.deepStrictEqual(parseTitleLiteralList("[\"a\",\"\",null]"), ["a"]);
    assert.deepStrictEqual(parseTitleLiteralList("1"), []);
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

  it("returns a non-parsed update when parsing is disabled", () => {
    const task = { deadline: null, startFrom: null, repeat: null, reminders: [] };
    const update = buildTitleUpdateFromInput({
      task,
      inputValue: "New title",
      originalTitle: "Old title",
      parsingActive: false,
      literals: [],
      maxLength: 120
    });
    assert.strictEqual(update.shouldSave, true);
    assert.strictEqual(update.nextTitle, "New title");
  });

  it("resolves merged date ranges with source precedence", () => {
    const base = {
      startFrom: "2026-01-10T00:00:00.000Z",
      deadline: "2026-01-05T00:00:00.000Z"
    };
    const parsedStart = resolveMergedDateRange({
      ...base,
      startFromSource: "parsed",
      deadlineSource: "existing"
    });
    assert.ok(parsedStart.deadline === null || parsedStart.deadline === base.deadline);
    const parsedDeadline = resolveMergedDateRange({
      ...base,
      startFromSource: "existing",
      deadlineSource: "parsed"
    });
    assert.strictEqual(parsedDeadline.startFrom, null);
    const bothParsed = resolveMergedDateRange({
      ...base,
      startFromSource: "parsed",
      deadlineSource: "parsed"
    });
    assert.strictEqual(bothParsed.startFrom, null);
    assert.strictEqual(bothParsed.deadline, base.deadline);
  });
});
