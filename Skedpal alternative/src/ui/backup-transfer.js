import { JSON_INDENT } from "../constants.js";

function normalizeSnapshot(value) {
  const snapshot = value && typeof value === "object" ? value : {};
  return {
    createdAt: snapshot.createdAt || new Date().toISOString(),
    tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : [],
    timeMaps: Array.isArray(snapshot.timeMaps) ? snapshot.timeMaps : [],
    settings: snapshot.settings && typeof snapshot.settings === "object" ? snapshot.settings : {},
    taskTemplates: Array.isArray(snapshot.taskTemplates) ? snapshot.taskTemplates : []
  };
}

export function buildBackupExportPayload(snapshot) {
  return JSON.stringify(normalizeSnapshot(snapshot), null, JSON_INDENT);
}

export function parseBackupImportJson(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON backup file.");
  }
  return normalizeSnapshot(parsed);
}
