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

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function normalizeDeadline(value, fallback) {
  if (!value) return endOfDay(fallback);
  const date = new Date(value);
  if (Number.isNaN(date)) return endOfDay(fallback);
  const atMidnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  return atMidnight ? endOfDay(date) : date;
}

function normalizeTask(task, now, horizonEnd) {
  const durationMin = Math.max(15, Number(task.durationMin) || 0);
  const minBlockMin = Math.max(15, Math.min(Number(task.minBlockMin) || durationMin, durationMin));
  const deadline = normalizeDeadline(task.deadline, horizonEnd);
  const startFrom = task.startFrom ? new Date(task.startFrom) : now;
  return {
    ...task,
    durationMs: durationMin * 60 * 1000,
    minBlockMs: minBlockMin * 60 * 1000,
    priority: Number(task.priority) || 0,
    timeMapIds: Array.isArray(task.timeMapIds) ? task.timeMapIds : [],
    deadline,
    startFrom
  };
}

function normalizeSubtaskScheduleMode(value) {
  return value === "sequential" || value === "sequential-single" ? value : "parallel";
}

function buildParentModeMap(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task?.id) return;
    map.set(task.id, normalizeSubtaskScheduleMode(task.subtaskScheduleMode));
  });
  return map;
}

function buildSubtaskOrderMap(tasks) {
  const groups = new Map();
  tasks.forEach((task, index) => {
    const parentId = task.subtaskParentId;
    if (!parentId) return;
    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId).push({
      id: task.id,
      order: Number(task.order),
      index
    });
  });
  const orderMap = new Map();
  groups.forEach((items) => {
    items.sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    });
    items.forEach((item, position) => {
      orderMap.set(item.id, position);
    });
  });
  return orderMap;
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  if (nth === -1) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - diff);
    return last;
  }
  const offset = (weekday - firstDay + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(year, month, day);
}

function buildOccurrenceDates(task, now, horizonEnd) {
  const repeat = task.repeat || { type: "none" };
  const anchor = startOfDay(task.startFrom || task.deadline || now);
  const limitDateRaw =
    repeat.end?.type === "on" && repeat.end?.date ? new Date(repeat.end.date) : horizonEnd;
  const limitDate = endOfDay(limitDateRaw > horizonEnd ? horizonEnd : limitDateRaw);
  const interval = Math.max(1, Number(repeat.interval) || 1);
  const maxCount =
    repeat.end?.type === "after" && repeat.end?.count
      ? Math.max(0, Number(repeat.end.count))
      : Number.POSITIVE_INFINITY;
  const occurrences = [];

  if (!repeat || repeat.type === "none" || repeat.unit === "none") {
    if (task.deadline >= now && task.deadline <= horizonEnd) {
      occurrences.push(task.deadline);
    } else if (!task.deadline || Number.isNaN(task.deadline)) {
      occurrences.push(horizonEnd);
    }
    return occurrences;
  }

  const nowStart = startOfDay(now);
  if (repeat.unit === "day") {
    for (
      let cursor = new Date(anchor), count = 0;
      cursor <= limitDate && count < maxCount;
      cursor = addDays(cursor, interval), count += 1
    ) {
      if (cursor < nowStart) continue;
      if (cursor > horizonEnd) break;
      occurrences.push(endOfDay(cursor));
    }
    return occurrences;
  }

  if (repeat.unit === "week") {
    const weeklyDays =
      Array.isArray(repeat.weeklyDays) && repeat.weeklyDays.length > 0
        ? repeat.weeklyDays.map((d) => Number(d))
        : [anchor.getDay()];
    let weekStart = startOfWeek(anchor);
    let emitted = 0;
    while (weekStart <= limitDate && emitted < maxCount) {
      for (const day of weeklyDays) {
        const candidate = addDays(weekStart, day);
        if (candidate < anchor || candidate < nowStart) continue;
        if (candidate > limitDate || candidate > horizonEnd) continue;
        occurrences.push(endOfDay(candidate));
        emitted += 1;
        if (emitted >= maxCount) break;
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
    return occurrences;
  }

  if (repeat.unit === "month") {
    let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    let emitted = 0;
    while (cursor <= limitDate && emitted < maxCount) {
      let candidate;
      if (repeat.monthlyMode === "nth") {
        const weekday = repeat.monthlyWeekday ?? anchor.getDay();
        const nth = repeat.monthlyNth ?? 1;
        candidate = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), weekday, nth);
      } else {
        const day = repeat.monthlyDay || anchor.getDate();
        candidate = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      }
      if (
        candidate >= anchor &&
        candidate >= nowStart &&
        candidate <= limitDate &&
        candidate <= horizonEnd
      ) {
        occurrences.push(endOfDay(candidate));
        emitted += 1;
      }
      cursor.setMonth(cursor.getMonth() + interval);
    }
    return occurrences;
  }

  if (repeat.unit === "year") {
    let cursor = new Date(anchor);
    let emitted = 0;
    while (cursor <= limitDate && emitted < maxCount) {
      const month = (repeat.yearlyMonth || anchor.getMonth() + 1) - 1;
      const day = repeat.yearlyDay || anchor.getDate();
      const candidate = new Date(cursor.getFullYear(), month, day);
      if (
        candidate >= anchor &&
        candidate >= nowStart &&
        candidate <= limitDate &&
        candidate <= horizonEnd
      ) {
        occurrences.push(endOfDay(candidate));
        emitted += 1;
      }
      cursor.setFullYear(cursor.getFullYear() + interval);
    }
    return occurrences;
  }

  return occurrences;
}

