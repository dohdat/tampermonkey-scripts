import { formatDate, getWeekdayShortLabel } from "./utils.js";

export function resolveWeeklyDays(repeat, fallback) {
  if (Array.isArray(repeat.weeklyDays)) {return repeat.weeklyDays;}
  if (Array.isArray(repeat.byWeekdays)) {return repeat.byWeekdays;}
  return fallback;
}

export function buildRepeatFrequencyPart(unit, interval) {
  return `Every ${interval} ${unit}${interval > 1 ? "s" : ""}`;
}

export function buildWeeklySummaryPart(repeat, unit, fallbackDays) {
  if (unit !== "week") {return "";}
  const weeklyDays = resolveWeeklyDays(repeat, fallbackDays);
  if (!weeklyDays.length) {return "";}
  const labels = weeklyDays.map((d) => getWeekdayShortLabel(d)).filter(Boolean);
  return labels.length ? `on ${labels.join(", ")}` : "";
}

export function buildYearlySummaryPart(repeat, unit) {
  if (unit !== "year") {return "";}
  if (repeat.yearlyRangeStartDate && repeat.yearlyRangeEndDate) {
    return `between ${formatDate(repeat.yearlyRangeStartDate)} and ${formatDate(repeat.yearlyRangeEndDate)}`;
  }
  return `on ${repeat.yearlyMonth || ""}/${repeat.yearlyDay || ""}`;
}

export function buildRepeatEndPart(end) {
  if (end.type === "on" && end.date) {
    return `until ${formatDate(end.date)}`;
  }
  if (end.type === "after" && end.count) {
    return `for ${end.count} time${end.count > 1 ? "s" : ""}`;
  }
  return "";
}
