import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};

const { getCalendarEventStyles } = await import("../src/ui/calendar-render.js");
const { state } = await import("../src/ui/state/page-state.js");
const { themeColors } = await import("../src/ui/theme.js");

describe("calendar event styles", () => {
  it("returns null when no matching timemap color", () => {
    const previousMode = state.settingsCache.taskBackgroundMode;
    state.settingsCache.taskBackgroundMode = "timemap";
    const styles = getCalendarEventStyles({ timeMapId: "tm-1" }, new Map());
    state.settingsCache.taskBackgroundMode = previousMode;
    assert.strictEqual(styles, null);
  });

  it("returns background and colors for timemap events", () => {
    const previousMode = state.settingsCache.taskBackgroundMode;
    state.settingsCache.taskBackgroundMode = "timemap";
    const colors = new Map([["tm-1", "#22c55e"]]);
    const styles = getCalendarEventStyles({ timeMapId: "tm-1" }, colors);
    state.settingsCache.taskBackgroundMode = previousMode;
    assert.deepStrictEqual(styles, {
      backgroundColor: "#22c55e1a",
      borderColor: "#22c55e"
    });
  });

  it("uses priority colors when the background mode is priority", () => {
    const previousMode = state.settingsCache.taskBackgroundMode;
    state.settingsCache.taskBackgroundMode = "priority";
    const styles = getCalendarEventStyles({ priority: 4 }, new Map());
    state.settingsCache.taskBackgroundMode = previousMode;
    assert.deepStrictEqual(styles, {
      backgroundColor: `${themeColors.amber400}1a`,
      borderColor: themeColors.amber400
    });
  });

  it("uses slate background when the background mode is none", () => {
    const previousMode = state.settingsCache.taskBackgroundMode;
    state.settingsCache.taskBackgroundMode = "none";
    const styles = getCalendarEventStyles({ timeMapId: "tm-1" }, new Map());
    state.settingsCache.taskBackgroundMode = previousMode;
    assert.deepStrictEqual(styles, {
      backgroundColor: `${themeColors.slate400}1a`,
      borderColor: themeColors.slate400
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