export function getUpcomingOccurrences(task, now = new Date(), count = 10, horizonDays = 365) {
  if (!task) return [];
  const horizonEnd = endOfDay(addDays(now, horizonDays));
  const normalized = normalizeTask(task, now, horizonEnd);
  const occurrences = buildOccurrenceDates(normalized, now, horizonEnd);
  const completedOccurrences = new Set(
    (task.completedOccurrences || []).map((value) => {
      const date = new Date(value);
      return Number.isNaN(date) ? String(value) : date.toISOString();
    })
  );
  return occurrences.filter((date) => !completedOccurrences.has(date.toISOString())).slice(0, count);
}

function buildScheduleCandidates(tasks, now, horizonEnd) {
  const ignored = new Set();
  const immediatelyUnscheduled = new Set();
  const parentIds = new Set(
    tasks
      .filter((task) => task.subtaskParentId && !task.completed)
      .map((task) => task.subtaskParentId)
  );
  const candidates = [];
  tasks
    .filter((task) => !task.completed)
    .forEach((task) => {
      if (parentIds.has(task.id)) {
        return;
      }
      const normalized = normalizeTask(task, now, horizonEnd);
      const occurrenceDates = buildOccurrenceDates(normalized, now, horizonEnd);
      const completedOccurrences = new Set(
        (task.completedOccurrences || []).map((value) => {
          const date = new Date(value);
          return Number.isNaN(date) ? String(value) : date.toISOString();
        })
      );
      if (!occurrenceDates || occurrenceDates.length === 0) {
        if (normalized.deadline < now) {
          immediatelyUnscheduled.add(task.id);
        } else {
          ignored.add(task.id);
        }
        return;
      }
      const isRepeating = normalized.repeat && normalized.repeat.type !== "none";
      occurrenceDates.forEach((deadline, index) => {
        if (completedOccurrences.has(deadline.toISOString())) {
          return;
        }
        const occurrenceStart = isRepeating ? startOfDay(deadline) : null;
        const earliestStart = new Date(
          Math.max(
            now.getTime(),
            normalized.startFrom.getTime(),
            occurrenceStart ? occurrenceStart.getTime() : 0
          )
        );
        candidates.push({
          ...normalized,
          occurrenceId: `${normalized.id || normalized.taskId || task.id}-occ-${index}`,
          deadline,
          startFrom: earliestStart
        });
      });
    });

  const sorted = candidates.sort((a, b) => {
    const deadlineDelta = a.deadline - b.deadline;
    if (deadlineDelta !== 0) return deadlineDelta;
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) return priorityDelta;
    const startDelta = a.startFrom - b.startFrom;
    if (startDelta !== 0) return startDelta;
    const sectionDelta = (a.section || "").localeCompare(b.section || "");
    if (sectionDelta !== 0) return sectionDelta;
    const subsectionDelta = (a.subsection || "").localeCompare(b.subsection || "");
    if (subsectionDelta !== 0) return subsectionDelta;
    const orderDelta = (Number(a.order) || 0) - (Number(b.order) || 0);
    if (orderDelta !== 0) return orderDelta;
    return (a.title || "").localeCompare(b.title || "");
  });

  return { sorted, ignored, immediatelyUnscheduled };
}

