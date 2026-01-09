import { addDays, endOfDay, parseTime, startOfDay } from "./scheduler/date-utils.js";
import { buildOccurrenceDates, getUpcomingOccurrences } from "./scheduler/occurrences.js";
import { normalizeTask } from "./scheduler/task-utils.js";

export { getUpcomingOccurrences };

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

function removeBlockFromSlots(slots, block) {
  return slots
    .flatMap((slot) => splitSlot(slot, block))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start);
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

function normalizeSubtaskScheduleMode(value) {
  return value === "sequential" || value === "sequential-single" ? value : "parallel";
}

function buildParentModeMap(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task?.id) {return;}
    map.set(task.id, normalizeSubtaskScheduleMode(task.subtaskScheduleMode));
  });
  return map;
}

function buildSubtaskOrderMap(tasks) {
  const groups = new Map();
  tasks.forEach((task, index) => {
    const parentId = task.subtaskParentId;
    if (!parentId) {return;}
    if (!groups.has(parentId)) {groups.set(parentId, []);}
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
      if (aOrder !== bOrder) {return aOrder - bOrder;}
      return a.index - b.index;
    });
    items.forEach((item, position) => {
      orderMap.set(item.id, position);
    });
  });
  return orderMap;
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

function resolveOccurrenceStart(repeat, deadline) {
  if (repeat?.unit === "month" && repeat.monthlyMode === "range") {
    const startDay = repeat.monthlyRangeStart || deadline.getDate();
    const safeDay = clampDayInMonth(deadline.getFullYear(), deadline.getMonth(), startDay);
    return startOfDay(new Date(deadline.getFullYear(), deadline.getMonth(), safeDay));
  }
  if (repeat?.unit === "year" && repeat.yearlyRangeStartDate) {
    const rangeStartParts = parseDateParts(repeat.yearlyRangeStartDate);
    if (rangeStartParts) {
      const rangeEndParts = parseDateParts(repeat.yearlyRangeEndDate);
      const wrapsYear = isMonthDayAfter(rangeStartParts, rangeEndParts);
      const startYear = wrapsYear ? deadline.getFullYear() - 1 : deadline.getFullYear();
      const safeDay = clampDayInMonth(startYear, rangeStartParts.monthIndex, rangeStartParts.day);
      return startOfDay(new Date(startYear, rangeStartParts.monthIndex, safeDay));
    }
  }
  return startOfDay(deadline);
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
        const occurrenceStart = isRepeating ? resolveOccurrenceStart(normalized.repeat, deadline) : null;
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

  const sorted = candidates.sort(compareCandidateOrder);

  return { sorted, ignored, immediatelyUnscheduled };
}

function buildSlotSegments(slot, slotStartMs, slotEndLimitMs, chunkMs, deadlineMs) {
  const before =
    slot.start.getTime() < slotStartMs ? [{ ...slot, end: new Date(slotStartMs) }] : [];
  const afterFirst =
    slotStartMs + chunkMs < slotEndLimitMs
      ? [
          {
            ...slot,
            start: new Date(slotStartMs + chunkMs),
            end: new Date(slotEndLimitMs)
          }
        ]
      : [];
  const afterDeadline =
    deadlineMs < slot.end.getTime()
      ? [{ ...slot, start: new Date(deadlineMs), end: slot.end }]
      : [];
  return [...before, ...afterFirst, ...afterDeadline];
}

function placeTaskInSingleSlot(task, freeSlots, now) {
  let slots = [...freeSlots];
  const deadlineMs = task.deadline.getTime();
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!task.timeMapIds.includes(slot.timeMapId)) {continue;}
    const slotStartMs = Math.max(slot.start.getTime(), now.getTime(), task.startFrom.getTime());
    const slotEndLimitMs = Math.min(slot.end.getTime(), deadlineMs);
    if (slotEndLimitMs - slotStartMs < task.durationMs) {continue;}
    const placement = {
      taskId: task.id,
      occurrenceId: task.occurrenceId,
      timeMapId: slot.timeMapId,
      start: new Date(slotStartMs),
      end: new Date(slotStartMs + task.durationMs)
    };
    const segments = buildSlotSegments(
      slot,
      slotStartMs,
      Math.min(slot.end.getTime(), deadlineMs),
      task.durationMs,
      deadlineMs
    );
    slots = removeBlockFromSlots(
      [...slots.slice(0, i), ...segments, ...slots.slice(i + 1)],
      placement
    );
    return { success: true, placements: [placement], nextSlots: slots };
  }
  return { success: false, placements: [], nextSlots: freeSlots };
}

