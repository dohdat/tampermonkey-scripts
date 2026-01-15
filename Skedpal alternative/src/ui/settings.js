import {
  getAllTasks,
  getAllTaskTemplates,
  getAllTimeMaps,
  getSettings,
  saveBackup,
  getLatestBackup,
  restoreBackup,
  saveSettings,
  trimTaskCollection,
  DEFAULT_SETTINGS,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../data/db.js";
import {
  BACKUP_FILENAME_PAD_LENGTH,
  HORIZON_PERSIST_DEBOUNCE_MS,
  SIXTY,
  domRefs
} from "./constants.js";
import { state } from "./state/page-state.js";
import { normalizeHorizonDays, debounce } from "./utils.js";
import { invalidateExternalEventsCache } from "./calendar-external.js";
import { loadTasks, updateScheduleSummary, renderTimeMapsAndTasks } from "./tasks/tasks-actions.js";
import { initTaskTemplates, loadTaskTemplates } from "./task-templates.js";
import { initTimeMapSectionToggle } from "./time-map-settings-toggle.js";
import { buildBackupExportPayload, parseBackupImportJson } from "./backup-transfer.js";
import { loadCalendarListCache } from "./calendar-list-cache.js";
import {
  initGoogleCalendarSettings,
  updateCalendarStatusFromSettings
} from "./settings-google-calendar.js";

const {
  horizonInput,
  backupNowBtn,
  backupExportBtn,
  backupImportBtn,
  backupImportInput,
  backupRestoreBtn,
  backupTrimBtn,
  backupStatus,
  taskBackgroundModeSelect
} = domRefs;

function setBackupStatus(message) {
  if (!backupStatus) {return;}
  backupStatus.textContent = message;
}

function setBackupButtonsState(disabled) {
  if (backupNowBtn) {
    backupNowBtn.disabled = Boolean(disabled);
    backupNowBtn.classList.toggle("opacity-60", Boolean(disabled));
  }
  if (backupExportBtn) {
    backupExportBtn.disabled = Boolean(disabled);
    backupExportBtn.classList.toggle("opacity-60", Boolean(disabled));
  }
  if (backupImportBtn) {
    backupImportBtn.disabled = Boolean(disabled);
    backupImportBtn.classList.toggle("opacity-60", Boolean(disabled));
  }
  if (backupRestoreBtn) {
    backupRestoreBtn.disabled = Boolean(disabled);
    backupRestoreBtn.classList.toggle("opacity-60", Boolean(disabled));
  }
  if (backupTrimBtn) {
    backupTrimBtn.disabled = Boolean(disabled);
    backupTrimBtn.classList.toggle("opacity-60", Boolean(disabled));
  }
}

function formatBackupTimestamp(value) {
  if (!value) {return "Unknown date";}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return "Unknown date";}
  return date.toLocaleString();
}

function updateHorizonInputValue() {
  if (!horizonInput) {return;}
  const min = Number(horizonInput.min) || 1;
  const max = Number(horizonInput.max) || SIXTY;
  const fallback = DEFAULT_SCHEDULING_HORIZON_DAYS;
  horizonInput.value = String(
    normalizeHorizonDays(state.settingsCache.schedulingHorizonDays, min, max, fallback)
  );
}

function applyCollapsedPreferences(settings) {
  const sections = Array.isArray(settings?.collapsedSections) ? settings.collapsedSections : [];
  const subsections = Array.isArray(settings?.collapsedSubsections)
    ? settings.collapsedSubsections
    : [];
  const tasks = Array.isArray(settings?.collapsedTasks) ? settings.collapsedTasks : [];
  state.collapsedSections = new Set(sections.filter(Boolean));
  state.collapsedSubsections = new Set(subsections.filter(Boolean));
  state.collapsedTasks = new Set(tasks.filter(Boolean));
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
  if (!horizonInput) {return () => {};}
  const min = Number(horizonInput.min) || 1;
  const max = Number(horizonInput.max) || SIXTY;
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
  const debouncedPersist = debounce(persistSafely, HORIZON_PERSIST_DEBOUNCE_MS);
  horizonInput.addEventListener("input", debouncedPersist);
  horizonInput.addEventListener("change", persistSafely);
  return () => {
    horizonInput.removeEventListener("input", debouncedPersist);
    horizonInput.removeEventListener("change", persistSafely);
    debouncedPersist.cancel?.();
  };
}

