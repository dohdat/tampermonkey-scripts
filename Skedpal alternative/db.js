const DB_NAME = "personal-skedpal";
const DB_VERSION = 1;
const DEFAULT_SECTIONS = [
  { id: "section-work-default", name: "Work" },
  { id: "section-personal-default", name: "Personal" }
];
const DEFAULT_SETTINGS = {
  schedulingHorizonDays: 14,
  defaultTimeMapId: null,
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

export { DEFAULT_SETTINGS };
