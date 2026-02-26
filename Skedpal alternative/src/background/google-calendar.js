import {
  CALENDAR_COLOR_OVERRIDES,
  DEFAULT_CALENDAR_IDS,
  GOOGLE_API_BASE,
  HTTP_STATUS_GONE,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_UNAUTHORIZED,
  THREE,
  TWO_THOUSAND_FIVE_HUNDRED
} from "../constants.js";

function parseIsoDate(value) {
  if (!value) {return null;}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return null;}
  return date;
}

export function parseAllDayDate(value) {
  if (!value) {return null;}
  const parts = String(value).split("-").map((part) => Number(part));
  if (parts.length !== THREE || parts.some((part) => !Number.isFinite(part))) {return null;}
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function parseGoogleEventTime(time) {
  if (!time) {return null;}
  if (time.dateTime) {return parseIsoDate(time.dateTime);}
  if (time.date) {return parseAllDayDate(time.date);}
  return null;
}

function resolveEventColor(event, calendarId) {
  const colorId = event?.colorId || "";
  const colorHex = CALENDAR_COLOR_OVERRIDES[calendarId] || "";
  return { colorId, colorHex };
}

function normalizeCancelledEvent(event, calendarId, includeCancelled) {
  if (event.status !== "cancelled") {return null;}
  if (!includeCancelled || !event.id) {return null;}
  return { id: event.id, calendarId, cancelled: true };
}

function normalizeTimedEvent(event, calendarId) {
  const start = parseGoogleEventTime(event.start);
  const end = parseGoogleEventTime(event.end);
  if (!start || !end || end <= start) {return null;}
  const { colorId, colorHex } = resolveEventColor(event, calendarId);
  const allDay = Boolean(event?.start?.date || event?.end?.date);
  return {
    id: event.id || "",
    calendarId,
    colorId,
    colorHex,
    title: event.summary || "Busy",
    link: event.htmlLink || "",
    extendedProperties: event.extendedProperties || null,
    allDay,
    isBlocking: event?.transparency !== "transparent",
    start,
    end,
    source: "external"
  };
}

export function normalizeGoogleEvent(event, calendarId, options = {}) {
  if (!event) {return null;}
  const cancelled = normalizeCancelledEvent(event, calendarId, options.includeCancelled);
  if (cancelled) {return cancelled;}
  if (event.status === "cancelled") {return null;}
  return normalizeTimedEvent(event, calendarId);
}

export function normalizeBusyBlocks(calendarId, busyRanges = []) {
  return busyRanges
    .map((range) => {
      const start = parseIsoDate(range?.start);
      const end = parseIsoDate(range?.end);
      if (!start || !end || end <= start) {return null;}
      return { calendarId, start, end };
    })
    .filter(Boolean);
}

function getCalendarIds(overrides) {
  if (overrides !== null && overrides !== undefined) {
    return Array.isArray(overrides) ? overrides.filter(Boolean) : [];
  }
  return DEFAULT_CALENDAR_IDS;
}

function getIdentityApi() {
  return globalThis.chrome?.identity || null;
}

function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    const identity = getIdentityApi();
    if (!identity?.getAuthToken) {
      reject(new Error("chrome.identity API not available"));
      return;
    }
    identity.getAuthToken({ interactive }, (token) => {
      if (identity.lastError) {
        reject(new Error(identity.lastError.message || "OAuth token error"));
        return;
      }
      if (!token) {
        reject(new Error("Missing OAuth token"));
        return;
      }
      resolve(token);
    });
  });
}

function removeCachedToken(token) {
  const identity = getIdentityApi();
  if (!identity?.removeCachedAuthToken || !token) {return;}
  identity.removeCachedAuthToken({ token }, () => {});
}

