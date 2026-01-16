import {
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  TWO
} from "./constants.js";
import { getExternalEventsForRange } from "./calendar-external.js";

export function parseTimeToMinutes(value) {
  if (!value || typeof value !== "string") {return 0;}
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length !== TWO || parts.some((part) => !Number.isFinite(part))) {return 0;}
  const [hours, minutes] = parts;
  return Math.max(
    0,
    Math.min(HOURS_PER_DAY * MINUTES_PER_HOUR, hours * MINUTES_PER_HOUR + minutes)
  );
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

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function buildTimeMapRulesByDay(timeMap) {
  const rules = Array.isArray(timeMap?.rules) ? timeMap.rules : [];
  return rules.reduce((map, rule) => {
    const day = Number(rule.day);
    if (!Number.isFinite(day)) {return map;}
    if (!map.has(day)) {map.set(day, []);}
    map.get(day).push(rule);
    return map;
  }, new Map());
}

function clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {return null;}
  const clampedStart = startMs < horizonStartMs ? horizonStartMs : startMs;
  const clampedEnd = endMs > horizonEndMs ? horizonEndMs : endMs;
  if (clampedEnd <= clampedStart) {return null;}
  return { startMs: clampedStart, endMs: clampedEnd };
}

function getDayStartMs(valueMs) {
  const date = new Date(valueMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addInterval(map, key, startMs, endMs) {
  if (!map.has(key)) {map.set(key, []);}
  map.get(key).push([startMs, endMs]);
}

function buildAvailabilityIntervals(timeMaps, horizonStart, horizonEnd) {
  const intervals = [];
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  for (let cursor = startOfDay(horizonStart); cursor <= horizonEnd; cursor = addDays(cursor, 1)) {
    const dayStartMs = cursor.getTime();
    const dayOfWeek = cursor.getDay();
    (timeMaps || []).forEach((timeMap) => {
      const rulesByDay = buildTimeMapRulesByDay(timeMap);
      const dayRules = rulesByDay.get(dayOfWeek);
      if (!dayRules) {return;}
      dayRules.forEach((rule) => {
        const startMinutes = parseTimeToMinutes(rule.startTime);
        const endMinutes = parseTimeToMinutes(rule.endTime);
        if (endMinutes <= startMinutes) {return;}
        const startMs = dayStartMs + startMinutes * MS_PER_MINUTE;
        const endMs = dayStartMs + endMinutes * MS_PER_MINUTE;
        const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
        if (!clamped) {return;}
        intervals.push([clamped.startMs, clamped.endMs]);
      });
    });
  }
  return intervals;
}

export function getUniqueAvailabilityMinutes(timeMaps, horizonStart, horizonEnd) {
  const intervals = buildAvailabilityIntervals(timeMaps, horizonStart, horizonEnd);
  return sumIntervalsMinutes(intervals);
}

export function buildScheduledIntervalsByTimeMap(tasks, horizonStart, horizonEnd) {
  const usage = new Map();
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  (tasks || []).forEach((task) => {
    const instances = Array.isArray(task.scheduledInstances) ? task.scheduledInstances : [];
    instances.forEach((instance) => {
      if (!instance?.timeMapId) {return;}
      const startMs = new Date(instance.start).getTime();
      const endMs = new Date(instance.end).getTime();
      const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
      if (!clamped) {return;}
      addInterval(usage, instance.timeMapId, clamped.startMs, clamped.endMs);
    });
  });
  return usage;
}

export function buildExternalIntervalsByTimeMap(timeMaps, horizonStart, horizonEnd) {
  const externalEvents = getExternalEventsForRange(
    { start: horizonStart, end: horizonEnd },
    "report"
  );
  if (!externalEvents.length) {return new Map();}
  const usage = new Map();
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();
  const dayMs = HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;
  (timeMaps || []).forEach((timeMap) => {
    const rulesByDay = buildTimeMapRulesByDay(timeMap);
    if (!rulesByDay.size) {return;}
    externalEvents.forEach((event) => {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      const clamped = clampRangeMs(startMs, endMs, horizonStartMs, horizonEndMs);
      if (!clamped) {return;}
      for (
        let cursorMs = getDayStartMs(clamped.startMs);
        cursorMs <= clamped.endMs;
        cursorMs += dayMs
      ) {
        const dayRules = rulesByDay.get(new Date(cursorMs).getDay());
        if (!dayRules) {continue;}
        const dayEventStart = Math.max(clamped.startMs, cursorMs);
        const dayEventEnd = Math.min(clamped.endMs, cursorMs + dayMs);
        if (dayEventEnd <= dayEventStart) {continue;}
        dayRules.forEach((rule) => {
          const startMinutes = parseTimeToMinutes(rule.startTime);
          const endMinutes = parseTimeToMinutes(rule.endTime);
          if (endMinutes <= startMinutes) {return;}
          const ruleStartMs = cursorMs + startMinutes * MS_PER_MINUTE;
          const ruleEndMs = cursorMs + endMinutes * MS_PER_MINUTE;
          const overlapStart = Math.max(dayEventStart, ruleStartMs);
          const overlapEnd = Math.min(dayEventEnd, ruleEndMs);
          if (overlapEnd <= overlapStart) {return;}
          addInterval(usage, timeMap.id, overlapStart, overlapEnd);
        });
      }
    });
  });
  return usage;
}

export function sumIntervalsMinutes(intervals) {
  if (!intervals.length) {return 0;}
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let totalMs = 0;
  let [currentStart, currentEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const [start, end] = sorted[i];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      totalMs += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  totalMs += currentEnd - currentStart;
  return Math.round(totalMs / MS_PER_MINUTE);
}
