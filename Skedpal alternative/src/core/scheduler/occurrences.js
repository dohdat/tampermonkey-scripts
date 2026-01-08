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
    return Array.from(new Set(repeat.weeklyDays.map((d) => Number(d)))).sort((a, b) => a - b);
  }
  return [anchor.getDay()];
}

function buildWeeklyAnyCandidate(weekStart, weeklyDays, anchor, nowStart, limitDate, horizonEnd) {
  for (const day of weeklyDays) {
    const candidate = addDays(weekStart, day);
    if (candidate < anchor || candidate < nowStart) {continue;}
    if (candidate > limitDate || candidate > horizonEnd) {continue;}
    return candidate;
  }
  return null;
}

function buildWeeklyAllOccurrences({
  anchor,
  interval,
  limitDate,
  maxCount,
  nowStart,
  horizonEnd,
  weeklyDays
}) {
  const occurrences = [];
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

function buildWeeklyAnyOccurrences({
  anchor,
  interval,
  limitDate,
  maxCount,
  nowStart,
  horizonEnd,
  weeklyDays
}) {
  const occurrences = [];
  let weekStart = startOfWeek(anchor);
  let emitted = 0;
  while (weekStart <= limitDate && emitted < maxCount) {
    const candidate = buildWeeklyAnyCandidate(
      weekStart,
      weeklyDays,
      anchor,
      nowStart,
      limitDate,
      horizonEnd
    );
    if (candidate) {
      occurrences.push(endOfDay(candidate));
      emitted += 1;
    }
    weekStart = addDays(weekStart, 7 * interval);
  }
  return occurrences;
}

function buildWeeklyOccurrences({ anchor, interval, limitDate, maxCount, nowStart, horizonEnd, repeat }) {
  const weeklyDays = getWeeklyDays(repeat, anchor);
  if (repeat.weeklyMode === "any") {
    return buildWeeklyAnyOccurrences({
      anchor,
      interval,
      limitDate,
      maxCount,
      nowStart,
      horizonEnd,
      weeklyDays
    });
  }
  return buildWeeklyAllOccurrences({
    anchor,
    interval,
    limitDate,
    maxCount,
    nowStart,
    horizonEnd,
    weeklyDays
  });
}

function clampDayInMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(lastDay, Math.max(1, day));
}

function parseDateParts(value) {
  if (!value) {return null;}
  if (typeof value === "string") {
    const [datePart] = value.split("T");
    const parts = datePart.split("-").map((part) => Number(part));
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      const [, month, day] = parts;
      return { month, day };
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return null;}
  return { month: date.getMonth() + 1, day: date.getDate() };
}

function getYearlyRangeEndParts(repeat) {
  return parseDateParts(repeat.yearlyRangeEndDate);
}

function getMonthlyCandidate(cursor, anchor, repeat) {
  if (repeat.monthlyMode === "nth") {
    const weekday = repeat.monthlyWeekday ?? anchor.getDay();
    const nth = repeat.monthlyNth ?? 1;
    return nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), weekday, nth);
  }
  if (repeat.monthlyMode === "range") {
    const endDay = repeat.monthlyRangeEnd || anchor.getDate();
    const safeDay = clampDayInMonth(cursor.getFullYear(), cursor.getMonth(), endDay);
    return new Date(cursor.getFullYear(), cursor.getMonth(), safeDay);
  }
  const day = repeat.monthlyDay || anchor.getDate();
  const safeDay = clampDayInMonth(cursor.getFullYear(), cursor.getMonth(), day);
  return new Date(cursor.getFullYear(), cursor.getMonth(), safeDay);
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
  const rangeEndParts = getYearlyRangeEndParts(repeat);
  while (cursor <= limitDate && emitted < maxCount) {
    const month = (rangeEndParts?.month || repeat.yearlyMonth || anchor.getMonth() + 1) - 1;
    const dayValue = rangeEndParts?.day || repeat.yearlyDay || anchor.getDate();
    const safeDay = clampDayInMonth(cursor.getFullYear(), month, dayValue);
    const candidate = new Date(cursor.getFullYear(), month, safeDay);
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
