import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";
import { saveCalendarListCache } from "./calendar-list-cache.js";
import { getSectionName, getSubsectionsFor } from "./sections-data.js";

const {
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

export function updateCalendarStatusFromSettings() {
  const ids = Array.isArray(state.settingsCache.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : [];
  if (ids.length) {
    setCalendarStatus(`Selected ${ids.length} calendar(s).`);
    return;
  }
  setCalendarStatus("Connect to load your calendars.");
}

function formatCalendarMeta(entry) {
  const parts = [];
  if (entry.primary) {parts.push("Primary");}
  if (entry.accessRole) {parts.push(entry.accessRole);}
  if (entry.id) {parts.push(entry.id);}
  return parts.filter(Boolean).join(" | ");
}

function getCalendarTaskSettingsById(settings) {
  const source = settings?.googleCalendarTaskSettings;
  return source && typeof source === "object" ? source : {};
}

function normalizeCalendarTaskSetting(setting) {
  if (!setting || typeof setting !== "object") {
    return { treatAsTasks: false, sectionId: "", subsectionId: "" };
  }
  return {
    treatAsTasks: Boolean(setting.treatAsTasks),
    sectionId: setting.sectionId || "",
    subsectionId: setting.subsectionId || ""
  };
}

function resolveCalendarTaskSetting(settings, calendarId) {
  if (!calendarId) {
    return { treatAsTasks: false, sectionId: "", subsectionId: "" };
  }
  const settingsMap = getCalendarTaskSettingsById(settings);
  return normalizeCalendarTaskSetting(settingsMap[calendarId]);
}

function createSectionOption(value, label, selected, testId) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = Boolean(selected);
  option.setAttribute("data-test-skedpal", testId);
  return option;
}

function buildCalendarSectionSelect(calendarId, selectedSectionId = "") {
  const select = document.createElement("select");
  select.className =
    "w-full rounded-lg border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-100 focus:border-lime-400 focus:outline-none";
  select.dataset.calendarTaskSection = "true";
  select.dataset.calendarId = calendarId || "";
  select.setAttribute("data-test-skedpal", "google-calendar-task-section-select");

  const sections = state.settingsCache.sections || [];
  select.appendChild(
    createSectionOption("", "No section", !selectedSectionId, "google-calendar-task-section-option")
  );
  sections.forEach((section) => {
    const label = getSectionName(section.id) || section.name || "Untitled section";
    const option = createSectionOption(
      section.id,
      label,
      section.id === selectedSectionId,
      "google-calendar-task-section-option"
    );
    select.appendChild(option);
  });
  return select;
}

function buildCalendarSubsectionSelect(calendarId, sectionId, selectedSubsectionId = "") {
  const select = document.createElement("select");
  select.className =
    "w-full rounded-lg border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-100 focus:border-lime-400 focus:outline-none";
  select.dataset.calendarTaskSubsection = "true";
  select.dataset.calendarId = calendarId || "";
  select.setAttribute("data-test-skedpal", "google-calendar-task-subsection-select");
  updateCalendarSubsectionOptions(select, sectionId, selectedSubsectionId);
  return select;
}

function updateCalendarSubsectionOptions(select, sectionId, selectedSubsectionId = "") {
  if (!select) {return;}
  const safeSectionId = sectionId || "";
  const subsections = safeSectionId ? getSubsectionsFor(safeSectionId) : [];
  const subsectionsWithChildren = new Set(
    subsections.map((sub) => sub.parentId || "").filter(Boolean)
  );
  select.innerHTML = "";
  select.appendChild(
    createSectionOption(
      "",
      "No subsection",
      !selectedSubsectionId,
      "google-calendar-task-subsection-option"
    )
  );
  const addOptions = (parentId = "", depth = 0) => {
    const siblings = subsections.filter((sub) => (sub.parentId || "") === (parentId || ""));
    siblings.forEach((sub) => {
      const option = document.createElement("option");
      option.value = sub.id;
      const prefix = depth > 0 ? `${"-- ".repeat(depth)}` : "";
      option.textContent = `${prefix}${sub.name}`;
      option.selected = sub.id === selectedSubsectionId;
      option.disabled = subsectionsWithChildren.has(sub.id);
      option.setAttribute("data-test-skedpal", "google-calendar-task-subsection-option");
      select.appendChild(option);
      addOptions(sub.id, depth + 1);
    });
  };
  if (safeSectionId) {
    addOptions();
  }
  if (!select.value) {
    select.value = "";
  }
}

function setCalendarTaskControlsEnabled(row, enabled) {
  if (!row) {return;}
  const selectsWrap = row.querySelector?.("[data-calendar-task-selects]");
  if (selectsWrap) {
    selectsWrap.classList.toggle("hidden", !enabled);
    selectsWrap.setAttribute("aria-hidden", enabled ? "false" : "true");
  }
  const controls = row.querySelectorAll(
    "[data-calendar-task-section], [data-calendar-task-subsection]"
  );
  controls.forEach((control) => {
    if (!control) {return;}
    control.disabled = !enabled;
    control.classList.toggle("opacity-60", !enabled);
  });
}

function buildCalendarCheckbox(entry, selectedIds) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "mt-1 h-4 w-4 accent-lime-400";
  checkbox.value = entry.id || "";
  checkbox.dataset.calendarSelect = "true";
  checkbox.dataset.calendarId = entry.id || "";
  checkbox.checked = selectedIds.includes(entry.id);
  checkbox.setAttribute("data-test-skedpal", "google-calendar-checkbox");
  return checkbox;
}

