import { THREE } from "../../constants.js";

function clampDayInMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(lastDay, Math.max(1, day));
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

function isMonthDayAfter(start, end) {
  if (!start || !end) {return false;}
  if (start.month !== end.month) {
    return start.month > end.month;
  }
  return start.day > end.day;
}

export function resolveOccurrenceRangeStart(task, occurrenceDate) {
  const repeat = task?.repeat;
  if (!repeat) {return null;}
  if (repeat.unit === "month" && repeat.monthlyMode === "range") {
    const startDay = repeat.monthlyRangeStart || occurrenceDate.getDate();
    const safeDay = clampDayInMonth(
      occurrenceDate.getFullYear(),
      occurrenceDate.getMonth(),
      startDay
    );
    return new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), safeDay);
  }
  if (repeat.unit === "year" && repeat.yearlyRangeStartDate) {
    const startParts = parseDateParts(repeat.yearlyRangeStartDate);
    if (!startParts) {return null;}
    const endParts = parseDateParts(repeat.yearlyRangeEndDate);
    const startYear = isMonthDayAfter(startParts, endParts)
      ? occurrenceDate.getFullYear() - 1
      : occurrenceDate.getFullYear();
    const safeDay = clampDayInMonth(startYear, startParts.month - 1, startParts.day);
    return new Date(startYear, startParts.month - 1, safeDay);
  }
  return null;
}

function isValidDate(value) {
  return Boolean(value) && typeof value.getTime === "function" && !Number.isNaN(value.getTime());
}

export function isOccurrenceWithinHorizon(task, occurrenceDate, horizonEnd) {
  if (!isValidDate(occurrenceDate) || !isValidDate(horizonEnd)) {return false;}
  if (occurrenceDate <= horizonEnd) {return true;}
  const rangeStart = resolveOccurrenceRangeStart(task, occurrenceDate);
  return isValidDate(rangeStart) && rangeStart <= horizonEnd;
}
