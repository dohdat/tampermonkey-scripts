import { themeColors } from "./theme.js";

const timeMapColorPalette = [
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

function hashSeed(value) {
  if (!value) {return 0;}
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
}

export function pickTimeMapColor(timeMaps, seed) {
  const used = new Set(
    (timeMaps || [])
      .map((tm) => (tm.color || "").toLowerCase())
      .filter(Boolean)
  );
  const available = timeMapColorPalette.filter((color) => !used.has(color.toLowerCase()));
  const palette = available.length ? available : timeMapColorPalette;
  const index = seed ? hashSeed(seed) % palette.length : Math.floor(Math.random() * palette.length);
  return palette[index] || themeColors.green500;
}