function initTaskBackgroundSetting(persistSettingsSafely) {
  if (!taskBackgroundModeSelect) {return () => {};}
  const allowed = new Set(["priority", "timemap", "none"]);
  const resolveMode = (value) => (allowed.has(value) ? value : "priority");
  const applyMode = (value) => {
    taskBackgroundModeSelect.value = resolveMode(value);
  };
  applyMode(state.settingsCache.taskBackgroundMode);
  const handleChange = () => {
    const nextMode = resolveMode(taskBackgroundModeSelect.value);
    taskBackgroundModeSelect.value = nextMode;
    persistSettingsSafely(
      { taskBackgroundMode: nextMode },
      "Failed to save task background preference."
    );
    renderTimeMapsAndTasks(state.tasksTimeMapsCache || []);
  };
  taskBackgroundModeSelect.addEventListener("change", handleChange);
  return () => {
    taskBackgroundModeSelect.removeEventListener("change", handleChange);
  };
}

async function refreshBackupStatus() {
  try {
    const latest = await getLatestBackup();
    if (!latest) {
      setBackupStatus("No backups yet.");
      if (backupRestoreBtn) {backupRestoreBtn.disabled = true;}
      return null;
    }
    setBackupStatus(`Latest backup: ${formatBackupTimestamp(latest.createdAt)}.`);
    if (backupRestoreBtn) {backupRestoreBtn.disabled = false;}
    return latest;
  } catch (error) {
    console.warn("Failed to read latest backup.", error);
    setBackupStatus("Unable to read backups.");
    if (backupRestoreBtn) {backupRestoreBtn.disabled = true;}
    return null;
  }
}

async function createBackupSnapshot() {
  const [tasks, timeMaps, settings, taskTemplates] = await Promise.all([
    getAllTasks(),
    getAllTimeMaps(),
    getSettings(),
    getAllTaskTemplates()
  ]);
  return {
    createdAt: new Date().toISOString(),
    tasks,
    timeMaps,
    settings,
    taskTemplates
  };
}

function confirmBackupRestore() {
  if (typeof window === "undefined") {return true;}
  return window.confirm("Restore the latest backup? This will replace current data.");
}

function confirmBackupImport() {
  if (typeof window === "undefined") {return true;}
  return window.confirm("Import this backup file? This will replace current data.");
}

function confirmBackupTrim() {
  if (typeof window === "undefined") {return true;}
  return window.confirm("Trim completed or deleted tasks? This cannot be undone.");
}

function formatBackupFilename(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "skedpal-backup.json";
  }
  const pad = (num) => String(num).padStart(BACKUP_FILENAME_PAD_LENGTH, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `skedpal-backup-${stamp}.json`;
}

function triggerJsonDownload(payload, filename) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function applyBackupSnapshot(latest) {
  await restoreBackup(latest);
  state.settingsCache = { ...DEFAULT_SETTINGS, ...(latest.settings || {}) };
  applyCollapsedPreferences(state.settingsCache);
  updateHorizonInputValue();
  updateCalendarStatusFromSettings();
  invalidateExternalEventsCache();
  await loadTasks();
  await loadTaskTemplates();
  await updateScheduleSummary();
}

async function handleBackupNowClick() {
  setBackupButtonsState(true);
  setBackupStatus("Saving backup...");
  try {
    const snapshot = await createBackupSnapshot();
    await saveBackup(snapshot);
    setBackupStatus(`Backup saved ${formatBackupTimestamp(snapshot.createdAt)}.`);
    if (backupRestoreBtn) {backupRestoreBtn.disabled = false;}
  } catch (error) {
    console.warn("Failed to save backup.", error);
    setBackupStatus("Failed to save backup.");
  } finally {
    setBackupButtonsState(false);
  }
}

async function handleBackupExportClick() {
  setBackupButtonsState(true);
  setBackupStatus("Preparing export...");
  try {
    const snapshot = await createBackupSnapshot();
    const payload = buildBackupExportPayload(snapshot);
    triggerJsonDownload(payload, formatBackupFilename(snapshot.createdAt));
    setBackupStatus(`Exported backup ${formatBackupTimestamp(snapshot.createdAt)}.`);
  } catch (error) {
    console.warn("Failed to export backup.", error);
    setBackupStatus("Failed to export backup.");
  } finally {
    setBackupButtonsState(false);
  }
}

function handleBackupImportClick() {
  if (!backupImportInput) {return;}
  backupImportInput.value = "";
  backupImportInput.click();
}

async function handleBackupImportChange(event) {
  const input = event?.currentTarget;
  const file = input?.files?.[0];
  if (!file) {return;}
  setBackupButtonsState(true);
  setBackupStatus("Importing backup...");
  try {
    const text = await file.text();
    const snapshot = parseBackupImportJson(text);
    if (!confirmBackupImport()) {
      setBackupStatus("Import canceled.");
      return;
    }
    await applyBackupSnapshot(snapshot);
    setBackupStatus(`Imported backup from ${formatBackupTimestamp(snapshot.createdAt)}.`);
  } catch (error) {
    console.warn("Failed to import backup.", error);
    setBackupStatus("Failed to import backup.");
  } finally {
    setBackupButtonsState(false);
    await refreshBackupStatus();
  }
}

