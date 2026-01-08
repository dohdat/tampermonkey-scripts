import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { getCalendarEventStyles } = await import("../src/ui/calendar-render.js");

describe("calendar event styles", () => {
  it("returns null when no matching timemap color", () => {
    const styles = getCalendarEventStyles({ timeMapId: "tm-1" }, new Map());
    assert.strictEqual(styles, null);
  });

  it("returns background and border colors for timemap events", () => {
    const colors = new Map([["tm-1", "#22c55e"]]);
    const styles = getCalendarEventStyles({ timeMapId: "tm-1" }, colors);
    assert.deepStrictEqual(styles, {
      backgroundColor: "#22c55e1a",
      borderColor: "#22c55e"
    });
  });

  it("assigns consistent styles for external calendar events", () => {
    const styles = getCalendarEventStyles(
      { source: "external", calendarId: "calendar-1", colorHex: "#16a34a" },
      new Map()
    );
    assert.ok(styles);
    assert.ok(String(styles.backgroundColor).includes("rgba("));
    assert.strictEqual(styles.borderColor, "#16a34a");
    assert.strictEqual(styles.color, "#16a34a");
  });
});
