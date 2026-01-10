import { state } from "./state/page-state.js";

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

function setExternalRange(range) {
  state.calendarExternalRange = range
    ? { start: new Date(range.start), end: new Date(range.end) }
    : null;
}

function setEmptyExternalState(range, key) {
  state.calendarExternalEvents = [];
  setExternalRange(range);
  state.calendarExternalRangeKey = key;
}

export function getExternalEventsForRange(range) {
  const fetched = state.calendarExternalRange;
  if (!fetched?.start || !fetched?.end || !range?.start || !range?.end) {return [];}
  if (range.end <= fetched.start || range.start >= fetched.end) {return [];}
  return (state.calendarExternalEvents || []).filter(
    (event) => event.end > range.start && event.start < range.end
  );
}

export function invalidateExternalEventsCache() {
  state.calendarExternalRangeKey = "";
  state.calendarExternalPendingKey = "";
  state.calendarExternalEvents = [];
  state.calendarExternalRange = null;
  pendingFetches.clear();
}

export async function syncExternalEventsCache(events) {
  state.calendarExternalEvents = coerceEvents(events || []);
  return true;
}

export async function primeExternalEventsOnLoad() {
  return false;
}

export async function hydrateExternalEvents(_range) {
  return false;
}

export async function ensureExternalEvents(range) {
  const calendarIds = getSelectedCalendarIds();
  const key = buildRangeKey(range, calendarIds);
  if (shouldSkipFetch(key)) {return false;}
  if (state.calendarExternalRangeKey === key) {return false;}
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    setEmptyExternalState(range, key);
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
    state.calendarExternalEvents = normalized;
    setExternalRange(range);
    state.calendarExternalRangeKey = key;
    return true;
  } catch (error) {
    console.warn("Failed to fetch external calendar events.", error);
    setEmptyExternalState(range, key);
    return true;
  } finally {
    pendingFetches.delete(key);
    if (state.calendarExternalPendingKey === key) {
      state.calendarExternalPendingKey = "";
    }
  }
}
