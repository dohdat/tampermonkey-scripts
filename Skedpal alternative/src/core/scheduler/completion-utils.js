import { addDays, endOfDay, getLocalDateKey, startOfDay, startOfWeek } from "./date-utils.js";
import { THREE } from "../../constants.js";

const LOCAL_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_MAX_INDEX = 6;

function clampDayInMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(lastDay, Math.max(1, day));
}

function parseMonthDay(value) {
  if (!value) {return null;}
  if (typeof value === "string") {
    const [datePart] = value.split("T");
    const parts = datePart.split("-").map((part) => Number(part));
    if (parts.length === THREE && parts.every((part) => Number.isFinite(part))) {
      const [, month, day] = parts;
      return { monthIndex: month - 1, day };
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return null;}
  return { monthIndex: date.getMonth(), day: date.getDate() };
}

function isMonthDayAfter(start, end) {
  if (!start || !end) {return false;}
  if (start.monthIndex !== end.monthIndex) {
    return start.monthIndex > end.monthIndex;
  }
  return start.day > end.day;
}

function parseCompletedOccurrenceDate(value) {
  if (!value) {return null;}
  if (typeof value === "string" && LOCAL_DATE_KEY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if ([year, month, day].every((part) => Number.isFinite(part))) {
      return new Date(year, month - 1, day);
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasDefinedValue(value) {
  return value !== null && value !== undefined;
}

function getMonthlyRangeWindow(repeat, occurrenceDate) {
  if (!repeat || repeat.unit !== "month" || repeat.monthlyMode !== "range") {return null;}
  if (!occurrenceDate) {return null;}
  const year = occurrenceDate.getFullYear();
  const monthIndex = occurrenceDate.getMonth();
  const startDay = repeat.monthlyRangeStart || occurrenceDate.getDate();
  const endDay = repeat.monthlyRangeEnd || startDay;
  const start = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, startDay));
  const end = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, endDay));
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getYearlyRangeWindow(repeat, occurrenceDate) {
  if (!repeat || repeat.unit !== "year") {return null;}
  if (!hasDefinedValue(repeat.yearlyRangeStartDate) || !hasDefinedValue(repeat.yearlyRangeEndDate)) {
    return null;
  }
  if (!occurrenceDate) {return null;}
  const startParts = parseMonthDay(repeat.yearlyRangeStartDate);
  const endParts = parseMonthDay(repeat.yearlyRangeEndDate);
  if (!startParts || !endParts) {return null;}
  const wrapsYear = isMonthDayAfter(startParts, endParts);
  const endYear = occurrenceDate.getFullYear();
  const startYear = wrapsYear ? endYear - 1 : endYear;
  const startDay = clampDayInMonth(startYear, startParts.monthIndex, startParts.day);
  const endDay = clampDayInMonth(endYear, endParts.monthIndex, endParts.day);
  const start = new Date(startYear, startParts.monthIndex, startDay);
  const end = new Date(endYear, endParts.monthIndex, endDay);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getWeeklyAnyWindow(repeat, occurrenceDate) {
  if (!repeat || repeat.unit !== "week" || repeat.weeklyMode !== "any") {return null;}
  if (!occurrenceDate) {return null;}
  const days = Array.isArray(repeat.weeklyDays)
    ? repeat.weeklyDays
      .map((day) => Number(day))
      .filter((day) => Number.isFinite(day) && day >= 0 && day <= WEEKDAY_MAX_INDEX)
    : [];
  const uniqueDays = Array.from(new Set(days)).sort((a, b) => a - b);
  const activeDays = uniqueDays.length ? uniqueDays : [occurrenceDate.getDay()];
  const weekStart = startOfWeek(occurrenceDate);
  const start = addDays(weekStart, activeDays[0]);
  const end = addDays(weekStart, activeDays[activeDays.length - 1]);
  return { start: startOfDay(start), end: endOfDay(end) };
}

export function buildCompletedOccurrenceStore(values) {
  const set = new Set();
  const dates = [];
  (values || []).forEach((value) => {
    if (!value) {return;}
    if (typeof value === "string" && value.trim()) {
      set.add(value);
    }
    const date = parseCompletedOccurrenceDate(value);
    if (!date) {return;}
    dates.push(date);
    set.add(date.toISOString());
    const localKey = getLocalDateKey(date);
    if (localKey) {set.add(localKey);}
  });
  return { set, dates };
}

export function isOccurrenceCompleted(store, occurrenceDate, repeat) {
  if (!store?.set || !occurrenceDate) {return false;}
  if (Number.isNaN(occurrenceDate.getTime())) {return false;}
  if (
    store.set.has(occurrenceDate.toISOString()) ||
    store.set.has(getLocalDateKey(occurrenceDate))
  ) {
    return true;
  }
  if (!store.dates?.length) {return false;}
  const window =
    getWeeklyAnyWindow(repeat, occurrenceDate) ||
    getMonthlyRangeWindow(repeat, occurrenceDate) ||
    getYearlyRangeWindow(repeat, occurrenceDate);
  if (!window) {return false;}
  return store.dates.some((date) => date >= window.start && date <= window.end);
}
