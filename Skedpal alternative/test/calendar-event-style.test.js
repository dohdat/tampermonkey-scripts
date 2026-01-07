import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { getCalendarEventStyles } = await import("../src/ui/calendar.js");

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
});
