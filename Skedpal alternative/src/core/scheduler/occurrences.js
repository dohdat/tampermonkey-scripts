import { addDays, endOfDay, nthWeekdayOfMonth, startOfDay, startOfWeek } from "./date-utils.js";
import { normalizeTask } from "./task-utils.js";

function buildNonRepeatOccurrences(task, now, horizonEnd) {
  if (task.deadline >= now && task.deadline <= horizonEnd) {
    return [task.deadline];
  }
  if (!task.deadline || Number.isNaN(task.deadline)) {
    return [horizonEnd];
  }
  return [];
}

function buildDailyOccurrences({ anchor, interval, limitDate, maxCount, nowStart, horizonEnd }) {
  const occurrences = [];
  for (
    let cursor = new Date(anchor), count = 0;
    cursor <= limitDate && count < maxCount;
    cursor = addDays(cursor, interval), count += 1
  ) {
    if (cursor < nowStart) {continue;}
    if (cursor > horizonEnd) {break;}
    occurrences.push(endOfDay(cursor));
  }
  return occurrences;
}

function getWeeklyDays(repeat, anchor) {
  if (Array.isArray(repeat.weeklyDays) && repeat.weeklyDays.length > 0) {
    return repeat.weeklyDays.map((d) => Number(d));
  }
  return [anchor.getDay()];
}

function buildWeeklyOccurrences({ anchor, interval, limitDate, maxCount, nowStart, horizonEnd, repeat }) {
  const occurrences = [];
  const weeklyDays = getWeeklyDays(repeat, anchor);
  let weekStart = startOfWeek(anchor);
  let emitted = 0;
  while (weekStart <= limitDate && emitted < maxCount) {
    for (const day of weeklyDays) {
      const candidate = addDays(weekStart, day);
      if (candidate < anchor || candidate < nowStart) {continue;}
      if (candidate > limitDate || candidate > horizonEnd) {continue;}
      occurrences.push(endOfDay(candidate));
      emitted += 1;
      if (emitted >= maxCount) {break;}
    }
    weekStart = addDays(weekStart, 7 * interval);
  }
  return occurrences;
}

function getMonthlyCandidate(cursor, anchor, repeat) {
  if (repeat.monthlyMode === "nth") {
    const weekday = repeat.monthlyWeekday ?? anchor.getDay();
    const nth = repeat.monthlyNth ?? 1;
    return nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), weekday, nth);
  }
  const day = repeat.monthlyDay || anchor.getDate();
  return new Date(cursor.getFullYear(), cursor.getMonth(), day);
}

function isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd }) {
  return (
    candidate >= anchor &&
    candidate >= nowStart &&
    candidate <= limitDate &&
    candidate <= horizonEnd
  );
}

function buildMonthlyOccurrences({
  anchor,
  interval,
  limitDate,
  maxCount,
  nowStart,
  horizonEnd,
  repeat
}) {
  const occurrences = [];
  let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  let emitted = 0;
  while (cursor <= limitDate && emitted < maxCount) {
    const candidate = getMonthlyCandidate(cursor, anchor, repeat);
    if (isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd })) {
      occurrences.push(endOfDay(candidate));
      emitted += 1;
    }
    cursor.setMonth(cursor.getMonth() + interval);
  }
  return occurrences;
}

function buildYearlyOccurrences({
  anchor,
  interval,
  limitDate,
  maxCount,
  nowStart,
  horizonEnd,
  repeat
}) {
  const occurrences = [];
  let cursor = new Date(anchor);
  let emitted = 0;
  while (cursor <= limitDate && emitted < maxCount) {
    const month = (repeat.yearlyMonth || anchor.getMonth() + 1) - 1;
    const day = repeat.yearlyDay || anchor.getDate();
    const candidate = new Date(cursor.getFullYear(), month, day);
    if (isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd })) {
      occurrences.push(endOfDay(candidate));
      emitted += 1;
    }
    cursor.setFullYear(cursor.getFullYear() + interval);
  }
  return occurrences;
}

function isNonRepeating(repeat) {
  return !repeat || repeat.type === "none" || repeat.unit === "none";
}

function buildRepeatContext(task, now, horizonEnd, repeat) {
  const anchor = startOfDay(task.startFrom || task.deadline || now);
  const limitDateRaw =
    repeat.end?.type === "on" && repeat.end?.date ? new Date(repeat.end.date) : horizonEnd;
  const limitDate = endOfDay(limitDateRaw > horizonEnd ? horizonEnd : limitDateRaw);
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const maxCount =
    repeat.end?.type === "after" && repeat.end?.count
      ? Math.max(0, Number(repeat.end.count))
      : Number.POSITIVE_INFINITY;
  const nowStart = startOfDay(now);
  return { anchor, interval, limitDate, maxCount, nowStart, horizonEnd, repeat };
}

function resolveRepeatHandler(unit) {
  const handlers = {
    day: buildDailyOccurrences,
    week: buildWeeklyOccurrences,
    month: buildMonthlyOccurrences,
    year: buildYearlyOccurrences
  };
  return handlers[unit] || null;
}

export function buildOccurrenceDates(task, now, horizonEnd) {
  const repeat = task.repeat || { type: "none" };
  if (isNonRepeating(repeat)) {
    return buildNonRepeatOccurrences(task, now, horizonEnd);
  }
  const context = buildRepeatContext(task, now, horizonEnd, repeat);
  const handler = resolveRepeatHandler(repeat.unit);
  return handler ? handler(context) : [];
}

export function getUpcomingOccurrences(task, now = new Date(), count = 10, horizonDays = 365) {
  if (!task) {return [];}
  const horizonEnd = endOfDay(addDays(now, horizonDays));
  const normalized = normalizeTask(task, now, horizonEnd);
  const occurrences = buildOccurrenceDates(normalized, now, horizonEnd);
  const completedOccurrences = new Set(
    (task.completedOccurrences || []).map((value) => {
      const date = new Date(value);
      return Number.isNaN(date) ? String(value) : date.toISOString();
    })
  );
  return occurrences
    .map((date, index) => ({
      date,
      occurrenceId: `${normalized.id || normalized.taskId || task.id}-occ-${index}`
    }))
    .filter((entry) => !completedOccurrences.has(entry.date.toISOString()))
    .slice(0, count);
}
