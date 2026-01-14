import { COMPLETED_TASK_RETENTION_DAYS, MS_PER_DAY } from "../constants.js";

export { COMPLETED_TASK_RETENTION_DAYS };

export function shouldRunDailyPrune(lastPrunedAt, now = new Date()) {
  if (!lastPrunedAt) {return true;}
  const nowMs = getNowMs(now);
  if (!Number.isFinite(nowMs)) {return false;}
  const lastMs = Date.parse(lastPrunedAt);
  if (!Number.isFinite(lastMs)) {return true;}
  return nowMs - lastMs >= MS_PER_DAY;
}

function getRetentionMs(retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days)) {return 0;}
  return Math.max(0, days) * MS_PER_DAY;
}

function getNowMs(now) {
  if (now instanceof Date) {return now.getTime();}
  return Date.parse(now);
}

function isCompletedTaskPrunable(task, retentionMs, nowMs, protectedIds) {
  if (!task?.completed) {return false;}
  if (protectedIds.has(task.id)) {return false;}
  const completedAt = task.completedAt;
  if (!completedAt) {return false;}
  const completedMs = Date.parse(completedAt);
  if (!Number.isFinite(completedMs)) {return false;}
  return nowMs - completedMs >= retentionMs;
}

function markProtectedAncestors(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const protectedIds = new Set();
  for (const task of tasks) {
    if (task.completed || !task.subtaskParentId) {continue;}
    let parentId = task.subtaskParentId;
    while (parentId && !protectedIds.has(parentId)) {
      protectedIds.add(parentId);
      parentId = byId.get(parentId)?.subtaskParentId || null;
    }
  }
  return protectedIds;
}

export function getPrunableCompletedTaskIds(tasks, retentionDays, now = new Date()) {
  if (!Array.isArray(tasks) || tasks.length === 0) {return [];}
  const retentionMs = getRetentionMs(retentionDays);
  if (retentionMs === 0) {return [];}
  const nowMs = getNowMs(now);
  if (!Number.isFinite(nowMs)) {return [];}
  const protectedIds = markProtectedAncestors(tasks);
  const prunable = [];
  for (const task of tasks) {
    if (isCompletedTaskPrunable(task, retentionMs, nowMs, protectedIds)) {
      prunable.push(task.id);
    }
  }
  return prunable;
}

export function pruneSettingsCollapsedTasks(settings, removedTaskIds) {
  if (!settings || !Array.isArray(settings.collapsedTasks)) {return settings;}
  if (!removedTaskIds || removedTaskIds.size === 0) {return settings;}
  const next = settings.collapsedTasks.filter((id) => !removedTaskIds.has(id));
  if (next.length === settings.collapsedTasks.length) {return settings;}
  return { ...settings, collapsedTasks: next };
}
