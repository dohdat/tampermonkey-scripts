import {
  addDays,
  endOfDay,
  getLocalDateKey,
  nthWeekdayOfMonth,
  startOfDay,
  startOfWeek
} from "./date-utils.js";
import { normalizeTask } from "./task-utils.js";
import { DAYS_PER_WEEK, DAYS_PER_YEAR, TEN, THREE, THIRTY_ONE } from "../../constants.js";
import {
  buildCompletedOccurrenceStore,
  isOccurrenceCompleted
} from "./completion-utils.js";

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
    weekStart = addDays(weekStart, DAYS_PER_WEEK * interval);
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
  const anyDays = weeklyDays.length ? weeklyDays : [anchor.getDay()];
  const occurrences = [];
  let weekStart = startOfWeek(anchor);
  let emitted = 0;
  while (weekStart <= limitDate && emitted < maxCount) {
    const candidate = buildWeeklyAnyCandidate(
      weekStart,
      anyDays,
      anchor,
      nowStart,
      limitDate,
      horizonEnd
    );
    if (candidate) {
      occurrences.push(endOfDay(candidate));
      emitted += 1;
    }
    weekStart = addDays(weekStart, DAYS_PER_WEEK * interval);
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

function isMonthDayBeforeDate(monthIndex, day, date) {
  if (monthIndex !== date.getMonth()) {
    return monthIndex < date.getMonth();
  }
  return day < date.getDate();
}

function isMonthDayAfter(start, end) {
  if (!start || !end) {return false;}
  if (start.month !== end.month) {
    return start.month > end.month;
  }
  return start.day > end.day;
}

function parseDateParts(value) {
  if (!value) {return null;}
  if (typeof value === "string") {
    const [datePart] = value.split("T");
    const parts = datePart.split("-").map((part) => Number(part));
    if (parts.length === THREE && parts.every((part) => Number.isFinite(part))) {
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

function getMonthlyRangeStartCandidate(candidate, repeat, anchor) {
  if (repeat.monthlyMode !== "range") {return null;}
  const startDay = repeat.monthlyRangeStart || anchor.getDate();
  const safeDay = clampDayInMonth(candidate.getFullYear(), candidate.getMonth(), startDay);
  return new Date(candidate.getFullYear(), candidate.getMonth(), safeDay);
}

function getYearlyRangeStartCandidate(candidateYear, rangeStartParts, wrapsYear) {
  if (!rangeStartParts) {return null;}
  const startYear = wrapsYear ? candidateYear - 1 : candidateYear;
  const safeDay = clampDayInMonth(startYear, rangeStartParts.month - 1, rangeStartParts.day);
  return new Date(startYear, rangeStartParts.month - 1, safeDay);
}

function isValidDate(value) {
  return Boolean(value) && typeof value.getTime === "function" && !Number.isNaN(value.getTime());
}

function isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd }, occurrenceStart = null) {
  if (candidate < anchor || candidate < nowStart || candidate > limitDate) {
    return false;
  }
  if (candidate <= horizonEnd) {
    return true;
  }
  return isValidDate(occurrenceStart) && occurrenceStart <= horizonEnd;
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
    const occurrenceStart = getMonthlyRangeStartCandidate(candidate, repeat, anchor);
    if (isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd }, occurrenceStart)) {
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
  const rangeStartParts = parseDateParts(repeat.yearlyRangeStartDate);
  const wrapsYear = isMonthDayAfter(rangeStartParts, rangeEndParts);
  while (cursor <= limitDate && emitted < maxCount) {
    const month = (rangeEndParts?.month || repeat.yearlyMonth || anchor.getMonth() + 1) - 1;
    const dayValue = rangeEndParts?.day || repeat.yearlyDay || anchor.getDate();
    const nextYear = isMonthDayBeforeDate(month, dayValue, cursor) ? 1 : 0;
    const candidateYear = cursor.getFullYear() + nextYear;
    const safeDay = clampDayInMonth(candidateYear, month, dayValue);
    const candidate = new Date(candidateYear, month, safeDay);
    const occurrenceStart = getYearlyRangeStartCandidate(candidateYear, rangeStartParts, wrapsYear);
    if (isWithinWindow(candidate, { anchor, nowStart, limitDate, horizonEnd }, occurrenceStart)) {
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

function normalizeAnchorDate(value, fallback) {
  if (!value) {return fallback;}
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function resolveRepeatAnchorDate(task, now) {
  const fallbackAnchor = now instanceof Date ? now : new Date();
  const anchorSource =
    normalizeAnchorDate(task.repeatAnchor, null) ||
    normalizeAnchorDate(task.startFrom, null) ||
    normalizeAnchorDate(task.deadline, null) ||
    fallbackAnchor;
  return startOfDay(anchorSource);
}

function resolveRangeLimitExtensionDays(repeat) {
  if (repeat?.unit === "month" && repeat.monthlyMode === "range") {
    return THIRTY_ONE;
  }
  if (repeat?.unit === "year" && repeat.yearlyRangeStartDate) {
    return DAYS_PER_YEAR;
  }
  return 0;
}

function resolveRepeatLimitDate(repeat, horizonEnd) {
  const extensionDays = resolveRangeLimitExtensionDays(repeat);
  const horizonLimit = extensionDays > 0 ? endOfDay(addDays(horizonEnd, extensionDays)) : horizonEnd;
  const limitDateRaw =
    repeat.end?.type === "on" && repeat.end?.date ? new Date(repeat.end.date) : horizonLimit;
  return endOfDay(limitDateRaw > horizonLimit ? horizonLimit : limitDateRaw);
}

function resolveRepeatMaxCount(repeat) {
  if (repeat.end?.type === "after" && repeat.end?.count) {
    return Math.max(0, Number(repeat.end.count));
  }
  return Number.POSITIVE_INFINITY;
}

function buildRepeatContext(task, now, horizonEnd, repeat) {
  const anchor = resolveRepeatAnchorDate(task, now);
  const limitDate = resolveRepeatLimitDate(repeat, horizonEnd);
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const maxCount = resolveRepeatMaxCount(repeat);
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

export function getUpcomingOccurrences(
  task,
  now = new Date(),
  count = TEN,
  horizonDays = DAYS_PER_YEAR
) {
  if (!task) {return [];}
  const horizonEnd = endOfDay(addDays(now, horizonDays));
  const normalized = normalizeTask(task, now, horizonEnd);
  const occurrences = buildOccurrenceDates(normalized, now, horizonEnd);
  const completedOccurrences = buildCompletedOccurrenceStore(task.completedOccurrences);
  return occurrences
    .map((date, index) => ({
      date,
      occurrenceId: buildOccurrenceId(normalized.id || normalized.taskId || task.id, date, index)
    }))
    .filter((entry) => !isOccurrenceCompleted(completedOccurrences, entry.date, normalized.repeat))
    .slice(0, count);
}

export function buildOccurrenceId(baseId, date, index) {
  const id = baseId || "";
  const isValidDate = date instanceof Date && !Number.isNaN(date.getTime());
  const key = getLocalDateKey(date) || (isValidDate ? date.toISOString() : "") || String(index);
  return id ? `${id}-${key}` : key;
}
