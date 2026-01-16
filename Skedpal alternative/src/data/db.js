import {
  AUTO_SORT_NEW_TASKS_DEFAULT,
  DB_NAME,
  DB_VERSION,
  DEFAULT_SCHEDULING_HORIZON_DAYS
} from "../constants.js";
const DEFAULT_SECTIONS = [
  { id: "section-work-default", name: "Work" },
  { id: "section-personal-default", name: "Personal" }
];
const DEFAULT_SETTINGS = {
  schedulingHorizonDays: DEFAULT_SCHEDULING_HORIZON_DAYS,
  defaultTimeMapId: null,
  autoSortNewTasks: AUTO_SORT_NEW_TASKS_DEFAULT,
  googleCalendarIds: [],
  defaultGoogleCalendarId: "",
  googleCalendarTaskSettings: {},
  favoriteGroupExpanded: {},
  collapsedSections: [],
  collapsedSubsections: [],
  collapsedTasks: [],
  lastPrunedAt: null,
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

function isTaskDeleted(task) {
  return Boolean(task?.deleted || task?.isDeleted || task?.deletedAt || task?.deletedOn);
}

function getProtectedTaskIds(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const protectedIds = new Set();
  for (const task of tasks) {
    if (task?.completed || !task?.subtaskParentId) {continue;}
    let parentId = task.subtaskParentId;
    while (parentId && !protectedIds.has(parentId)) {
      protectedIds.add(parentId);
      parentId = byId.get(parentId)?.subtaskParentId || null;
    }
  }
  return protectedIds;
}

function pruneCollapsedTasks(settings, removedIds) {
  if (!settings || !Array.isArray(settings.collapsedTasks)) {return settings;}
  if (!removedIds || removedIds.size === 0) {return settings;}
  const next = settings.collapsedTasks.filter((id) => !removedIds.has(id));
  if (next.length === settings.collapsedTasks.length) {return settings;}
  return { ...settings, collapsedTasks: next };
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

export async function trimTaskCollection() {
  const db = await openDb();
  const tx = db.transaction(["tasks", "settings"], "readwrite");
  const tasksStore = tx.objectStore("tasks");
  const settingsStore = tx.objectStore("settings");
  const tasks = await new Promise((resolve, reject) => {
    const req = tasksStore.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const settingsEntry = await new Promise((resolve, reject) => {
    const req = settingsStore.get("settings");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  const settings = { ...DEFAULT_SETTINGS, ...(settingsEntry?.value || {}) };
  const protectedIds = getProtectedTaskIds(tasks);
  const removedIds = new Set();
  for (const task of tasks) {
    if (!task?.id) {continue;}
    if (protectedIds.has(task.id)) {continue;}
    if (task.completed || isTaskDeleted(task)) {
      removedIds.add(task.id);
    }
  }
  removedIds.forEach((id) => {
    tasksStore.delete(id);
  });
  const nextSettings = pruneCollapsedTasks(settings, removedIds);
  if (nextSettings !== settings) {
    settingsStore.put({ id: "settings", value: nextSettings });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Trim aborted"));
  });
  db.close();
  return {
    removedCount: removedIds.size,
    totalCount: tasks.length,
    settings: nextSettings
  };
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
