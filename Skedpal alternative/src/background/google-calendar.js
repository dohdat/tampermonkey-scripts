import {
  CALENDAR_COLOR_OVERRIDES,
  DEFAULT_CALENDAR_IDS,
  GOOGLE_API_BASE,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_UNAUTHORIZED,
  THREE
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

export function normalizeGoogleEvent(event, calendarId) {
  if (!event || event.status === "cancelled") {return null;}
  const start = parseGoogleEventTime(event.start);
  const end = parseGoogleEventTime(event.end);
  if (!start || !end || end <= start) {return null;}
  const { colorId, colorHex } = resolveEventColor(event, calendarId);
  return {
    id: event.id || "",
    calendarId,
    colorId,
    colorHex,
    title: event.summary || "Busy",
    link: event.htmlLink || "",
    start,
    end,
    source: "external"
  };
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

async function fetchPagedEvents(calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500"
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const response = await fetchWithAuth(url, { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Calendar events error (${response.status}): ${text}`);
    }
    const data = await response.json();
    (data.items || []).forEach((event) => {
      const normalized = normalizeGoogleEvent(event, calendarId);
      if (normalized) {events.push(normalized);}
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return events;
}

export async function fetchCalendarEvents({
  timeMin,
  timeMax,
  calendarIds = null
}) {
  const ids = getCalendarIds(calendarIds);
  const events = [];
  for (const calendarId of ids) {
    const calendarEvents = await fetchPagedEvents(calendarId, timeMin, timeMax);
    events.push(...calendarEvents);
  }
  return events;
}

export async function deleteCalendarEvent(calendarId, eventId) {
  if (!calendarId || !eventId) {
    throw new Error("Missing calendarId or eventId");
  }
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithAuth(url, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar delete error (${response.status}): ${text}`);
  }
  return true;
}

export async function updateCalendarEvent(calendarId, eventId, start, end) {
  if (!calendarId || !eventId || !start || !end) {
    throw new Error("Missing calendar update data");
  }
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithAuth(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: start },
      end: { dateTime: end }
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar update error (${response.status}): ${text}`);
  }
  return true;
}

export async function createCalendarEvent(calendarId, title, start, end) {
  if (!calendarId || !start || !end) {
    throw new Error("Missing calendar create data");
  }
  const url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: title || "",
      start: { dateTime: start },
      end: { dateTime: end }
    })
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
