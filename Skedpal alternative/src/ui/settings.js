import {
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../data/db.js";
import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { normalizeHorizonDays } from "./utils.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";

const {
  horizonInput,
  googleCalendarConnectBtn,
  googleCalendarRefreshBtn,
  googleCalendarDisconnectBtn,
  googleCalendarStatus,
  googleCalendarList
} = domRefs;

function getRuntime() {
  return globalThis.chrome?.runtime || null;
}

function setCalendarStatus(message) {
  if (!googleCalendarStatus) {return;}
  googleCalendarStatus.textContent = message;
}

function formatCalendarMeta(entry) {
  const parts = [];
  if (entry.primary) {parts.push("Primary");}
  if (entry.accessRole) {parts.push(entry.accessRole);}
  if (entry.id) {parts.push(entry.id);}
  return parts.filter(Boolean).join(" | ");
}

function buildCalendarRow(entry, selectedIds, onChange) {
  const row = document.createElement("label");
  row.className =
    "flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200 transition hover:border-lime-400/60";
  row.setAttribute("data-test-skedpal", "google-calendar-row");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "mt-1 h-4 w-4 accent-lime-400";
  checkbox.value = entry.id || "";
  checkbox.dataset.calendarId = entry.id || "";
  checkbox.checked = selectedIds.includes(entry.id);
  checkbox.setAttribute("data-test-skedpal", "google-calendar-checkbox");
  checkbox.addEventListener("change", onChange);

  const color = document.createElement("span");
  color.className = "mt-1 h-3 w-3 rounded-full border border-slate-700";
  color.setAttribute("data-test-skedpal", "google-calendar-color");
  if (entry.backgroundColor) {
    color.style.backgroundColor = entry.backgroundColor;
  }

  const details = document.createElement("div");
  details.className = "flex flex-col";
  details.setAttribute("data-test-skedpal", "google-calendar-details");

  const name = document.createElement("span");
  name.className = "text-sm font-semibold text-slate-100";
  name.textContent = entry.summary || entry.id || "Untitled calendar";
  name.setAttribute("data-test-skedpal", "google-calendar-name");

  const meta = document.createElement("span");
  meta.className = "text-xs text-slate-400";
  meta.textContent = formatCalendarMeta(entry);
  meta.setAttribute("data-test-skedpal", "google-calendar-meta");

  details.appendChild(name);
  details.appendChild(meta);
  row.appendChild(checkbox);
  row.appendChild(color);
  row.appendChild(details);
  return row;
}

function renderCalendarList(calendars, selectedIds, onChange) {
  if (!googleCalendarList) {return;}
  googleCalendarList.innerHTML = "";
  if (!calendars.length) {
    const empty = document.createElement("div");
    empty.className = "rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400";
    empty.textContent = "No calendars found.";
    empty.setAttribute("data-test-skedpal", "google-calendar-empty");
    googleCalendarList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  calendars.forEach((entry) => {
    fragment.appendChild(buildCalendarRow(entry, selectedIds, onChange));
  });
  googleCalendarList.appendChild(fragment);
}

async function requestCalendarList() {
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    throw new Error("Chrome runtime unavailable");
  }
  const response = await new Promise((resolve, reject) => {
    runtime.sendMessage({ type: "calendar-list" }, (resp) => {
      if (runtime.lastError) {
        reject(new Error(runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to load calendars");
  }
  return response.calendars || [];
}

async function disconnectCalendar() {
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {
    throw new Error("Chrome runtime unavailable");
  }
  const response = await new Promise((resolve, reject) => {
    runtime.sendMessage({ type: "calendar-disconnect" }, (resp) => {
      if (runtime.lastError) {
        reject(new Error(runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to disconnect");
  }
  return response.cleared;
}

function createSettingsPersistor() {
  const savePromise = (promise) => {
    state.pendingSettingsSave = promise;
    promise.finally(() => {
      if (state.pendingSettingsSave === promise) {
        state.pendingSettingsSave = null;
      }
    });
  };
  const persistSettings = async (partial) => {
    state.settingsCache = { ...state.settingsCache, ...partial };
    const promise = saveSettings(state.settingsCache);
    savePromise(promise);
    await promise;
  };
  const persistSettingsSafely = (partial, message) => {
    void persistSettings(partial).catch((error) => {
      console.warn(message || "Failed to save settings.", error);
    });
  };
  return { persistSettings, persistSettingsSafely };
}

function initHorizonSettings(persistSettings) {
  if (!horizonInput) {return;}
  const min = Number(horizonInput.min) || 1;
  const max = Number(horizonInput.max) || 60;
  const fallback = DEFAULT_SCHEDULING_HORIZON_DAYS;
  const normalizeHorizonInput = () => {
    const days = normalizeHorizonDays(horizonInput.value, min, max, fallback);
    horizonInput.value = String(days);
    return days;
  };
  horizonInput.value = String(
    normalizeHorizonDays(state.settingsCache.schedulingHorizonDays, min, max, fallback)
  );
  const persist = async () => {
    const days = normalizeHorizonInput();
    await persistSettings({ schedulingHorizonDays: days });
  };
  const persistSafely = () =>
    void persist().catch((error) =>
      console.warn("Failed to save horizon setting.", error)
    );
  horizonInput.addEventListener("input", persistSafely);
  horizonInput.addEventListener("change", persistSafely);
}

function initGoogleCalendarSettings(persistSettingsSafely) {
  const initialSelectedIds = Array.isArray(state.settingsCache.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : [];
  if (googleCalendarStatus && initialSelectedIds.length) {
    setCalendarStatus(`Selected ${initialSelectedIds.length} calendar(s).`);
  }
  const handleCalendarSelectionChange = () => {
    if (!googleCalendarList) {return;}
    const ids = [...googleCalendarList.querySelectorAll("input[data-calendar-id]")]
      .filter((input) => input.checked)
      .map((input) => input.value)
      .filter(Boolean);
    persistSettingsSafely(
      { googleCalendarIds: ids },
      "Failed to save calendar selection."
    );
    invalidateExternalEventsCache();
    setCalendarStatus(ids.length ? `Selected ${ids.length} calendar(s).` : "No calendars selected.");
  };
  const handleCalendarConnect = async () => {
    setCalendarStatus("Connecting to Google Calendar...");
    try {
      const calendars = await requestCalendarList();
      const selection = Array.isArray(state.settingsCache.googleCalendarIds)
        ? state.settingsCache.googleCalendarIds
        : [];
      renderCalendarList(calendars, selection, handleCalendarSelectionChange);
      setCalendarStatus(
        calendars.length
          ? `Loaded ${calendars.length} calendar(s).`
          : "No calendars available."
      );
      if (selection.length) {
        setCalendarStatus(
          `Loaded ${calendars.length} calendar(s). Selected ${selection.length}.`
        );
      }
    } catch (error) {
      console.warn("Failed to load Google calendars.", error);
      const message =
        error?.message || "Failed to load calendars. Check sign-in permissions.";
      setCalendarStatus(message);
    }
  };
  const handleCalendarDisconnect = async () => {
    setCalendarStatus("Disconnecting...");
    try {
      await disconnectCalendar();
      renderCalendarList([], [], handleCalendarSelectionChange);
      persistSettingsSafely(
        { googleCalendarIds: [] },
        "Failed to clear calendar selection."
      );
      invalidateExternalEventsCache();
      setCalendarStatus("Disconnected. Connect to load your calendars.");
    } catch (error) {
      console.warn("Failed to disconnect Google Calendar.", error);
      setCalendarStatus("Failed to disconnect. Try again.");
    }
  };
  googleCalendarConnectBtn?.addEventListener("click", handleCalendarConnect);
  googleCalendarRefreshBtn?.addEventListener("click", handleCalendarConnect);
  googleCalendarDisconnectBtn?.addEventListener("click", handleCalendarDisconnect);
}

export async function initSettings(prefetchedSettings) {
  const settings = prefetchedSettings || (await getSettings());
  state.settingsCache = { ...DEFAULT_SETTINGS, ...settings };
  const { persistSettings, persistSettingsSafely } = createSettingsPersistor();
  initHorizonSettings(persistSettings);
  initGoogleCalendarSettings(persistSettingsSafely);
}