async function clearCachedAuthTokens() {
  const identity = getIdentityApi();
  if (!identity) {return false;}
  if (typeof identity.clearAllCachedAuthTokens === "function") {
    await new Promise((resolve) => identity.clearAllCachedAuthTokens(() => resolve()));
    return true;
  }
  try {
    const token = await getAuthToken(false);
    removeCachedToken(token);
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchWithAuth(url, options = {}) {
  const token = await getAuthToken(true);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
  if (response.status === HTTP_STATUS_UNAUTHORIZED || response.status === HTTP_STATUS_FORBIDDEN) {
    removeCachedToken(token);
    const retryToken = await getAuthToken(true);
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${retryToken}`
      }
    });
  }
  return response;
}

function appendExtendedPropertyFilters(params, filters) {
  if (!filters) {return;}
  const list = Array.isArray(filters) ? filters : [filters];
  list.filter(Boolean).forEach((filter) => {
    params.append("privateExtendedProperty", filter);
  });
}

const DEFAULT_EVENTS_FIELDS =
  "items(id,summary,htmlLink,start,end,updated,colorId,status,extendedProperties,transparency),nextPageToken,nextSyncToken";

function buildEventsParams(timeMin, timeMax, options, pageToken) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(TWO_THOUSAND_FIVE_HUNDRED),
    fields: options.fields || DEFAULT_EVENTS_FIELDS
  });
  appendExtendedPropertyFilters(params, options.privateExtendedProperty);
  if (options.syncToken) {
    params.set("syncToken", options.syncToken);
  }
  if (options.includeCancelled || options.syncToken) {
    params.set("showDeleted", "true");
  }
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  return params;
}

async function fetchEventsPage(calendarId, params, hasSyncToken) {
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const response = await fetchWithAuth(url, { method: "GET" });
  if (response.status === HTTP_STATUS_GONE && hasSyncToken) {
    await response.text().catch(() => "");
    return { reset: true, data: null };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar events error (${response.status}): ${text}`);
  }
  const data = await response.json();
  return { reset: false, data };
}

async function fetchPagedEvents(calendarId, timeMin, timeMax, options = {}) {
  const events = [];
  let pageToken = "";
  let nextSyncToken = "";
  do {
    const params = buildEventsParams(timeMin, timeMax, options, pageToken);
    const { reset, data } = await fetchEventsPage(
      calendarId,
      params,
      Boolean(options.syncToken)
    );
    if (reset) {
      return { events: [], nextSyncToken: "", reset: true };
    }
    (data.items || []).forEach((event) => {
      const normalized = normalizeGoogleEvent(event, calendarId, {
        includeCancelled: options.includeCancelled || Boolean(options.syncToken)
      });
      if (normalized) {events.push(normalized);}
    });
    pageToken = data.nextPageToken || "";
    if (data.nextSyncToken) {nextSyncToken = data.nextSyncToken;}
  } while (pageToken);
  return { events, nextSyncToken, reset: false };
}

async function fetchCalendarEventsForId({
  calendarId,
  timeMin,
  timeMax,
  privateExtendedProperty,
  syncToken,
  includeCancelled,
  fields
}) {
  const options = {
    privateExtendedProperty,
    syncToken,
    includeCancelled: includeCancelled || Boolean(syncToken),
    fields
  };
  let pageResult = await fetchPagedEvents(calendarId, timeMin, timeMax, options);
  if (pageResult.reset && syncToken) {
    pageResult = await fetchPagedEvents(calendarId, timeMin, timeMax, {
      ...options,
      syncToken: ""
    });
  }
  return pageResult;
}

export async function fetchCalendarEvents({
  timeMin,
  timeMax,
  calendarIds = null,
  privateExtendedProperty = null,
  syncTokensByCalendar = null,
  includeCancelled = false,
  includeSyncTokens = false,
  fields = ""
}) {
  const ids = getCalendarIds(calendarIds);
  const events = [];
  const deletedEvents = [];
  const nextTokens = {};
  const requestedTokens =
    syncTokensByCalendar && typeof syncTokensByCalendar === "object"
      ? syncTokensByCalendar
      : null;
  const isIncremental = Boolean(requestedTokens);
  for (const calendarId of ids) {
    const syncToken = requestedTokens?.[calendarId] || "";
    const pageResult = await fetchCalendarEventsForId({
      calendarId,
      timeMin,
      timeMax,
      privateExtendedProperty,
      syncToken,
      includeCancelled,
      fields
    });
    if (pageResult.nextSyncToken) {
      nextTokens[calendarId] = pageResult.nextSyncToken;
    }
    (pageResult.events || []).forEach((event) => {
      if (event.cancelled) {
        deletedEvents.push({ id: event.id, calendarId });
        return;
      }
      events.push(event);
    });
  }
  if (!includeSyncTokens) {
    return events;
  }
  return {
    events,
    deletedEvents,
    syncTokensByCalendar: nextTokens,
    isIncremental
  };
}

export function normalizeBusyBlocksFromEvents(events = []) {
  return (events || [])
    .map((event) => {
      if (!event || event.allDay || event.isBlocking === false) {return null;}
      const start = parseIsoDate(event.start);
      const end = parseIsoDate(event.end);
      if (!start || !end || end <= start) {return null;}
      return {
        calendarId: event.calendarId || "",
        start,
        end
      };
    })
    .filter(Boolean);
}

export async function fetchTimedBusy({
  timeMin,
  timeMax,
  calendarIds = null
}) {
  const events = await fetchCalendarEvents({
    timeMin,
    timeMax,
    calendarIds
  });
  return normalizeBusyBlocksFromEvents(events);
}

export async function deleteCalendarEvent(calendarId, eventId) {
  if (!calendarId || !eventId) {
    throw new Error("Missing calendarId or eventId");
  }
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithAuth(url, { method: "DELETE" });
  if (response.status === HTTP_STATUS_GONE || response.status === HTTP_STATUS_NOT_FOUND) {
    return true;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar delete error (${response.status}): ${text}`);
  }
  return true;
}

function buildUpdateEventPayload(start, end, options = {}) {
  const payload = {
    start: { dateTime: start },
    end: { dateTime: end }
  };
  if (Object.prototype.hasOwnProperty.call(options, "title")) {
    payload.summary = options.title || "";
  }
  if (options?.colorId) {
    payload.colorId = options.colorId;
  }
  return payload;
}

export async function updateCalendarEvent(calendarId, eventId, start, end, options = {}) {
  if (!calendarId || !eventId || !start || !end) {
    throw new Error("Missing calendar update data");
  }
  const payload = buildUpdateEventPayload(start, end, options);
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithAuth(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar update error (${response.status}): ${text}`);
  }
  return true;
}

