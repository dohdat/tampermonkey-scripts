import { BACKUP_AUTO_INTERVAL_MS } from "../core/constants.js";

function parseTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.NaN : time;
}

export function isAutomaticBackupDue(
  latestBackup = null,
  now = new Date(),
  intervalMs = BACKUP_AUTO_INTERVAL_MS
) {
  const nowTime = parseTime(now);
  if (Number.isNaN(nowTime)) {return false;}
  if (!latestBackup?.createdAt) {return true;}
  const latestTime = parseTime(latestBackup.createdAt);
  if (Number.isNaN(latestTime)) {return true;}
  const safeInterval = Math.max(0, Number(intervalMs) || BACKUP_AUTO_INTERVAL_MS);
  return nowTime - latestTime >= safeInterval;
}

export async function runAutomaticBackupIfDue({
  latestBackup = null,
  now = new Date(),
  intervalMs = BACKUP_AUTO_INTERVAL_MS,
  createSnapshot = null,
  saveBackup = null
} = {}) {
  if (!isAutomaticBackupDue(latestBackup, now, intervalMs)) {
    return { ran: false, snapshot: null };
  }
  if (typeof createSnapshot !== "function" || typeof saveBackup !== "function") {
    return { ran: false, snapshot: null };
  }
  const baseSnapshot = await createSnapshot();
  const nowTime = parseTime(now);
  const fallbackCreatedAt = Number.isNaN(nowTime)
    ? new Date().toISOString()
    : new Date(nowTime).toISOString();
  const snapshot = {
    ...(baseSnapshot || {}),
    createdAt: typeof baseSnapshot?.createdAt === "string" && baseSnapshot.createdAt
      ? baseSnapshot.createdAt
      : fallbackCreatedAt
  };
  await saveBackup(snapshot);
  return { ran: true, snapshot };
}
