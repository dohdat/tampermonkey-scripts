function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeekStartSunday(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function clampDate(value) {
  const d = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function getCalendarRange(anchorDate, viewMode) {
  const anchor = clampDate(anchorDate);
  const start =
    viewMode === "day" ? startOfDay(anchor) : getWeekStartSunday(anchor);
  const days = viewMode === "day" ? 1 : 7;
  const end = addDays(start, days);
  return { start, end, days };
}

export function getCalendarTitle(anchorDate, viewMode) {
  const anchor = clampDate(anchorDate);
  if (viewMode === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getDayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date, days) {
  return addDays(date, days);
}
