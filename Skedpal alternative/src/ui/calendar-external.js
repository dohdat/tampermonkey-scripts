import { state } from "./state/page-state.js";

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

export function getExternalEventsForRange(range) {
  const key = buildRangeKey(range);
  if (!key || state.calendarExternalRangeKey !== key) {return [];}
  return state.calendarExternalEvents || [];
}

export async function ensureExternalEvents(range) {
  const key = buildRangeKey(range);
  if (!key) {return false;}
  if (state.calendarExternalRangeKey === key) {return false;}
  if (state.calendarExternalPendingKey === key) {return false;}
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = key;
    return false;
  }
  state.calendarExternalPendingKey = key;
  try {
    const response = await new Promise((resolve, reject) => {
      runtime.sendMessage(
        { type: "calendar-events", timeMin: range.start.toISOString(), timeMax: range.end.toISOString() },
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
    return true;
  } catch (error) {
    console.warn("Failed to fetch external calendar events.", error);
    state.calendarExternalEvents = [];
    state.calendarExternalRangeKey = key;
    return true;
  } finally {
    if (state.calendarExternalPendingKey === key) {
      state.calendarExternalPendingKey = "";
    }
  }
}
