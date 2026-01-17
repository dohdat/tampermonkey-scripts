import {
  getCalendarCacheEntry,
  saveCalendarCacheEntry,
  deleteCalendarCacheEntry,
  saveTask
} from "../data/db.js";
import {
  CALENDAR_EVENTS_CACHE_PREFIX,
  CALENDAR_EXTERNAL_BUFFER_HOURS,
  CALENDAR_EXTERNAL_CACHE_TTL_MS,
  CALENDAR_EXTERNAL_PREFETCH_DELAY_MS,
  MS_PER_DAY,
  MS_PER_HOUR
} from "../constants.js";
import { state } from "./state/page-state.js";
import {
  buildCalendarTaskUpdates,
  getCalendarTaskCalendarIds
} from "./calendar-task-import.js";
import { getCalendarSyncSettings } from "./utils.js";

const pendingFetches = new Set();
const memoryCache = new Map();
let fetchChain = Promise.resolve();
let prefetchTimeoutId = null;

function buildCalendarIdsKey(calendarIds) {
  if (!Array.isArray(calendarIds)) {return "all";}
  return calendarIds.filter(Boolean).sort().join(",") || "none";
}

function buildCacheKey(range, viewMode, calendarIds) {
  if (!range?.start || !range?.end) {return "";}
  const idsKey = buildCalendarIdsKey(calendarIds);
  const mode = viewMode || "week";
  return `${CALENDAR_EVENTS_CACHE_PREFIX}${mode}:${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
}

function normalizeRange(range) {
  if (!range?.start || !range?.end) {return null;}
  const start = range.start instanceof Date ? range.start : new Date(range.start);
  const end = range.end instanceof Date ? range.end : new Date(range.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
  return { start, end, days: range.days };
}

function buildBufferedRange(range) {
  const normalized = normalizeRange(range);
  if (!normalized) {return null;}
  const bufferMs = CALENDAR_EXTERNAL_BUFFER_HOURS * MS_PER_HOUR;
  return {
    start: new Date(normalized.start.getTime() - bufferMs),
    end: new Date(normalized.end.getTime() + bufferMs),
    days: normalized.days
  };
}

function serializeEvent(event) {
  if (!event) {return null;}
  const start = event.start instanceof Date ? event.start.toISOString() : event.start;
  const end = event.end instanceof Date ? event.end.toISOString() : event.end;
  if (!start || !end) {return null;}
  return { ...event, start, end };
}

function serializeEvents(events) {
  return (events || []).map(serializeEvent).filter(Boolean);
}

function coerceEvents(events) {
  return (events || [])
    .map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
      return {
        ...event,
        start,
        end,
        source: "external"
      };
    })
    .filter(Boolean);
}

function normalizeCacheEntry(entry) {
  if (!entry?.key || !entry.range?.start || !entry.range?.end) {return null;}
  const range = normalizeRange(entry.range);
  if (!range) {return null;}
  return {
    ...entry,
    range,
    events: coerceEvents(entry.events || [])
  };
}

async function getCacheEntry(key) {
  if (!key) {return null;}
  if (memoryCache.has(key)) {return memoryCache.get(key);}
  const entry = await getCalendarCacheEntry(key);
  const normalized = normalizeCacheEntry(entry);
  if (normalized) {
    memoryCache.set(key, normalized);
  }
  return normalized;
}

function isCacheFresh(entry) {
  if (!entry?.updatedAt) {return false;}
  const updatedAt = new Date(entry.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {return false;}
  const bustedAt = state.calendarExternalCacheBustedAt
    ? new Date(state.calendarExternalCacheBustedAt)
    : null;
  if (bustedAt && !Number.isNaN(bustedAt.getTime()) && updatedAt <= bustedAt) {
    return false;
  }
  return Date.now() - updatedAt.getTime() < CALENDAR_EXTERNAL_CACHE_TTL_MS;
}

function setExternalRange(range) {
  state.calendarExternalRange = range
    ? { start: new Date(range.start), end: new Date(range.end), days: range.days }
    : null;
}

function setExternalStateFromCache(entry) {
  if (!entry) {return;}
  const treatedCalendarIds = getCalendarTaskCalendarIds(state.settingsCache);
  const events = Array.isArray(entry.events) ? entry.events : [];
  state.calendarExternalEvents = events.filter(
    (event) => !treatedCalendarIds.has(event.calendarId)
  );
  setExternalRange(entry.range);
  state.calendarExternalRangeKey = entry.key;
}

function setEmptyExternalState(range, key) {
  state.calendarExternalEvents = [];
  setExternalRange(range);
  state.calendarExternalRangeKey = key;
}

function getRuntime() {
  return globalThis.chrome?.runtime || null;
}

function getSelectedCalendarIds() {
  const selected = Array.isArray(state.settingsCache?.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : null;
  if (!selected) {return null;}
  const syncSettings = getCalendarSyncSettings(state.settingsCache);
  const hiddenIds = new Set(
    Object.entries(syncSettings)
      .filter(([, entry]) => entry?.syncScheduledEvents)
      .map(([calendarId]) => calendarId)
  );
  return selected.filter((id) => !hiddenIds.has(id));
}

function shouldSkipFetch(key) {
  return !key || pendingFetches.has(key) || state.calendarExternalPendingKey === key;
}

function buildEventKey(event) {
  if (!event?.id || !event?.calendarId) {return "";}
  return `${event.calendarId}:${event.id}`;
}

function mergeEventUpdates(baseEvents, updates, deletedEvents, range) {
  const map = new Map();
  (baseEvents || []).forEach((event) => {
    const key = buildEventKey(event);
    if (key) {
      map.set(key, event);
    }
  });
  (deletedEvents || []).forEach((entry) => {
    if (!entry?.id || !entry?.calendarId) {return;}
    map.delete(`${entry.calendarId}:${entry.id}`);
  });
  (updates || []).forEach((event) => {
    const key = buildEventKey(event);
    if (!key) {return;}
    map.set(key, event);
  });
  const merged = Array.from(map.values());
  if (!range?.start || !range?.end) {return merged;}
  return merged.filter((event) => event.end > range.start && event.start < range.end);
}

async function saveCacheEntry(entry) {
  if (!entry?.key) {return;}
  memoryCache.set(entry.key, entry);
  await saveCalendarCacheEntry({
    key: entry.key,
    viewMode: entry.viewMode,
    calendarIdsKey: entry.calendarIdsKey,
    range: {
      start: entry.range.start.toISOString(),
      end: entry.range.end.toISOString()
    },
    events: serializeEvents(entry.events),
    syncTokensByCalendar: entry.syncTokensByCalendar || {},
    updatedAt: entry.updatedAt
  });
}

function enqueueFetch(task) {
  const next = fetchChain.then(task, task);
  fetchChain = next.catch(() => {});
  return next;
}

function getRangeDays(range) {
  if (Number.isFinite(range?.days) && range.days > 0) {return range.days;}
  if (!range?.start || !range?.end) {return 1;}
  const ms = range.end.getTime() - range.start.getTime();
  return Math.max(1, Math.round(ms / MS_PER_DAY));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildAdjacentRange(range, offsetDays) {
  if (!range?.start || !range?.end) {return null;}
  return {
    start: addDays(range.start, offsetDays),
    end: addDays(range.end, offsetDays),
    days: range.days
  };
}

function schedulePrefetch(range, viewMode) {
  if (!range?.start || !range?.end) {return;}
  if (prefetchTimeoutId) {
    clearTimeout(prefetchTimeoutId);
  }
  prefetchTimeoutId = setTimeout(() => {
    prefetchTimeoutId = null;
    const rangeDays = getRangeDays(range);
    const nextRange = buildAdjacentRange(range, rangeDays);
    if (nextRange) {
      void prefetchExternalEvents(nextRange, viewMode);
    }
  }, CALENDAR_EXTERNAL_PREFETCH_DELAY_MS);
}

async function requestExternalEvents(runtime, payload) {
  return new Promise((resolve, reject) => {
    runtime.sendMessage(payload, (resp) => {
      if (runtime.lastError) {
        reject(new Error(runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
}

async function syncCalendarTasksFromEvents(events) {
  const tasksToSync = coerceEvents(events || []);
  const { tasksToSave } = buildCalendarTaskUpdates({
    events: tasksToSync,
    settings: state.settingsCache,
    tasks: state.tasksCache
  });
  if (!tasksToSave.length) {return;}
  await Promise.all(tasksToSave.map((task) => saveTask(task)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("skedpal:tasks-updated"));
  }
}

function filterExternalEventsForDisplay(events) {
  const treatedCalendarIds = getCalendarTaskCalendarIds(state.settingsCache);
  return (events || []).filter((event) => !treatedCalendarIds.has(event.calendarId));
}

function prepareExternalFetchState({
  fetchRange,
  key,
  existingEntry,
  allowStateUpdate
}) {
  if (!allowStateUpdate) {return;}
  state.calendarExternalRangeKey = key;
  setExternalRange(fetchRange);
  if (!existingEntry) {
    state.calendarExternalEvents = [];
  }
  state.calendarExternalPendingKey = key;
}

function filterEventsForRange(events, range) {
  if (!range?.start || !range?.end) {return [];}
  return (events || []).filter((event) => event.end > range.start && event.start < range.end);
}

function hasExternalRangeOverlap(range) {
  if (!state.calendarExternalRange?.start || !state.calendarExternalRange?.end) {return false;}
  return (
    state.calendarExternalRange.end > range.start &&
    state.calendarExternalRange.start < range.end
  );
}

function resolveCachedStateUsage(cached, key) {
  const hasStateEvents = Array.isArray(state.calendarExternalEvents)
    ? state.calendarExternalEvents.length > 0
    : false;
  const cacheIsFresh = Boolean(cached) && isCacheFresh(cached);
  const shouldApply =
    Boolean(cached) &&
    state.calendarExternalRangeKey !== key &&
    (cacheIsFresh || !hasStateEvents);
  return { cacheIsFresh, shouldApply };
}

export function getExternalEventsForRange(range, viewMode = "week") {
  if (!range?.start || !range?.end) {return [];}
  const buffered = buildBufferedRange(range);
  const key = buildCacheKey(buffered, viewMode, getSelectedCalendarIds());
  const matchesKey = key && state.calendarExternalRangeKey === key;
  const overlaps = hasExternalRangeOverlap(range);
  const events = state.calendarExternalEvents || [];
  if (matchesKey || overlaps) {
    return filterEventsForRange(events, range);
  }
  if (!events.length) {return [];}
  return filterEventsForRange(events, range);
}

export function invalidateExternalEventsCache() {
  state.calendarExternalRangeKey = "";
  state.calendarExternalPendingKey = "";
  state.calendarExternalEvents = [];
  state.calendarExternalRange = null;
  state.calendarExternalCacheBustedAt = "";
  memoryCache.clear();
  pendingFetches.clear();
  if (prefetchTimeoutId) {
    clearTimeout(prefetchTimeoutId);
    prefetchTimeoutId = null;
  }
}

export async function syncExternalEventsCache(events) {
  state.calendarExternalEvents = coerceEvents(events || []);
  const key = state.calendarExternalRangeKey;
  if (!key || !state.calendarExternalRange) {return true;}
  const cached = await getCacheEntry(key);
  const entry = {
    key,
    viewMode: cached?.viewMode || "week",
    calendarIdsKey: cached?.calendarIdsKey || buildCalendarIdsKey(getSelectedCalendarIds()),
    range: state.calendarExternalRange,
    events: state.calendarExternalEvents,
    syncTokensByCalendar: cached?.syncTokensByCalendar || {},
    updatedAt: new Date().toISOString()
  };
  await saveCacheEntry(entry);
  return true;
}

export function markExternalEventsCacheDirty() {
  state.calendarExternalCacheBustedAt = new Date().toISOString();
}

export async function primeExternalEventsOnLoad(range, viewMode = "week") {
  if (!range?.start || !range?.end) {return false;}
  return hydrateExternalEvents(range, viewMode);
}

export async function hydrateExternalEvents(range, viewMode = "week") {
  const buffered = buildBufferedRange(range);
  const key = buildCacheKey(buffered, viewMode, getSelectedCalendarIds());
  if (!key || state.calendarExternalRangeKey === key) {return false;}
  const cached = await getCacheEntry(key);
  if (!cached || !isCacheFresh(cached)) {return false;}
  setExternalStateFromCache(cached);
  return true;
}

async function applyExternalEventsUpdate({
  fetchRange,
  viewMode,
  calendarIdsKey,
  existingEntry,
  response,
  allowStateUpdate
}) {
  const updatedAt = new Date().toISOString();
  const updates = coerceEvents(response.events || []);
  const deletedEvents = response.deletedEvents || [];
  const baseEvents = existingEntry?.events || [];
  const mergedEvents = response.isIncremental
    ? mergeEventUpdates(baseEvents, updates, deletedEvents, fetchRange)
    : updates.filter((event) => event.end > fetchRange.start && event.start < fetchRange.end);
  const entry = {
    key: existingEntry?.key || buildCacheKey(fetchRange, viewMode, getSelectedCalendarIds()),
    viewMode,
    calendarIdsKey,
    range: fetchRange,
    events: mergedEvents,
    syncTokensByCalendar: response.syncTokensByCalendar || {},
    updatedAt
  };
  await saveCacheEntry(entry);
  if (allowStateUpdate && state.calendarExternalRangeKey === entry.key) {
    setExternalStateFromCache(entry);
  }
  return entry;
}

function handleExternalFetchUnavailable(fetchRange, key, allowStateUpdate) {
  if (allowStateUpdate) {
    setEmptyExternalState(fetchRange, key);
  }
  return { updated: false };
}

function handleExternalFetchFailure(fetchRange, key, allowStateUpdate) {
  if (allowStateUpdate) {
    setEmptyExternalState(fetchRange, key);
  }
  return { updated: true };
}

function assertExternalResponseOk(response) {
  if (!response?.ok) {
    throw new Error(response?.error || "Calendar events fetch failed");
  }
  return response;
}

async function fetchExternalEvents({
  range,
  viewMode,
  calendarIds,
  existingEntry,
  allowStateUpdate
}) {
  const runtime = getRuntime();
  const fetchRange = buildBufferedRange(range);
  const calendarIdsKey = buildCalendarIdsKey(calendarIds);
  const key = buildCacheKey(fetchRange, viewMode, calendarIds);
  if (!runtime?.sendMessage || !fetchRange) {
    return handleExternalFetchUnavailable(fetchRange, key, allowStateUpdate);
  }
  prepareExternalFetchState({ fetchRange, key, existingEntry, allowStateUpdate });
  pendingFetches.add(key);
  try {
    const response = assertExternalResponseOk(await requestExternalEvents(runtime, {
      type: "calendar-events",
      timeMin: fetchRange.start.toISOString(),
      timeMax: fetchRange.end.toISOString(),
      calendarIds,
      syncTokensByCalendar: existingEntry?.syncTokensByCalendar || {}
    }));
    const updatedEntry = await applyExternalEventsUpdate({
      fetchRange,
      viewMode,
      calendarIdsKey,
      existingEntry,
      response,
      allowStateUpdate
    });
    await syncCalendarTasksFromEvents(response.events);
    if (allowStateUpdate && state.calendarExternalRangeKey === updatedEntry.key) {
      state.calendarExternalEvents = filterExternalEventsForDisplay(updatedEntry.events);
    }
    return { updated: true };
  } catch (error) {
    console.warn("Failed to fetch external calendar events.", error);
    return handleExternalFetchFailure(fetchRange, key, allowStateUpdate);
  } finally {
    pendingFetches.delete(key);
    if (state.calendarExternalPendingKey === key) {state.calendarExternalPendingKey = "";}
  }
}

async function prefetchExternalEvents(range, viewMode) {
  const calendarIds = getSelectedCalendarIds();
  const fetchRange = buildBufferedRange(range);
  if (!fetchRange) {return false;}
  const key = buildCacheKey(fetchRange, viewMode, calendarIds);
  if (shouldSkipFetch(key)) {return false;}
  const cached = await getCacheEntry(key);
  if (cached && isCacheFresh(cached)) {return false;}
  await enqueueFetch(() =>
    fetchExternalEvents({
      range,
      viewMode,
      calendarIds,
      existingEntry: cached,
      allowStateUpdate: false
    })
  );
  return true;
}

export async function ensureExternalEvents(range, viewMode = "week") {
  const calendarIds = getSelectedCalendarIds();
  const fetchRange = buildBufferedRange(range);
  if (!fetchRange) {return false;}
  const key = buildCacheKey(fetchRange, viewMode, calendarIds);
  if (shouldSkipFetch(key)) {return false;}

  let stateUpdated = false;
  const cached = await getCacheEntry(key);
  const { cacheIsFresh, shouldApply } = resolveCachedStateUsage(cached, key);
  if (shouldApply) {
    setExternalStateFromCache(cached);
    stateUpdated = true;
  }
  if (cacheIsFresh) {
    schedulePrefetch(range, viewMode);
    return stateUpdated;
  }

  const result = await enqueueFetch(() =>
    fetchExternalEvents({
      range,
      viewMode,
      calendarIds,
      existingEntry: cached,
      allowStateUpdate: true
    })
  );
  schedulePrefetch(range, viewMode);
  return Boolean(result?.updated) || stateUpdated;
}

export async function refreshExternalEvents(range, viewMode = "week", options = {}) {
  const calendarIds = getSelectedCalendarIds();
  const fetchRange = buildBufferedRange(range);
  if (!fetchRange) {return false;}
  const key = buildCacheKey(fetchRange, viewMode, calendarIds);
  if (shouldSkipFetch(key)) {return false;}
  const cached = await getCacheEntry(key);
  const result = await enqueueFetch(() =>
    fetchExternalEvents({
      range,
      viewMode,
      calendarIds,
      existingEntry: cached,
      allowStateUpdate: Boolean(options.allowStateUpdate)
    })
  );
  return Boolean(result?.updated);
}

export async function removeExternalEventsCacheEntry(key) {
  if (!key) {return false;}
  memoryCache.delete(key);
  await deleteCalendarCacheEntry(key);
  return true;
}
