import { DB_NAME, DB_VERSION } from "../constants.js";
const DEFAULT_SECTIONS = [
  { id: "section-work-default", name: "Work" },
  { id: "section-personal-default", name: "Personal" }
];
const DEFAULT_SCHEDULING_HORIZON_DAYS = 14;
const DEFAULT_SETTINGS = {
  schedulingHorizonDays: DEFAULT_SCHEDULING_HORIZON_DAYS,
  defaultTimeMapId: null,
  googleCalendarIds: [],
  favoriteGroupExpanded: {},
  collapsedSections: [],
  collapsedSubsections: [],
  collapsedTasks: [],
  groqApiKey: "",
  taskBackgroundMode: "priority",
  sections: DEFAULT_SECTIONS,
  subsections: {
    [DEFAULT_SECTIONS[0].id]: [],
    [DEFAULT_SECTIONS[1].id]: []
  }
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("timemaps")) {
        db.createObjectStore("timemaps", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("backups")) {
        db.createObjectStore("backups", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("task-templates")) {
        db.createObjectStore("task-templates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("calendar-cache")) {
        db.createObjectStore("calendar-cache", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStore(storeName, mode = "readonly") {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

async function getAll(storeName) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function putItem(storeName, value) {
  const store = await getStore(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

async function deleteItem(storeName, key) {
  const store = await getStore(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTasks() {
  return getAll("tasks");
}

export async function saveTask(task) {
  return putItem("tasks", task);
}

export async function deleteTask(id) {
  return deleteItem("tasks", id);
}

export async function getAllTaskTemplates() {
  return getAll("task-templates");
}

export async function saveTaskTemplate(template) {
  return putItem("task-templates", template);
}

export async function deleteTaskTemplate(id) {
  return deleteItem("task-templates", id);
}

export async function getAllTimeMaps() {
  return getAll("timemaps");
}

export async function saveTimeMap(timeMap) {
  return putItem("timemaps", timeMap);
}

export async function deleteTimeMap(id) {
  return deleteItem("timemaps", id);
}

export async function getSettings() {
  const store = await getStore("settings");
  return new Promise((resolve, reject) => {
    const req = store.get("settings");
    req.onsuccess = () => {
      resolve({ ...DEFAULT_SETTINGS, ...(req.result?.value || {}) });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSettings(value) {
  return putItem("settings", { id: "settings", value });
}

export async function saveBackup(snapshot) {
  return putItem("backups", { id: "latest", ...snapshot });
}

export async function getLatestBackup() {
  const store = await getStore("backups");
  return new Promise((resolve, reject) => {
    const req = store.get("latest");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getCalendarCacheEntry(key) {
  const store = await getStore("calendar-cache");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCalendarCacheEntry(entry) {
  return putItem("calendar-cache", entry);
}

export async function deleteCalendarCacheEntry(key) {
  return deleteItem("calendar-cache", key);
}

export async function restoreBackup(snapshot) {
  if (!snapshot) {
    throw new Error("No backup available.");
  }
  const db = await openDb();
  const tx = db.transaction(["tasks", "timemaps", "settings", "task-templates"], "readwrite");
  const tasksStore = tx.objectStore("tasks");
  const timeMapsStore = tx.objectStore("timemaps");
  const settingsStore = tx.objectStore("settings");
  const templatesStore = tx.objectStore("task-templates");
  tasksStore.clear();
  timeMapsStore.clear();
  settingsStore.clear();
  templatesStore.clear();
  (snapshot.tasks || []).forEach((task) => {
    tasksStore.put(task);
  });
  (snapshot.timeMaps || []).forEach((timeMap) => {
    timeMapsStore.put(timeMap);
  });
  (snapshot.taskTemplates || []).forEach((template) => {
    templatesStore.put(template);
  });
  settingsStore.put({
    id: "settings",
    value: snapshot.settings || DEFAULT_SETTINGS
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Restore aborted"));
  });
  db.close();
}

export { DEFAULT_SETTINGS, DEFAULT_SCHEDULING_HORIZON_DAYS };