function buildCalendarColor(entry) {
  const color = document.createElement("span");
  color.className = "mt-1 h-3 w-3 rounded-full border-slate-700";
  color.setAttribute("data-test-skedpal", "google-calendar-color");
  if (entry.backgroundColor) {
    color.style.backgroundColor = entry.backgroundColor;
  }
  return color;
}

function buildCalendarMetaDetails(entry) {
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
  return details;
}

function buildCalendarTaskToggle(entry, calendarTaskSettings) {
  const taskToggleLabel = document.createElement("label");
  taskToggleLabel.className = "flex items-center gap-2";
  taskToggleLabel.setAttribute("data-test-skedpal", "google-calendar-task-toggle-label");

  const taskToggle = document.createElement("input");
  taskToggle.type = "checkbox";
  taskToggle.className = "h-4 w-4 accent-lime-400";
  taskToggle.dataset.calendarTaskToggle = "true";
  taskToggle.dataset.calendarId = entry.id || "";
  taskToggle.checked = Boolean(calendarTaskSettings.treatAsTasks);
  taskToggle.setAttribute("data-test-skedpal", "google-calendar-task-toggle");

  const taskToggleText = document.createElement("span");
  taskToggleText.textContent = "Treat this calendar as tasks";
  taskToggleText.setAttribute("data-test-skedpal", "google-calendar-task-toggle-text");

  taskToggleLabel.appendChild(taskToggle);
  taskToggleLabel.appendChild(taskToggleText);
  return taskToggleLabel;
}

function buildCalendarTaskSelectRow(entry, calendarTaskSettings) {
  const selectRow = document.createElement("div");
  selectRow.className = "grid gap-2 md:grid-cols-2";
  selectRow.setAttribute("data-test-skedpal", "google-calendar-task-selects");
  selectRow.dataset.calendarTaskSelects = "true";

  const sectionField = document.createElement("label");
  sectionField.className = "flex flex-col gap-1";
  sectionField.setAttribute("data-test-skedpal", "google-calendar-task-section-field");
  const sectionLabel = document.createElement("span");
  sectionLabel.className = "text-[11px] uppercase tracking-wide text-slate-500";
  sectionLabel.textContent = "Default section";
  sectionLabel.setAttribute("data-test-skedpal", "google-calendar-task-section-label");
  const sectionSelect = buildCalendarSectionSelect(
    entry.id || "",
    calendarTaskSettings.sectionId || ""
  );
  sectionField.appendChild(sectionLabel);
  sectionField.appendChild(sectionSelect);

  const subsectionField = document.createElement("label");
  subsectionField.className = "flex flex-col gap-1";
  subsectionField.setAttribute("data-test-skedpal", "google-calendar-task-subsection-field");
  const subsectionLabel = document.createElement("span");
  subsectionLabel.className = "text-[11px] uppercase tracking-wide text-slate-500";
  subsectionLabel.textContent = "Default subsection";
  subsectionLabel.setAttribute("data-test-skedpal", "google-calendar-task-subsection-label");
  const subsectionSelect = buildCalendarSubsectionSelect(
    entry.id || "",
    calendarTaskSettings.sectionId || "",
    calendarTaskSettings.subsectionId || ""
  );
  subsectionField.appendChild(subsectionLabel);
  subsectionField.appendChild(subsectionSelect);

  selectRow.appendChild(sectionField);
  selectRow.appendChild(subsectionField);
  return selectRow;
}

