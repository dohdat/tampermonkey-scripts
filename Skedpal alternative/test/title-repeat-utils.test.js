import assert from "assert";
import { describe, it } from "mocha";

const {
  cleanupParsedTitle,
  formatLocalDateInputValue,
  parseTitleRepeat
} = await import("../src/ui/title-repeat-utils.js");

describe("title repeat utils", () => {
  it("formats local date inputs defensively", () => {
    assert.strictEqual(formatLocalDateInputValue(null), "");
    assert.strictEqual(formatLocalDateInputValue(new Date("invalid")), "");
  });

  it("cleans up parsed titles with keywords and punctuation", () => {
    const cleaned = cleanupParsedTitle("  ,,, by finish report !!! ");
    assert.strictEqual(cleaned, "finish report !!!");
  });

  it("parses weekday lists with a week interval", () => {
    const parsed = parseTitleRepeat(
      "Plan every Mon and Wed every other weeks",
      new Date(2026, 0, 6)
    );
    assert.strictEqual(parsed.hasRepeat, true);
    assert.strictEqual(parsed.repeat.unit, "week");
    assert.strictEqual(parsed.repeat.interval, 2);
    assert.deepStrictEqual(parsed.repeat.weeklyDays.sort(), [1, 3]);
  });

  it("parses weekday groups with intervals", () => {
    const parsed = parseTitleRepeat("Review every 2 weekdays", new Date(2026, 0, 6));
    assert.strictEqual(parsed.hasRepeat, true);
    assert.strictEqual(parsed.repeat.interval, 2);
    assert.deepStrictEqual(parsed.repeat.weeklyDays, [1, 2, 3, 4, 5]);
  });

  it("parses interval repeats with explicit weekdays", () => {
    const parsed = parseTitleRepeat(
      "Repeat every 3 weeks on mon and fri",
      new Date(2026, 0, 6)
    );
    assert.strictEqual(parsed.hasRepeat, true);
    assert.strictEqual(parsed.repeat.unit, "week");
    assert.strictEqual(parsed.repeat.interval, 3);
    assert.deepStrictEqual(parsed.repeat.weeklyDays.sort(), [1, 5]);
  });

  it("parses interval repeats that apply to all days", () => {
    const parsed = parseTitleRepeat("Repeat every 2 weeks every day", new Date(2026, 0, 6));
    assert.strictEqual(parsed.hasRepeat, true);
    assert.deepStrictEqual(parsed.repeat.weeklyDays, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("parses monthly ranges between days", () => {
    const parsed = parseTitleRepeat(
      "Repeat monthly between 5th and 20th",
      new Date(2026, 0, 6)
    );
    assert.strictEqual(parsed.hasRepeat, true);
    assert.strictEqual(parsed.repeat.monthlyMode, "range");
    assert.strictEqual(parsed.repeat.monthlyRangeStart, 5);
    assert.strictEqual(parsed.repeat.monthlyRangeEnd, 20);
  });

  it("parses yearly ranges between dates", () => {
    const parsed = parseTitleRepeat(
      "Repeat yearly between Jan 1 and Feb 2",
      new Date(2026, 0, 6)
    );
    assert.strictEqual(parsed.hasRepeat, true);
    assert.ok(parsed.repeat.yearlyRangeStartDate);
    assert.ok(parsed.repeat.yearlyRangeEndDate);
  });

  it("parses simple daily repeats", () => {
    const parsed = parseTitleRepeat("repeat daily", new Date(2026, 0, 6));
    assert.strictEqual(parsed.hasRepeat, true);
    assert.strictEqual(parsed.repeat.unit, "day");
  });
});
