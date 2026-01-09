import assert from "assert";
import { describe, it } from "mocha";

import { themeColors } from "../src/ui/theme.js";
import { pickTimeMapColor } from "../src/ui/time-map-colors.js";

describe("time map colors", () => {
  it("prefers unused palette colors with a deterministic seed", () => {
    const timeMaps = [{ color: themeColors.green500 }, { color: themeColors.lime400 }];
    const selected = pickTimeMapColor(timeMaps, "alpha");

    assert.notStrictEqual(selected, themeColors.green500);
    assert.notStrictEqual(selected, themeColors.lime400);
  });

  it("falls back to the full palette when all colors are used", () => {
    const timeMaps = Object.values(themeColors).map((color) => ({ color }));
    const selected = pickTimeMapColor(timeMaps, "beta");

    assert.ok(typeof selected === "string");
    assert.ok(selected.length > 0);
  });

  it("uses the default fallback when random index is out of range", () => {
    const originalRandom = Math.random;
    Math.random = () => 1;
    const selected = pickTimeMapColor([], "");
    Math.random = originalRandom;

    assert.strictEqual(selected, themeColors.green500);
  });
});