function buildCreateEventPayload(title, start, end, options = {}) {
  const extendedProperties = options.extendedProperties || null;
  const description = options.description || "";
  const colorId = options.colorId || "";
  return {
    summary: title || "",
    start: { dateTime: start },
    end: { dateTime: end },
    description,
    ...(extendedProperties ? { extendedProperties } : {}),
    ...(colorId ? { colorId } : {})
  };
}

export async function createCalendarEvent(calendarId, title, start, end, options = {}) {
  if (!calendarId || !start || !end) {
    throw new Error("Missing calendar create data");
  }
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const payload = buildCreateEventPayload(title, start, end, options);
  const response = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar create error (${response.status}): ${text}`);
  }
  const data = await response.json();
  return normalizeGoogleEvent(data, calendarId);
}

export async function fetchCalendarList() {
  const params = new URLSearchParams({
    minAccessRole: "reader",
    showHidden: "false"
  });
  const response = await fetchWithAuth(
    `${GOOGLE_API_BASE}/users/me/calendarList?${params}`,
    { method: "GET" }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar list error (${response.status}): ${text}`);
  }
  const data = await response.json();
  return (data.items || []).map((entry) => ({
    id: entry.id || "",
    summary: entry.summary || "",
    primary: Boolean(entry.primary),
    accessRole: entry.accessRole || "",
    backgroundColor: entry.backgroundColor || "",
    foregroundColor: entry.foregroundColor || ""
  }));
}

export async function fetchFreeBusy({
  timeMin,
  timeMax,
  calendarIds = null
}) {
  const ids = getCalendarIds(calendarIds);
  const response = await fetchWithAuth(`${GOOGLE_API_BASE}/freeBusy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: ids.map((id) => ({ id }))
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar freeBusy error (${response.status}): ${text}`);
  }
  const data = await response.json();
  const calendars = data.calendars || {};
  const busy = [];
  Object.entries(calendars).forEach(([calendarId, details]) => {
    busy.push(...normalizeBusyBlocks(calendarId, details?.busy || []));
  });
  return busy;
}

export { DEFAULT_CALENDAR_IDS, clearCachedAuthTokens };
