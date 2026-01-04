function parseTime(timeString) {
  const [hours, minutes] = timeString.split(":").map((part) => parseInt(part, 10));
  return { hours, minutes };
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

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

function buildWindows(timeMaps, now, horizonEnd) {
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

function subtractBusy(windows, busy) {
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

function sortTasks(tasks, horizonEnd) {
  return tasks
    .filter((task) => new Date(task.deadline) <= horizonEnd)
    .sort((a, b) => {
      const deadlineDelta = new Date(a.deadline) - new Date(b.deadline);
      if (deadlineDelta !== 0) return deadlineDelta;
      return b.priority - a.priority;
    });
}

function findSlotForTask(task, freeSlots, now) {
  const durationMs = task.durationMin * 60 * 1000;
  const deadline = new Date(task.deadline);
  for (let i = 0; i < freeSlots.length; i += 1) {
    const slot = freeSlots[i];
    if (!task.timeMapIds.includes(slot.timeMapId)) continue;
    if (slot.start >= deadline) continue;
    const candidateStart = new Date(Math.max(slot.start, now));
    const candidateEnd = new Date(candidateStart.getTime() + durationMs);
    if (candidateEnd > slot.end || candidateEnd > deadline) {
      continue;
    }
    const before = candidateStart > slot.start ? [{ ...slot, end: candidateStart }] : [];
    const after = candidateEnd < slot.end ? [{ ...slot, start: candidateEnd }] : [];
    const nextSlots = [
      ...freeSlots.slice(0, i),
      ...before,
      ...after,
      ...freeSlots.slice(i + 1)
    ].sort((a, b) => a.start - b.start);
    return {
      placement: {
        taskId: task.id,
        timeMapId: slot.timeMapId,
        start: candidateStart,
        end: candidateEnd
      },
      nextSlots
    };
  }
  return { placement: null, nextSlots: freeSlots };
}

export function scheduleTasks({
  tasks,
  timeMaps,
  busy,
  schedulingHorizonDays,
  now = new Date()
}) {
  const horizonEnd = addDays(now, schedulingHorizonDays);
  const windows = buildWindows(timeMaps, now, horizonEnd);
  const freeSlots = subtractBusy(windows, busy);
  const sortedTasks = sortTasks(tasks, horizonEnd);
  let slots = freeSlots;
  const scheduled = [];
  const unscheduled = [];

  sortedTasks.forEach((task) => {
    const { placement, nextSlots } = findSlotForTask(task, slots, now);
    if (placement) {
      scheduled.push(placement);
      slots = nextSlots;
    } else {
      unscheduled.push(task.id);
    }
  });

  const ignored = tasks
    .filter((task) => new Date(task.deadline) > horizonEnd)
    .map((task) => task.id);

  return { scheduled, unscheduled, ignored, freeSlotsCount: freeSlots.length };
}
