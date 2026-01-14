import { getCalendarCacheEntry, saveCalendarCacheEntry } from "../data/db.js";
import { CALENDAR_LIST_CACHE_KEY } from "../constants.js";

function normalizeCalendarEntry(entry) {
  if (!entry || !entry.id) {return null;}
  return {
    id: entry.id,
    summary: entry.summary || "",
    backgroundColor: entry.backgroundColor || ""
  };
}

export async function loadCalendarListCache() {
  const entry = await getCalendarCacheEntry(CALENDAR_LIST_CACHE_KEY);
  const cached = Array.isArray(entry?.value) ? entry.value : [];
  return cached.map(normalizeCalendarEntry).filter(Boolean);
}

export async function saveCalendarListCache(calendars = []) {
  const normalized = (calendars || []).map(normalizeCalendarEntry).filter(Boolean);
  return saveCalendarCacheEntry({
    key: CALENDAR_LIST_CACHE_KEY,
    value: normalized,
    updatedAt: new Date().toISOString()
  });
}