function buildCalendarTaskOptions(entry, calendarTaskSettings) {
  const options = document.createElement("div");
  options.className = "mt-2 flex flex-col gap-2 text-xs text-slate-300";
  options.setAttribute("data-test-skedpal", "google-calendar-options");
  options.appendChild(buildCalendarTaskToggle(entry, calendarTaskSettings));
  options.appendChild(buildCalendarTaskSelectRow(entry, calendarTaskSettings));
  return options;
}

function buildCalendarRow(entry, selectedIds, calendarTaskSettings) {
  const row = document.createElement("div");
  row.className =
    "flex items-start gap-3 rounded-xl border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200 transition hover:border-lime-400/60";
  row.setAttribute("data-test-skedpal", "google-calendar-row");
  row.dataset.calendarId = entry.id || "";

  row.appendChild(buildCalendarCheckbox(entry, selectedIds));
  row.appendChild(buildCalendarColor(entry));
  const details = buildCalendarMetaDetails(entry);
  details.appendChild(buildCalendarTaskOptions(entry, calendarTaskSettings));
  row.appendChild(details);
  setCalendarTaskControlsEnabled(row, Boolean(calendarTaskSettings.treatAsTasks));
  return row;
}

function renderCalendarList(calendars, selectedIds) {
  if (!googleCalendarList) {return;}
  googleCalendarList.innerHTML = "";
  if (!calendars.length) {
    const empty = document.createElement("div");
    empty.className = "rounded-xl border-dashed border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400";
    empty.textContent = "No calendars found.";
    empty.setAttribute("data-test-skedpal", "google-calendar-empty");
    googleCalendarList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  calendars.forEach((entry) => {
    const calendarTaskSettings = resolveCalendarTaskSetting(state.settingsCache, entry.id || "");
    fragment.appendChild(buildCalendarRow(entry, selectedIds, calendarTaskSettings));
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

function applyInitialCalendarStatus() {
  const initialSelectedIds = Array.isArray(state.settingsCache.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : [];
  if (googleCalendarStatus && initialSelectedIds.length) {
    setCalendarStatus(`Selected ${initialSelectedIds.length} calendar(s).`);
  }
}

function createCalendarTaskSettingsUpdater(persistSettingsSafely) {
  return (calendarId, updates) => {
    if (!calendarId) {return;}
    const current = resolveCalendarTaskSetting(state.settingsCache, calendarId);
    const next = {
      ...current,
      ...updates,
      sectionId: updates.sectionId ?? current.sectionId,
      subsectionId: updates.subsectionId ?? current.subsectionId
    };
    if (!next.sectionId) {
      next.subsectionId = "";
    }
    const settingsMap = {
      ...getCalendarTaskSettingsById(state.settingsCache),
      [calendarId]: next
    };
    persistSettingsSafely(
      { googleCalendarTaskSettings: settingsMap },
      "Failed to save calendar task settings."
    );
  };
}

function handleCalendarSelectionChange(persistSettingsSafely) {
  if (!googleCalendarList) {return;}
  const ids = [...googleCalendarList.querySelectorAll("input[data-calendar-select]")]
    .filter((input) => input.checked)
    .map((input) => input.value)
    .filter(Boolean);
  persistSettingsSafely(
    { googleCalendarIds: ids },
    "Failed to save calendar selection."
  );
  invalidateExternalEventsCache();
  setCalendarStatus(ids.length ? `Selected ${ids.length} calendar(s).` : "No calendars selected.");
}

function handleCalendarTaskToggleChange(target, updateCalendarTaskSettings) {
  const calendarId = target?.dataset?.calendarId || "";
  const row = target?.closest?.("[data-calendar-id]");
  setCalendarTaskControlsEnabled(row, Boolean(target?.checked));
  updateCalendarTaskSettings(calendarId, { treatAsTasks: Boolean(target?.checked) });
}

function handleCalendarTaskSectionChange(target, updateCalendarTaskSettings) {
  const calendarId = target?.dataset?.calendarId || "";
  const sectionId = target?.value || "";
  const row = target?.closest?.("[data-calendar-id]");
  const subsectionSelect = row?.querySelector?.("[data-calendar-task-subsection]");
  updateCalendarSubsectionOptions(subsectionSelect, sectionId, "");
  updateCalendarTaskSettings(calendarId, {
    sectionId,
    subsectionId: subsectionSelect?.value || ""
  });
}

function handleCalendarTaskSubsectionChange(target, updateCalendarTaskSettings) {
  const calendarId = target?.dataset?.calendarId || "";
  updateCalendarTaskSettings(calendarId, { subsectionId: target?.value || "" });
}

function resolveCalendarTaskToggleTarget(target) {
  if (!target) {return null;}
  if (target.matches?.("input[data-calendar-task-toggle]")) {return target;}
  const label = target.closest?.("[data-test-skedpal='google-calendar-task-toggle-label']");
  if (!label) {return null;}
  return label.querySelector?.("input[data-calendar-task-toggle]") || null;
}

function createCalendarListChangeHandler(persistSettingsSafely, updateCalendarTaskSettings) {
  function handleCalendarListChange(event) {
    const target = event?.target;
    if (!target) {return;}
    if (target.matches?.("input[data-calendar-select]")) {
      handleCalendarSelectionChange(persistSettingsSafely);
      return;
    }
    if (target.matches?.("input[data-calendar-task-toggle]")) {
      handleCalendarTaskToggleChange(target, updateCalendarTaskSettings);
      return;
    }
    if (target.matches?.("select[data-calendar-task-section]")) {
      handleCalendarTaskSectionChange(target, updateCalendarTaskSettings);
      return;
    }
    if (target.matches?.("select[data-calendar-task-subsection]")) {
      handleCalendarTaskSubsectionChange(target, updateCalendarTaskSettings);
    }
  }
  return handleCalendarListChange;
}

function createCalendarListClickHandler(updateCalendarTaskSettings) {
  function handleCalendarListClick(event) {
    const toggle = resolveCalendarTaskToggleTarget(event?.target);
    if (!toggle) {return;}
    handleCalendarTaskToggleChange(toggle, updateCalendarTaskSettings);
  }
  return handleCalendarListClick;
}

function createCalendarConnectHandler() {
  async function handleCalendarConnect() {
    setCalendarStatus("Connecting to Google Calendar...");
    try {
      const calendars = await requestCalendarList();
      const selection = Array.isArray(state.settingsCache.googleCalendarIds)
        ? state.settingsCache.googleCalendarIds
        : [];
      state.googleCalendarListCache = calendars;
      saveCalendarListCache(calendars).catch((error) => {
        console.warn("Failed to cache calendar list.", error);
      });
      renderCalendarList(calendars, selection);
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
  }
  return handleCalendarConnect;
}

function createCalendarDisconnectHandler(persistSettingsSafely) {
  async function handleCalendarDisconnect() {
    setCalendarStatus("Disconnecting...");
    try {
      await disconnectCalendar();
      state.googleCalendarListCache = [];
      renderCalendarList([], []);
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
  }
  return handleCalendarDisconnect;
}

function addListener(cleanupFns, node, eventName, handler) {
  if (!node || !handler) {return;}
  node.addEventListener(eventName, handler);
  cleanupFns.push(() => node.removeEventListener(eventName, handler));
}

function attachCalendarListeners(onConnect, onDisconnect, onListChange, onListClick) {
  const cleanupFns = [];
  addListener(cleanupFns, googleCalendarConnectBtn, "click", onConnect);
  addListener(cleanupFns, googleCalendarRefreshBtn, "click", onConnect);
  addListener(cleanupFns, googleCalendarDisconnectBtn, "click", onDisconnect);
  addListener(cleanupFns, googleCalendarList, "change", onListChange);
  addListener(cleanupFns, googleCalendarList, "click", onListClick);
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

export function initGoogleCalendarSettings(persistSettingsSafely) {
  applyInitialCalendarStatus();
  const updateCalendarTaskSettings = createCalendarTaskSettingsUpdater(persistSettingsSafely);
  const onListChange = createCalendarListChangeHandler(
    persistSettingsSafely,
    updateCalendarTaskSettings
  );
  const onListClick = createCalendarListClickHandler(updateCalendarTaskSettings);
  const onConnect = createCalendarConnectHandler();
  const onDisconnect = createCalendarDisconnectHandler(persistSettingsSafely);
  return attachCalendarListeners(onConnect, onDisconnect, onListChange, onListClick);
}