function placeTaskInMultipleSlots(task, freeSlots, now) {
  let remaining = task.durationMs;
  const placements = [];
  let slots = [...freeSlots];
  const deadlineMs = task.deadline.getTime();
  const minRequired = Math.min(task.minBlockMs, task.durationMs);

  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    const slot = slots[i];
    if (!task.timeMapIds.includes(slot.timeMapId)) {continue;}
    const slotStartMs = Math.max(slot.start.getTime(), now.getTime(), task.startFrom.getTime());
    const slotEndLimitMs = Math.min(slot.end.getTime(), deadlineMs);
    if (slotEndLimitMs - slotStartMs < minRequired) {continue;}

    const effectiveMin = Math.min(task.minBlockMs, remaining);
    const availableMs = slotEndLimitMs - slotStartMs;
    if (availableMs < effectiveMin) {continue;}

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

    const segments = buildSlotSegments(
      slot,
      slotStartMs,
      Math.min(slot.end.getTime(), deadlineMs),
      chunkMs,
      deadlineMs
    );
    slots = removeBlockFromSlots(
      [...slots.slice(0, i), ...segments, ...slots.slice(i + 1)],
      placement
    );
    i = -1; // restart scan with updated slots
  }

  if (remaining > 0) {
    return { success: false, placements: [], nextSlots: freeSlots };
  }
  return { success: true, placements, nextSlots: slots };
}

function placeTaskInSlots(task, freeSlots, now, options = {}) {
  const requireSingleBlock = Boolean(options.requireSingleBlock);
  if (requireSingleBlock) {
    return placeTaskInSingleSlot(task, freeSlots, now);
  }
  return placeTaskInMultipleSlots(task, freeSlots, now);
}

function compareNumeric(aValue, bValue) {
  if (aValue < bValue) {return -1;}
  if (aValue > bValue) {return 1;}
  return 0;
}

function compareCandidateOrder(a, b) {
  const comparisons = [
    () => compareNumeric(a.deadline, b.deadline),
    () => compareNumeric(b.priority, a.priority),
    () => compareNumeric(a.startFrom, b.startFrom),
    () => (a.section || "").localeCompare(b.section || ""),
    () => (a.subsection || "").localeCompare(b.subsection || ""),
    () => compareNumeric(Number(a.order) || 0, Number(b.order) || 0),
    () => (a.title || "").localeCompare(b.title || "")
  ];
  for (const compare of comparisons) {
    const result = compare();
    if (result !== 0) {return result;}
  }
  return 0;
}

function sortCandidates(candidates, parentModeById, subtaskOrderById) {
  return [...candidates].sort((a, b) => {
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
        if (aOrder !== bOrder) {return aOrder - bOrder;}
      }
    }
    return compareCandidateOrder(a, b);
  });
}

function getParentMode(task, parentModeById) {
  const parentId = task.subtaskParentId || "";
  const mode = parentId ? parentModeById.get(parentId) || "parallel" : "parallel";
  return { parentId, mode };
}

function isSequentialBlocked(state, mode) {
  return state.failed || (mode === "sequential-single" && state.scheduledOne);
}

function getSequentialStart(task, current) {
  if (!current.lastEnd) {return task.startFrom;}
  return new Date(Math.max(task.startFrom.getTime(), current.lastEnd.getTime()));
}

function buildSequentialState(current, mode, result) {
  const nextState = { ...current };
  if (result.success) {
    const lastEnd = result.placements.reduce(
      (latest, placement) => (placement.end > latest ? placement.end : latest),
      result.placements[0].end
    );
    nextState.lastEnd = lastEnd;
    nextState.failed = false;
    if (mode === "sequential-single") {
      nextState.scheduledOne = true;
    }
  } else {
    nextState.failed = true;
  }
  return nextState;
}

function handleSequentialTask(task, state) {
  const { parentModeById, parentState, slots, now } = state;
  const { parentId, mode } = getParentMode(task, parentModeById);
  if (!parentId || mode === "parallel") {return null;}
  const current = parentState.get(parentId) || { failed: false, lastEnd: null, scheduledOne: false };
  if (isSequentialBlocked(current, mode)) {
    return {
      handled: true,
      success: false,
      blocked: true,
      placements: [],
      nextSlots: slots,
      parentId,
      state: current
    };
  }
  const startFrom = getSequentialStart(task, current);
  const candidate = { ...task, startFrom };
  const result = placeTaskInSlots(candidate, slots, now, {
    requireSingleBlock: mode === "sequential-single"
  });
  const nextState = buildSequentialState(current, mode, result);
  return {
    handled: true,
    success: result.success,
    blocked: false,
    placements: result.placements,
    nextSlots: result.nextSlots,
    parentId,
    state: nextState
  };
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

  const sortedCandidates = sortCandidates(candidates, parentModeById, subtaskOrderById);

  let slots = freeSlots;
  const scheduled = [];
  const unscheduled = new Set(immediatelyUnscheduled);
  const deferred = new Set();
  const parentState = new Map();

  sortedCandidates.forEach((task) => {
    const sequentialResult = handleSequentialTask(task, {
      parentModeById,
      parentState,
      slots,
      now
    });
    if (sequentialResult?.handled) {
      if (sequentialResult.success) {
        scheduled.push(...sequentialResult.placements);
        slots = sequentialResult.nextSlots;
      } else {
        if (sequentialResult.blocked) {
          deferred.add(task.id);
        } else {
          unscheduled.add(task.id);
        }
      }
      parentState.set(sequentialResult.parentId, sequentialResult.state);
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
    deferred: Array.from(deferred),
    freeSlotsCount: freeSlots.length
  };
}