function placeTaskInSlots(task, freeSlots, now, options = {}) {
  const requireSingleBlock = Boolean(options.requireSingleBlock);
  let remaining = task.durationMs;
  const placements = [];
  let slots = [...freeSlots];
  const deadlineMs = task.deadline.getTime();
  const minRequired = Math.min(task.minBlockMs, task.durationMs);

  if (requireSingleBlock) {
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (!task.timeMapIds.includes(slot.timeMapId)) continue;
      const slotStartMs = Math.max(slot.start.getTime(), now.getTime(), task.startFrom.getTime());
      const slotEndLimitMs = Math.min(slot.end.getTime(), deadlineMs);
      if (slotEndLimitMs - slotStartMs < remaining) continue;
      const placement = {
        taskId: task.id,
        occurrenceId: task.occurrenceId,
        timeMapId: slot.timeMapId,
        start: new Date(slotStartMs),
        end: new Date(slotStartMs + remaining)
      };
      placements.push(placement);
      const before =
        slot.start.getTime() < slotStartMs
          ? [{ ...slot, end: new Date(slotStartMs) }]
          : [];
      const after =
        slotStartMs + remaining < Math.min(slot.end.getTime(), deadlineMs)
          ? [
              {
                ...slot,
                start: new Date(slotStartMs + remaining),
                end: new Date(Math.min(slot.end.getTime(), deadlineMs))
              }
            ]
          : [];
      const afterDeadline =
        deadlineMs < slot.end.getTime()
          ? [{ ...slot, start: new Date(deadlineMs), end: slot.end }]
          : [];
      slots = [...slots.slice(0, i), ...before, ...after, ...afterDeadline, ...slots.slice(i + 1)].sort(
        (a, b) => a.start - b.start
      );
      return { success: true, placements, nextSlots: slots };
    }
    return { success: false, placements: [], nextSlots: freeSlots };
  }

  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    const slot = slots[i];
    if (!task.timeMapIds.includes(slot.timeMapId)) continue;
    const slotStartMs = Math.max(slot.start.getTime(), now.getTime(), task.startFrom.getTime());
    const slotEndLimitMs = Math.min(slot.end.getTime(), deadlineMs);
    if (slotEndLimitMs - slotStartMs < minRequired) continue;

    const effectiveMin = Math.min(task.minBlockMs, remaining);
    const availableMs = slotEndLimitMs - slotStartMs;
    if (availableMs < effectiveMin) continue;

    const chunkMs = Math.min(remaining, availableMs);
    const placement = {
      taskId: task.id,
      occurrenceId: task.occurrenceId,
      timeMapId: slot.timeMapId,
      start: new Date(slotStartMs),
      end: new Date(slotStartMs + chunkMs)
    };
    placements.push(placement);
    remaining -= chunkMs;

    const before =
      slot.start.getTime() < slotStartMs
        ? [{ ...slot, end: new Date(slotStartMs) }]
        : [];
    const afterFirst =
      slotStartMs + chunkMs < Math.min(slot.end.getTime(), deadlineMs)
        ? [
            {
              ...slot,
              start: new Date(slotStartMs + chunkMs),
              end: new Date(Math.min(slot.end.getTime(), deadlineMs))
            }
          ]
        : [];
    const afterDeadline =
      deadlineMs < slot.end.getTime()
        ? [{ ...slot, start: new Date(deadlineMs), end: slot.end }]
        : [];

    slots = [...slots.slice(0, i), ...before, ...afterFirst, ...afterDeadline, ...slots.slice(i + 1)].sort(
      (a, b) => a.start - b.start
    );
    i = -1; // restart scan with updated slots
  }

  if (remaining > 0) {
    return { success: false, placements: [], nextSlots: freeSlots };
  }
  return { success: true, placements, nextSlots: slots };
}

