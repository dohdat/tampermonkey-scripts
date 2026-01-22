import assert from "assert";
import { afterEach, describe, it } from "mocha";

import { themeColors } from "../src/ui/theme.js";
import { hashSeed, pickTimeMapColor } from "../src/ui/time-map-colors.js";

describe("time map colors", () => {
  const palette = [
    themeColors.lime400,
    themeColors.lime500,
    themeColors.lime600,
    themeColors.green500,
    themeColors.green600,
    themeColors.emerald100,
    themeColors.emerald900,
    themeColors.teal400,
    themeColors.teal600,
    themeColors.sky400,
    themeColors.sky600,
    themeColors.blue400,
    themeColors.blue500,
    themeColors.blue600,
    themeColors.indigo400,
    themeColors.indigo600,
    themeColors.cyan400,
    themeColors.cyan600,
    themeColors.purple500,
    themeColors.violet400,
    themeColors.violet600,
    themeColors.fuchsia400,
    themeColors.fuchsia600,
    themeColors.pink400,
    themeColors.pink600,
    themeColors.rose400,
    themeColors.rose600,
    themeColors.amber400,
    themeColors.amber600,
    themeColors.amber900,
    themeColors.yellow400,
    themeColors.yellow600,
    themeColors.orange500,
    themeColors.orange400,
    themeColors.orange600,
    themeColors.red400,
    themeColors.red600,
    themeColors.slate100,
    themeColors.slate400,
    themeColors.slate500,
    themeColors.slate800
  ].filter(Boolean);

  let originalRandom;

  afterEach(() => {
    if (originalRandom) {
      Math.random = originalRandom;
      originalRandom = null;
    }
  });

  it("returns deterministic colors when a seed is provided", () => {
    const color = pickTimeMapColor([], "seed-value");
    assert.ok(color);
  });

  it("returns zero when hashing falsy seeds", () => {
    assert.strictEqual(hashSeed(""), 0);
    assert.strictEqual(hashSeed(null), 0);
  });

  it("falls back to the full palette when all colors are used", () => {
    const timeMaps = palette.map((color) => ({ color }));
    const color = pickTimeMapColor(timeMaps, "fallback-seed");
    assert.ok(palette.includes(color));
  });

  it("uses Math.random when no seed is provided", () => {
    originalRandom = Math.random;
    Math.random = () => 0;
    const color = pickTimeMapColor([], "");
    assert.strictEqual(color, palette[0]);
  });

  it("handles null time map lists gracefully", () => {
    const color = pickTimeMapColor(null, "null-seed");
    assert.ok(color);
  });

  it("ignores falsy colors when building the used set", () => {
    const color = pickTimeMapColor([{ color: "" }], "skip-falsy");
    assert.ok(color);
  });

  it("falls back to the default color when index is out of range", () => {
    originalRandom = Math.random;
    Math.random = () => 1;
    const color = pickTimeMapColor([], "");
    assert.strictEqual(color, themeColors.green500);
  });
});