async function handleRestoreLatestClick() {
  setBackupButtonsState(true);
  setBackupStatus("Restoring backup...");
  try {
    const latest = await getLatestBackup();
    if (!latest) {
      setBackupStatus("No backup available.");
      return;
    }
    if (!confirmBackupRestore()) {
      setBackupStatus("Restore canceled.");
      return;
    }
    await applyBackupSnapshot(latest);
    setBackupStatus(`Restored backup from ${formatBackupTimestamp(latest.createdAt)}.`);
  } catch (error) {
    console.warn("Failed to restore backup.", error);
    setBackupStatus("Failed to restore backup.");
  } finally {
    setBackupButtonsState(false);
    await refreshBackupStatus();
  }
}

async function handleBackupTrimClick() {
  setBackupButtonsState(true);
  setBackupStatus("Trimming completed tasks...");
  try {
    if (!confirmBackupTrim()) {
      setBackupStatus("Trim canceled.");
      return;
    }
    const result = await trimTaskCollection();
    state.settingsCache = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    applyCollapsedPreferences(state.settingsCache);
    await loadTasks();
    await updateScheduleSummary();
    const removed = result.removedCount || 0;
    if (removed === 0) {
      setBackupStatus("No completed or deleted tasks to trim.");
      return;
    }
    const total = result.totalCount || removed;
    const suffix = removed === 1 ? "" : "s";
    setBackupStatus(`Trimmed ${removed} task${suffix} from ${total}.`);
  } catch (error) {
    console.warn("Failed to trim task collection.", error);
    setBackupStatus("Failed to trim tasks.");
  } finally {
    setBackupButtonsState(false);
  }
}

function initBackupSettings() {
  const cleanupFns = [];
  if (backupNowBtn) {
    backupNowBtn.addEventListener("click", handleBackupNowClick);
    cleanupFns.push(() => backupNowBtn.removeEventListener("click", handleBackupNowClick));
  }
  if (backupExportBtn) {
    backupExportBtn.addEventListener("click", handleBackupExportClick);
    cleanupFns.push(() => backupExportBtn.removeEventListener("click", handleBackupExportClick));
  }
  if (backupImportBtn) {
    backupImportBtn.addEventListener("click", handleBackupImportClick);
    cleanupFns.push(() => backupImportBtn.removeEventListener("click", handleBackupImportClick));
  }
  if (backupImportInput) {
    backupImportInput.addEventListener("change", handleBackupImportChange);
    cleanupFns.push(() => backupImportInput.removeEventListener("change", handleBackupImportChange));
  }
  if (backupRestoreBtn) {
    backupRestoreBtn.addEventListener("click", handleRestoreLatestClick);
    cleanupFns.push(() => backupRestoreBtn.removeEventListener("click", handleRestoreLatestClick));
  }
  if (backupTrimBtn) {
    backupTrimBtn.addEventListener("click", handleBackupTrimClick);
    cleanupFns.push(() => backupTrimBtn.removeEventListener("click", handleBackupTrimClick));
  }
  void refreshBackupStatus();
  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

export async function initSettings(prefetchedSettings) {
  const settings = prefetchedSettings || (await getSettings());
  state.settingsCache = { ...DEFAULT_SETTINGS, ...settings };
  try {
    state.googleCalendarListCache = await loadCalendarListCache();
  } catch (error) {
    console.warn("Failed to load cached calendar list.", error);
    state.googleCalendarListCache = [];
  }
  applyCollapsedPreferences(state.settingsCache);
  const { persistSettings, persistSettingsSafely } = createSettingsPersistor();
  const cleanupFns = [];
  if (typeof state.settingsCleanup === "function") {
    state.settingsCleanup();
    state.settingsCleanup = null;
  }
  cleanupFns.push(initHorizonSettings(persistSettings));
  cleanupFns.push(initTaskBackgroundSetting(persistSettingsSafely));
  cleanupFns.push(initTimeMapSectionToggle());
  cleanupFns.push(initGoogleCalendarSettings(persistSettingsSafely));
  cleanupFns.push(initBackupSettings());
  state.taskTemplatesCleanup = initTaskTemplates();
  state.settingsCleanup = () => {
    cleanupFns.forEach((cleanup) => cleanup?.());
  };
}