export function scheduleTasks({
  tasks,
  timeMaps,
  busy,
  schedulingHorizonDays,
  now = new Date()
}) {
  const horizonEnd = endOfDay(addDays(now, schedulingHorizonDays));
  const windows = buildWindows(timeMaps, now, horizonEnd);
  const freeSlots = subtractBusy(windows, busy);
  const parentModeById = buildParentModeMap(tasks);
  const subtaskOrderById = buildSubtaskOrderMap(tasks);
  const { sorted: candidates, ignored, immediatelyUnscheduled } = buildScheduleCandidates(
    tasks,
    now,
    horizonEnd
  );

  const sortedCandidates = [...candidates].sort((a, b) => {
    const aParent = a.subtaskParentId || "";
    const bParent = b.subtaskParentId || "";
    if (aParent && aParent === bParent) {
      const mode = parentModeById.get(aParent) || "parallel";
      if (mode !== "parallel") {
        const aOrder = subtaskOrderById.has(a.id)
          ? subtaskOrderById.get(a.id)
          : Number.MAX_SAFE_INTEGER;
        const bOrder = subtaskOrderById.has(b.id)
          ? subtaskOrderById.get(b.id)
          : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
    }
    const deadlineDelta = a.deadline - b.deadline;
    if (deadlineDelta !== 0) return deadlineDelta;
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) return priorityDelta;
    const startDelta = a.startFrom - b.startFrom;
    if (startDelta !== 0) return startDelta;
    const sectionDelta = (a.section || "").localeCompare(b.section || "");
    if (sectionDelta !== 0) return sectionDelta;
    const subsectionDelta = (a.subsection || "").localeCompare(b.subsection || "");
    if (subsectionDelta !== 0) return subsectionDelta;
    const orderDelta = (Number(a.order) || 0) - (Number(b.order) || 0);
    if (orderDelta !== 0) return orderDelta;
    return (a.title || "").localeCompare(b.title || "");
  });

  let slots = freeSlots;
  const scheduled = [];
  const unscheduled = new Set(immediatelyUnscheduled);
  const parentState = new Map();

  sortedCandidates.forEach((task) => {
    const parentId = task.subtaskParentId || "";
    const mode = parentId ? parentModeById.get(parentId) || "parallel" : "parallel";
    if (parentId && mode !== "parallel") {
      const state = parentState.get(parentId) || { failed: false, lastEnd: null, scheduledOne: false };
      if (state.failed) {
        unscheduled.add(task.id);
        parentState.set(parentId, state);
        return;
      }
      if (mode === "sequential-single" && state.scheduledOne) {
        unscheduled.add(task.id);
        parentState.set(parentId, state);
        return;
      }
      const startFrom = state.lastEnd
        ? new Date(Math.max(task.startFrom.getTime(), state.lastEnd.getTime()))
        : task.startFrom;
      const candidate = { ...task, startFrom };
      const { success, placements, nextSlots } = placeTaskInSlots(candidate, slots, now, {
        requireSingleBlock: mode === "sequential-single"
      });
      if (success) {
        scheduled.push(...placements);
        slots = nextSlots;
        const lastEnd = placements.reduce(
          (latest, placement) => (placement.end > latest ? placement.end : latest),
          placements[0].end
        );
        parentState.set(parentId, {
          failed: false,
          lastEnd,
          scheduledOne: mode === "sequential-single" ? true : state.scheduledOne
        });
      } else {
        unscheduled.add(task.id);
        parentState.set(parentId, {
          failed: true,
          lastEnd: state.lastEnd,
          scheduledOne: state.scheduledOne
        });
      }
      return;
    }
    const { success, placements, nextSlots } = placeTaskInSlots(task, slots, now);
    if (success) {
      scheduled.push(...placements);
      slots = nextSlots;
    } else {
      unscheduled.add(task.id);
    }
  });

  return {
    scheduled,
    unscheduled: Array.from(unscheduled),
    ignored: Array.from(ignored),
    freeSlotsCount: freeSlots.length
  };
}
