import { DEFAULT_SETTINGS } from "../../data/db.js";

export const state = {
  settingsCache: { ...DEFAULT_SETTINGS },
  tasksTimeMapsCache: [],
  tasksCache: [],
  zoomFilter: null,
  collapsedSections: new Set(),
  collapsedSubsections: new Set(),
  collapsedTasks: new Set(),
  expandedTaskDetails: new Set(),
  notificationHideTimeout: null,
  notificationUndoHandler: null,
  navStack: [],
  navIndex: -1,
  sortableInstances: [],
  calendarViewMode: "week",
  calendarAnchorDate: new Date()
};
