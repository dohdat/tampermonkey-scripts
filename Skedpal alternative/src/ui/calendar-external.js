import { state } from "./state/page-state.js";
import {
  deleteCalendarCacheEntry,
  getCalendarCacheEntry,
  saveCalendarCacheEntry
} from "../data/db.js";

const TODAY_TTL_MS = 3 * 60 * 1000;
const FUTURE_TTL_MS = 60 * 60 * 1000;
const PAST_TTL_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map();
const pendingFetches = new Set();

function buildCalendarIdsKey(calendarIds) {
  if (!Array.isArray(calendarIds)) {return "all";}
  return calendarIds.filter(Boolean).sort().join(",") || "none";
}

function buildRangeKey(range, calendarIds) {
  if (!range?.start || !range?.end) {return "";}
  const idsKey = buildCalendarIdsKey(calendarIds);
  return `${range.start.toISOString()}_${range.end.toISOString()}_${idsKey}`;
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

function serializeEvents(events) {
  return (events || []).map((event) => ({
    ...event,
    start: event?.start instanceof Date ? event.start.toISOString() : event.start,
    end: event?.end instanceof Date ? event.end.toISOString() : event.end
  }));
}

function getRuntime() {
  return globalThis.chrome?.runtime || null;
}

function getSelectedCalendarIds() {
  return Array.isArray(state.settingsCache?.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : null;
}

function shouldSkipFetch(key) {
  return !key || pendingFetches.has(key) || state.calendarExternalPendingKey === key;
}

function getCacheTtlMs(range) {
  const now = new Date();
  if (range?.end && range.end < now) {return PAST_TTL_MS;}
  if (range?.start && range.start <= now && range.end && range.end >= now) {
    return TODAY_TTL_MS;
  }
  return FUTURE_TTL_MS;
}

function isCacheStale(entry, range) {
  if (!entry?.fetchedAt) {return true;}
  const ttl = getCacheTtlMs(range);
  return Date.now() - entry.fetchedAt > ttl;
}

function applyCacheEntry(key, entry) {
  if (!entry) {return false;}
  state.calendarExternalEvents = coerceEvents(entry.events);
  state.calendarExternalRangeKey = key;
  return true;
}

async function readCacheEntry(key) {
  if (!key) {return null;}
  if (memoryCache.has(key)) {return memoryCache.get(key);}
  const entry = await getCalendarCacheEntry(key);
  if (entry) {
    memoryCache.set(key, entry);
  }
  return entry;
}

export function getExternalEventsForRange(range) {
  const key = buildRangeKey(range, getSelectedCalendarIds());
  if (!key || state.calendarExternalRangeKey !== key) {return [];}
  return state.calendarExternalEvents || [];
}

export function invalidateExternalEventsCache() {
  state.calendarExternalRangeKey = "";
  state.calendarExternalPendingKey = "";
  state.calendarExternalEvents = [];
  memoryCache.clear();
}

export async function primeExternalEventsOnLoad() {
  return false;
}

export async function hydrateExternalEvents(range) {
  const key = buildRangeKey(range, getSelectedCalendarIds());
  if (!key) {return false;}
  const entry = await readCacheEntry(key);
  if (!entry) {return false;}
  applyCacheEntry(key, entry);
  return true;
}

export async function ensureExternalEvents(range) {
  const calendarIds = getSelectedCalendarIds();
  const key = buildRangeKey(range, calendarIds);
  if (shouldSkipFetch(key)) {return false;}
  const cachedEntry = await readCacheEntry(key);
  if (cachedEntry) {
    applyCacheEntry(key, cachedEntry);
    if (!isCacheStale(cachedEntry, range)) {
      return false;
    }
  }
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = key;
    return false;
  }
  state.calendarExternalPendingKey = key;
  pendingFetches.add(key);
  try {
    const response = await new Promise((resolve, reject) => {
      runtime.sendMessage(
        {
          type: "calendar-events",
          timeMin: range.start.toISOString(),
          timeMax: range.end.toISOString(),
          calendarIds: getSelectedCalendarIds()
        },
        (resp) => {
          if (runtime.lastError) {
            reject(new Error(runtime.lastError.message));
          } else {
            resolve(resp);
          }
        }
      );
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Calendar events fetch failed");
    }
    const normalized = coerceEvents(response.events);
    const entry = {
      key,
      fetchedAt: Date.now(),
      events: serializeEvents(normalized)
    };
    state.calendarExternalEvents = normalized;
    state.calendarExternalRangeKey = key;
    memoryCache.set(key, entry);
    await saveCalendarCacheEntry(entry);
    return true;
  } catch (error) {
    console.warn("Failed to fetch external calendar events.", error);
    if (!cachedEntry) {
      state.calendarExternalEvents = [];
      state.calendarExternalRangeKey = key;
      await deleteCalendarCacheEntry(key);
    }
    return true;
  } finally {
    pendingFetches.delete(key);
    if (state.calendarExternalPendingKey === key) {
      state.calendarExternalPendingKey = "";
    }
  }
}
