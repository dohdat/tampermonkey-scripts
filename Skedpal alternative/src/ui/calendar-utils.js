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
  let start = getWeekStartSunday(anchor);
  let days = 7;
  if (viewMode === "day") {
    start = startOfDay(anchor);
    days = 1;
  } else if (viewMode === "three") {
    start = startOfDay(anchor);
    days = 3;
  }
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
  if (viewMode === "three") {
    const { start } = getCalendarRange(anchor, "three");
    const end = addDays(start, 2);
    const startLabel = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
    const endLabel = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    return `${startLabel} - ${endLabel}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getDayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {return "";}
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date, days) {
  return addDays(date, days);
}

export function getMinutesIntoDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function getDateFromDayKey(dayKey) {
  if (typeof dayKey !== "string") {return null;}
  const [year, month, day] = dayKey.split("-").map((value) => Number(value));
  if (!year || !month || !day) {return null;}
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {return null;}
  date.setHours(0, 0, 0, 0);
  return date;
}

export function roundMinutesToStep(minutes, step = 15) {
  if (!Number.isFinite(minutes)) {return 0;}
  const safeStep = Number.isFinite(step) && step > 0 ? step : 15;
  return Math.round(minutes / safeStep) * safeStep;
}

export function clampMinutes(minutes, min, max) {
  if (!Number.isFinite(minutes)) {return min;}
  if (!Number.isFinite(min)) {return minutes;}
  if (!Number.isFinite(max)) {return minutes;}
  return Math.min(Math.max(minutes, min), max);
}
