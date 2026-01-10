import {
  DAYS_PER_WEEK,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  INDEX_NOT_FOUND
} from "../../constants.js";

export function parseTime(timeString) {
  const [hours, minutes] = timeString.split(":").map((part) => parseInt(part, 10));
  return { hours, minutes };
}

export function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function normalizeDeadline(value, fallback) {
  if (!value) {return endOfDay(fallback);}
  const date = new Date(value);
  if (Number.isNaN(date)) {return endOfDay(fallback);}
  const atMidnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  return atMidnight ? endOfDay(date) : date;
}

export function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  if (nth === INDEX_NOT_FOUND) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    last.setDate(last.getDate() - diff);
    return last;
  }
  const offset = (weekday - firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const day = 1 + offset + (nth - 1) * DAYS_PER_WEEK;
  return new Date(year, month, day);
}
