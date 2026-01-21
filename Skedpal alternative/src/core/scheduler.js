import {
  addDays,
  endOfDay,
  startOfDay,
  startOfWeek,
  getLocalDateKey
} from "./scheduler/date-utils.js";
import { buildOccurrenceDates, getUpcomingOccurrences } from "./scheduler/occurrences.js";
import { normalizeTask } from "./scheduler/task-utils.js";
import {
  buildSequentialInfoMap,
  buildTaskMap,
  compareSequentialIndex
} from "./scheduler/sequential-utils.js";
import {
  applyPlacementsToSlots,
  buildWindows,
  getAvailableSlotsForTask,
  removeBlockFromSlots,
  subtractBusy
} from "./scheduler/slots-utils.js";
import { buildPinnedSchedulingState } from "./scheduler/pinned-utils.js";
import { runSchedulingLoop } from "./scheduler/schedule-loop.js";
import {
  FLEXIBLE_REPEAT_WINDOW_DAYS,
  INDEX_NOT_FOUND,
  MS_PER_DAY,
  THREE
} from "../constants.js";

export { getUpcomingOccurrences };


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

function parseOrderValue(value) {
  if (value === null || value === undefined) {return Number.NaN;}
  if (typeof value === "string" && value.trim() === "") {return Number.NaN;}
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function buildSubtaskOrderMap(tasks) {
  const groups = new Map();
  tasks.forEach((task, index) => {
    const parentId = task.subtaskParentId;
    if (!parentId) {return;}
    if (!groups.has(parentId)) {groups.set(parentId, []);}
    groups.get(parentId).push({
      id: task.id,
      order: parseOrderValue(task.order),
      index,
      title: task.title || ""
    });
  });
  const orderMap = new Map();
  groups.forEach((items) => {
    items.sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {return aOrder - bOrder;}
      if (a.title !== b.title) {return a.title.localeCompare(b.title);}
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

function getWeeklyAnyDays(repeat, occurrenceDate) {
  if (Array.isArray(repeat?.weeklyDays) && repeat.weeklyDays.length) {
    const days = repeat.weeklyDays
      .map((day) => Number(day))
      .filter((day) => Number.isFinite(day));
    return days.length ? days : [occurrenceDate.getDay()];
  }
  return [occurrenceDate.getDay()];
}

function clampDeadlineToRepeatEnd(deadline, repeat) {
  if (repeat?.end?.type !== "on" || !repeat?.end?.date) {
    return deadline;
  }
  const endDate = new Date(repeat.end.date);
  if (Number.isNaN(endDate.getTime())) {
    return deadline;
  }
  const limit = endOfDay(endDate);
  return limit < deadline ? limit : deadline;
}

function clampDeadlineToHorizon(deadline, horizonEnd) {
  if (!horizonEnd || deadline <= horizonEnd) {
    return deadline;
  }
  return horizonEnd;
}

function resolveWeeklyAnyDeadline(repeat, occurrenceDate, horizonEnd) {
  if (!repeat || repeat.unit !== "week" || repeat.weeklyMode !== "any") {
    return occurrenceDate;
  }
  const days = getWeeklyAnyDays(repeat, occurrenceDate);
  const maxDay = Math.max(...days);
  const weekStart = startOfWeek(occurrenceDate);
  const candidate = addDays(weekStart, maxDay);
  let deadline = endOfDay(candidate);
  deadline = clampDeadlineToRepeatEnd(deadline, repeat);
  deadline = clampDeadlineToHorizon(deadline, horizonEnd);
  if (deadline < occurrenceDate) {
    return occurrenceDate;
  }
  return deadline;
}

function computeRepeatWindowDays(start, end) {
  if (!start || !end) {return 0;}
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff <= 0) {return 0;}
  return Math.ceil(diff / MS_PER_DAY);
}

function isFlexibleRepeat(candidate) {
  return candidate.isRepeating && candidate.repeatWindowDays >= FLEXIBLE_REPEAT_WINDOW_DAYS;
}

function buildCompletedOccurrenceSet(values) {
  const completed = new Set();
  (values || []).forEach((value) => {
    if (!value) {return;}
    if (typeof value === "string" && value.trim()) {
      completed.add(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {return;}
    completed.add(date.toISOString());
    const localKey = getLocalDateKey(date);
    if (localKey) {completed.add(localKey);}
  });
  return completed;
}

function isOccurrenceCompleted(completedOccurrences, date) {
  if (!completedOccurrences?.size || !date) {return false;}
  return (
    completedOccurrences.has(date.toISOString()) ||
    completedOccurrences.has(getLocalDateKey(date))
  );
}

function shouldPreferPriorityOrder(a, b) {
  if (a.hasExplicitDeadline || b.hasExplicitDeadline) {return false;}
  if (!a.isRepeating && !b.isRepeating) {return true;}
  if (isFlexibleRepeat(a) && !b.isRepeating) {return true;}
  if (isFlexibleRepeat(b) && !a.isRepeating) {return true;}
  return false;
}

function buildScheduleCandidates(tasks, now, horizonEnd, options = {}) {
  const pinnedTaskIds = options.pinnedTaskIds || new Set();
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
      if (pinnedTaskIds.has(task.id)) {return;}
      if (parentIds.has(task.id)) {
        return;
      }
      const normalized = normalizeTask(task, now, horizonEnd);
      const occurrenceDates = buildOccurrenceDates(normalized, now, horizonEnd);
      const completedOccurrences = buildCompletedOccurrenceSet(task.completedOccurrences);
      if (!occurrenceDates || occurrenceDates.length === 0) {
        if (normalized.deadline < now) {
          immediatelyUnscheduled.add(task.id);
        } else {
          ignored.add(task.id);
        }
        return;
      }
      const isRepeating = normalized.repeat && normalized.repeat.type !== "none";
      const hasExplicitDeadline = Boolean(task.deadline);
      occurrenceDates.forEach((deadline, index) => {
        const occurrenceDate = deadline;
        if (isOccurrenceCompleted(completedOccurrences, occurrenceDate)) {
          return;
        }
        const occurrenceStart = isRepeating
          ? resolveOccurrenceStart(normalized.repeat, occurrenceDate)
          : null;
        const schedulingDeadline = isRepeating
          ? resolveWeeklyAnyDeadline(normalized.repeat, occurrenceDate, horizonEnd)
          : occurrenceDate;
        const earliestStart = new Date(
          Math.max(
            now.getTime(),
            normalized.startFrom.getTime(),
            occurrenceStart ? occurrenceStart.getTime() : 0
          )
        );
        const repeatWindowDays = isRepeating
          ? computeRepeatWindowDays(occurrenceStart || earliestStart, schedulingDeadline)
          : 0;
        candidates.push({
          ...normalized,
          hasExplicitDeadline,
          isRepeating,
          repeatWindowDays,
          occurrenceId: `${normalized.id || normalized.taskId || task.id}-occ-${index}`,
          deadline: schedulingDeadline,
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
    i = INDEX_NOT_FOUND; // restart scan with updated slots
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
  if (aValue < bValue) {return INDEX_NOT_FOUND;}
  if (aValue > bValue) {return 1;}
  return 0;
}

function resolveOrderValue(value) {
  const numeric = parseOrderValue(value);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function compareCandidateOrder(a, b) {
  const comparisons = shouldPreferPriorityOrder(a, b)
    ? [
        () => compareNumeric(b.priority, a.priority),
        () => compareNumeric(a.deadline, b.deadline),
        () => compareNumeric(a.startFrom, b.startFrom),
        () => (a.section || "").localeCompare(b.section || ""),
        () => (a.subsection || "").localeCompare(b.subsection || ""),
        () => compareNumeric(resolveOrderValue(a.order), resolveOrderValue(b.order)),
        () => (a.title || "").localeCompare(b.title || "")
      ]
    : [
        () => compareNumeric(a.deadline, b.deadline),
        () => compareNumeric(b.priority, a.priority),
        () => compareNumeric(a.startFrom, b.startFrom),
        () => (a.section || "").localeCompare(b.section || ""),
        () => (a.subsection || "").localeCompare(b.subsection || ""),
        () => compareNumeric(resolveOrderValue(a.order), resolveOrderValue(b.order)),
        () => (a.title || "").localeCompare(b.title || "")
      ];
  for (const compare of comparisons) {
    const result = compare();
    if (result !== 0) {return result;}
  }
  return 0;
}

function sortCandidates(candidates, parentModeById, subtaskOrderById, sequentialInfoById) {
  const baseOrder = [...candidates].sort(compareCandidateOrder);
  return applySequentialCandidateOrdering(baseOrder, sequentialInfoById);
}

function applySequentialCandidateOrdering(sortedCandidates, sequentialInfoById) {
  const groups = new Map();
  sortedCandidates.forEach((candidate) => {
    const info = sequentialInfoById.get(candidate.id);
    if (!info?.groupId || !Number.isFinite(info.flatIndex)) {return;}
    if (!groups.has(info.groupId)) {
      groups.set(info.groupId, []);
    }
    groups.get(info.groupId).push({ candidate, flatIndex: info.flatIndex });
  });
  groups.forEach((group, groupId) => {
    group.sort((a, b) => compareSequentialIndex(a.flatIndex, b.flatIndex));
    groups.set(
      groupId,
      {
        queue: group.map((entry) => entry.candidate),
        cursor: 0
      }
    );
  });
  const ordered = [...sortedCandidates];
  ordered.forEach((candidate, index) => {
    const info = sequentialInfoById.get(candidate.id);
    if (!info?.groupId || !Number.isFinite(info.flatIndex)) {return;}
    const group = groups.get(info.groupId);
    if (!group) {return;}
    const replacement = group.queue[group.cursor];
    if (!replacement) {return;}
    ordered[index] = replacement;
    group.cursor += 1;
  });
  return ordered;
}

function isSequentialBlocked(state, mode) {
  return state.failed || (mode === "sequential-single" && state.scheduledOne);
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
  const { parentState, slots, now, busy, sequentialInfoById } = state;
  const info = sequentialInfoById.get(task.id);
  const ancestors = info?.ancestors || [];
  if (!ancestors.length) {return null;}
  const stateEntries = ancestors.map((ancestor) => {
    const current = parentState.get(ancestor.id) || {
      failed: false,
      lastEnd: null,
      scheduledOne: false
    };
    return { ancestor, current };
  });
  const blockedEntry = stateEntries.find(({ ancestor, current }) =>
    isSequentialBlocked(current, ancestor.mode)
  );
  if (blockedEntry) {
    return {
      handled: true,
      success: false,
      blocked: true,
      placements: [],
      nextSlots: slots,
      nextStates: stateEntries.map(({ ancestor, current }) => ({
        ancestorId: ancestor.id,
        state: current
      }))
    };
  }
  let startFrom = task.startFrom;
  stateEntries.forEach(({ current }) => {
    if (current.lastEnd) {
      startFrom = new Date(Math.max(startFrom.getTime(), current.lastEnd.getTime()));
    }
  });
  const candidate = { ...task, startFrom };
  const availableSlots = getAvailableSlotsForTask(slots, busy, candidate);
  const requireSingleBlock = stateEntries.some(
    ({ ancestor }) => ancestor.mode === "sequential-single"
  );
  const result = placeTaskInSlots(candidate, availableSlots, now, { requireSingleBlock });
  const nextSlots = result.success ? applyPlacementsToSlots(slots, result.placements) : slots;
  const nextStates = stateEntries.map(({ ancestor, current }) => ({
    ancestorId: ancestor.id,
    state: buildSequentialState(current, ancestor.mode, result)
  }));
  return {
    handled: true,
    success: result.success,
    blocked: false,
    placements: result.placements,
    nextSlots,
    nextStates
  };
}

export function scheduleTasks({
  tasks,
  timeMaps,
  busy,
  schedulingHorizonDays,
  now = new Date(),
  pinnedPlacements = [],
  pinnedTaskIds = [],
  pinnedOccurrenceIds = []
}) {
  const horizonEnd = endOfDay(addDays(now, schedulingHorizonDays));
  const windows = buildWindows(timeMaps, now, horizonEnd);
  const freeSlots = subtractBusy(windows, busy);
  const pinnedState = buildPinnedSchedulingState({
    pinnedPlacements,
    pinnedOccurrenceIds,
    pinnedTaskIds,
    windows
  });
  const tasksById = buildTaskMap(tasks);
  const parentModeById = buildParentModeMap(tasks);
  const subtaskOrderById = buildSubtaskOrderMap(tasks);
  const sequentialInfoById = buildSequentialInfoMap(
    tasks,
    tasksById,
    parentModeById,
    subtaskOrderById
  );
  const { sorted: candidates, ignored, immediatelyUnscheduled } = buildScheduleCandidates(
    tasks,
    now,
    horizonEnd,
    { pinnedTaskIds: pinnedState.pinnedTaskIdSet }
  );

  const sortedCandidates = sortCandidates(
    candidates,
    parentModeById,
    subtaskOrderById,
    sequentialInfoById
  );

  const { scheduled, unscheduled, deferred } = runSchedulingLoop({
    sortedCandidates,
    slots: pinnedState.slots,
    now,
    busy,
    sequentialInfoById,
    pinnedState,
    initialUnscheduled: immediatelyUnscheduled,
    handleSequentialTask,
    placeTaskInSlots,
    getAvailableSlotsForTask,
    applyPlacementsToSlots,
    buildSequentialState
  });

  return {
    scheduled,
    unscheduled: Array.from(unscheduled),
    ignored: Array.from(ignored),
    deferred: Array.from(deferred),
    freeSlotsCount: freeSlots.length
  };
}
