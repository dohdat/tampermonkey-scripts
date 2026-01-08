import { state } from "./state/page-state.js";
import { DEFAULT_SCHEDULING_HORIZON_DAYS } from "../data/db.js";

function buildRangeKey(range) {
  if (!range?.start || !range?.end) {return "";}
  return `${range.start.toISOString()}_${range.end.toISOString()}`;
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

function buildHorizonRange() {
  const now = new Date();
  const horizonDays =
    Number(state.settingsCache?.schedulingHorizonDays) || DEFAULT_SCHEDULING_HORIZON_DAYS;
  const end = new Date(now.getTime());
  end.setDate(end.getDate() + horizonDays);
  end.setHours(23, 59, 59, 999);
  return { start: now, end };
}

function getFetchRange(range) {
  return state.calendarExternalAllowFetch ? buildHorizonRange() : range;
}

function getSelectedCalendarIds() {
  return Array.isArray(state.settingsCache?.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : null;
}

function shouldSkipFetch(key) {
  return (
    !key ||
    !state.calendarExternalAllowFetch ||
    state.calendarExternalRangeKey === key ||
    state.calendarExternalPendingKey === key
  );
}

export function getExternalEventsForRange(range) {
  if (!state.calendarExternalAllowFetch && state.calendarExternalEvents?.length) {
    return state.calendarExternalEvents || [];
  }
  const key = buildRangeKey(range);
  if (!key || state.calendarExternalRangeKey !== key) {return [];}
  return state.calendarExternalEvents || [];
}

export function invalidateExternalEventsCache() {
  state.calendarExternalRangeKey = "";
  state.calendarExternalPendingKey = "";
  state.calendarExternalEvents = [];
  state.calendarExternalAllowFetch = true;
}

export async function primeExternalEventsOnLoad() {
  if (
    state.calendarExternalAllowFetch ||
    state.calendarExternalRangeKey ||
    state.calendarExternalPendingKey
  ) {
    return false;
  }
  state.calendarExternalAllowFetch = true;
  return ensureExternalEvents(buildHorizonRange());
}

export async function ensureExternalEvents(range) {
  const effectiveRange = getFetchRange(range);
  const key = buildRangeKey(effectiveRange);
  if (shouldSkipFetch(key)) {return false;}
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = key;
    state.calendarExternalAllowFetch = false;
    return false;
  }
  state.calendarExternalPendingKey = key;
  try {
    const response = await new Promise((resolve, reject) => {
      runtime.sendMessage(
        {
          type: "calendar-events",
          timeMin: effectiveRange.start.toISOString(),
          timeMax: effectiveRange.end.toISOString(),
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
    state.calendarExternalEvents = coerceEvents(response.events);
    state.calendarExternalRangeKey = key;
    state.calendarExternalAllowFetch = false;
    return true;
  } catch (error) {
    console.warn("Failed to fetch external calendar events.", error);
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = key;
    state.calendarExternalAllowFetch = false;
    return true;
  } finally {
    if (state.calendarExternalPendingKey === key) {
      state.calendarExternalPendingKey = "";
    }
  }
}
