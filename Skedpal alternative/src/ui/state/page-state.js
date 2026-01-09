import { DEFAULT_SETTINGS } from "../../data/db.js";

export const state = {
  settingsCache: { ...DEFAULT_SETTINGS },
  pendingSettingsSave: null,
  tasksTimeMapsCache: [],
  tasksCache: [],
  taskTemplatesCache: [],
  taskFormMode: null,
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
  tasksCalendarSplit: true,
  calendarViewMode: "day",
  calendarAnchorDate: new Date(),
  calendarExternalEvents: [],
  calendarExternalRangeKey: "",
  calendarExternalPendingKey: "",
  calendarExternalAllowFetch: false
};
