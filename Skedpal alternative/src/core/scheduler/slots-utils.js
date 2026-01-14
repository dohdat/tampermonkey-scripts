import { addDays, parseTime } from "./date-utils.js";

function normalizeTimeMap(timeMap) {
  if (Array.isArray(timeMap.rules) && timeMap.rules.length > 0) {
    return { ...timeMap, rules: timeMap.rules.map((r) => ({ ...r, day: Number(r.day) })) };
  }
  const days = timeMap.days || [];
  const startTime = timeMap.startTime || "09:00";
  const endTime = timeMap.endTime || "12:00";
  return {
    ...timeMap,
    rules: days.map((day) => ({ day: Number(day), startTime, endTime }))
  };
}

export function buildWindows(timeMaps, now, horizonEnd) {
  const windows = [];
  timeMaps.forEach((timeMapRaw) => {
    const timeMap = normalizeTimeMap(timeMapRaw);
    timeMap.rules.forEach((rule) => {
      const { hours: startH, minutes: startM } = parseTime(rule.startTime);
      const { hours: endH, minutes: endM } = parseTime(rule.endTime);
      for (let offset = 0; ; offset += 1) {
        const day = addDays(now, offset);
        if (day > horizonEnd) {
          break;
        }
        if (day.getDay() !== rule.day) {
          continue;
        }
        const start = new Date(day);
        start.setHours(startH, startM, 0, 0);
        const end = new Date(day);
        end.setHours(endH, endM, 0, 0);
        if (end > horizonEnd) {
          end.setTime(horizonEnd.getTime());
        }
        if (start >= end) {
          continue;
        }
        if (end <= now) {
          continue;
        }
        if (start < now && now < end) {
          start.setTime(now.getTime());
        }
        windows.push({ start, end, timeMapId: timeMap.id });
      }
    });
  });
  return windows.sort((a, b) => a.start - b.start);
}

function splitSlot(slot, busy) {
  const noOverlap = busy.start >= slot.end || busy.end <= slot.start;
  if (noOverlap) {
    return [slot];
  }
  const parts = [];
  if (busy.start > slot.start) {
    parts.push({ ...slot, end: new Date(busy.start) });
  }
  if (busy.end < slot.end) {
    parts.push({ ...slot, start: new Date(busy.end) });
  }
  return parts;
}

export function removeBlockFromSlots(slots, block) {
  return slots
    .flatMap((slot) => splitSlot(slot, block))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start);
}

export function subtractBusy(windows, busy) {
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  let free = [];
  windows.forEach((window) => {
    let current = [window];
    sortedBusy.forEach((block) => {
      current = current.flatMap((slot) => splitSlot(slot, block));
    });
    current
      .filter((slot) => slot.end > slot.start)
      .forEach((slot) => free.push(slot));
  });
  return free.sort((a, b) => a.start - b.start);
}

export function getBlockingBusyForTask(busy, task) {
  if (!Array.isArray(busy) || busy.length === 0) {return [];}
  const allowed = new Set(task?.externalCalendarIds || []);
  if (allowed.size === 0) {return busy;}
  return busy.filter((block) => !block?.calendarId || !allowed.has(block.calendarId));
}

export function getAvailableSlotsForTask(slots, busy, task) {
  const blockingBusy = getBlockingBusyForTask(busy, task);
  if (blockingBusy.length === 0) {return slots;}
  return subtractBusy(slots, blockingBusy);
}

export function applyPlacementsToSlots(slots, placements) {
  if (!placements.length) {return slots;}
  return placements.reduce((nextSlots, placement) => {
    return removeBlockFromSlots(nextSlots, placement);
  }, slots);
}
