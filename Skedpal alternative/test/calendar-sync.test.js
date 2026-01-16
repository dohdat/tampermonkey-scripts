import "fake-indexeddb/auto.js";
import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import {
  buildCalendarSyncPlan,
  getCalendarSyncTargets,
  initCalendarSyncAlarms,
  resumeCalendarSyncJob,
  startCalendarSyncJob
} from "../src/background/calendar-sync.js";
import {
  getCalendarCacheEntry,
  saveCalendarCacheEntry,
  deleteCalendarCacheEntry
} from "../src/data/db.js";
import { GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY } from "../src/constants.js";

describe("calendar sync planning", () => {
  const originalFetch = globalThis.fetch;
  const originalChrome = globalThis.chrome;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(async () => {
    await deleteCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    console.warn = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.chrome = originalChrome;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  it("clamps sync days to the scheduling horizon", () => {
    const settings = {
      schedulingHorizonDays: 5,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 12 }
      }
    };
    const targets = getCalendarSyncTargets(settings);
    assert.deepStrictEqual(targets, [{ calendarId: "cal-1", syncDays: 5 }]);
  });

  it("returns no targets when sync is disabled", () => {
    const settings = {
      schedulingHorizonDays: 5,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: false }
      }
    };
    const targets = getCalendarSyncTargets(settings);
    assert.deepStrictEqual(targets, []);
  });

  it("builds sync items and skips unchanged events", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-1",
        title: "Deep work",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            occurrenceId: "occ-1"
          }
        ]
      }
    ];
    const existingEventsByCalendar = new Map([
      [
        "cal-1",
        [
          {
            id: "evt-1",
            start: new Date("2026-01-07T10:00:00Z"),
            end: new Date("2026-01-07T11:00:00Z"),
            extendedProperties: {
              private: {
                skedpalInstanceId: "task-1:occ-1"
              }
            }
          }
        ]
      ]
    ]);
    const plan = buildCalendarSyncPlan({
      tasks,
      settings,
      now,
      existingEventsByCalendar
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].eventId, "evt-1");
    assert.strictEqual(plan[0].action, "update");
    assert.strictEqual(plan[0].skip, true);
  });

  it("adds color ids based on timemap colors", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      taskBackgroundMode: "timemap",
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const timeMaps = [{ id: "tm-1", color: "#a4bdfc" }];
    const tasks = [
      {
        id: "task-6",
        title: "Color sync",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            timeMapId: "tm-1",
            occurrenceId: "occ-1"
          }
        ]
      }
    ];
    const existingEventsByCalendar = new Map([
      [
        "cal-1",
        [
          {
            id: "evt-6",
            start: new Date("2026-01-07T10:00:00Z"),
            end: new Date("2026-01-07T11:00:00Z"),
            colorId: "1",
            extendedProperties: {
              private: {
                skedpalInstanceId: "task-6:occ-1"
              }
            }
          }
        ]
      ]
    ]);
    const plan = buildCalendarSyncPlan({
      tasks,
      timeMaps,
      settings,
      now,
      existingEventsByCalendar
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].colorId, "1");
    assert.strictEqual(plan[0].skip, true);
  });

  it("updates when event colors drift", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      taskBackgroundMode: "timemap",
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const timeMaps = [{ id: "tm-1", color: "#a4bdfc" }];
    const tasks = [
      {
        id: "task-7",
        title: "Color update",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          {
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            timeMapId: "tm-1",
            occurrenceId: "occ-1"
          }
        ]
      }
    ];
    const existingEventsByCalendar = new Map([
      [
        "cal-1",
        [
          {
            id: "evt-7",
            start: new Date("2026-01-07T10:00:00Z"),
            end: new Date("2026-01-07T11:00:00Z"),
            colorId: "2",
            extendedProperties: {
              private: {
                skedpalInstanceId: "task-7:occ-1"
              }
            }
          }
        ]
      ]
    ]);
    const plan = buildCalendarSyncPlan({
      tasks,
      timeMaps,
      settings,
      now,
      existingEventsByCalendar
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].colorId, "1");
    assert.strictEqual(plan[0].skip, false);
  });

  it("adds a fallback color when background mode is none", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      taskBackgroundMode: "none",
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-8",
        title: "Muted",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          { start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" }
        ]
      }
    ];
    const plan = buildCalendarSyncPlan({ tasks, settings, now });
    assert.strictEqual(plan.length, 1);
    assert.ok(plan[0].colorId);
  });

  it("builds instance ids without occurrence ids", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      schedulingHorizonDays: 2,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-2",
        title: "Single block",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          { start: "2026-01-07T12:00:00Z", end: "2026-01-07T13:00:00Z" }
        ]
      }
    ];
    const plan = buildCalendarSyncPlan({ tasks, settings, now });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].action, "create");
    assert.ok(plan[0].instanceId.includes(":index:0"));
  });

  it("ignores completed or unscheduled tasks", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      schedulingHorizonDays: 2,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-3",
        title: "Done",
        completed: true,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          { start: "2026-01-07T12:00:00Z", end: "2026-01-07T13:00:00Z" }
        ]
      },
      {
        id: "task-4",
        title: "Unscheduled",
        completed: false,
        scheduleStatus: "unscheduled",
        scheduledInstances: [
          { start: "2026-01-07T14:00:00Z", end: "2026-01-07T15:00:00Z" }
        ]
      }
    ];
    const plan = buildCalendarSyncPlan({ tasks, settings, now });
    assert.strictEqual(plan.length, 0);
  });

  it("adds delete items for events no longer in the plan", () => {
    const now = new Date("2026-01-07T00:00:00Z");
    const settings = {
      schedulingHorizonDays: 2,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const existingEventsByCalendar = new Map([
      [
        "cal-1",
        [
          {
            id: "evt-9",
            title: "Old",
            start: new Date("2026-01-07T09:00:00Z"),
            end: new Date("2026-01-07T10:00:00Z"),
            extendedProperties: {
              private: {
                skedpalInstanceId: "task-9:index:0"
              }
            }
          }
        ]
      ]
    ]);
    const plan = buildCalendarSyncPlan({
      tasks: [],
      settings,
      now,
      existingEventsByCalendar
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].action, "delete");
    assert.strictEqual(plan[0].eventId, "evt-9");
  });

  it("starts a sync job and stores it in cache", async () => {
    let alarmCreated = null;
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: (name, info) => {
          alarmCreated = { name, info };
        },
        clear: () => {},
        onAlarm: { addListener: () => {} }
      }
    };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] })
    });
    const settings = {
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-1",
        title: "Sync me",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          { start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" }
        ]
      }
    ];
    const result = await startCalendarSyncJob({ tasks, settings, now: new Date("2026-01-07T00:00:00Z") });
    const cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    assert.strictEqual(result.started, true);
    assert.ok(cached?.value?.items?.length);
    assert.ok(alarmCreated);
  });

  it("does not start when no sync targets exist", async () => {
    globalThis.chrome = {
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} }
      }
    };
    const result = await startCalendarSyncJob({ tasks: [], settings: {} });
    assert.strictEqual(result.started, false);
  });

  it("returns false when resuming with no pending job", async () => {
    const resumed = await resumeCalendarSyncJob();
    assert.strictEqual(resumed, false);
  });

  it("resumes a pending job and schedules the next step", async () => {
    let alarmCreated = null;
    globalThis.chrome = {
      alarms: {
        create: (name, info) => {
          alarmCreated = { name, info };
        },
        clear: () => {},
        onAlarm: { addListener: () => {} }
      }
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: { id: "job-1", cursor: 0, items: [{ id: "item-1" }] },
      updatedAt: new Date().toISOString()
    });
    const resumed = await resumeCalendarSyncJob();
    assert.strictEqual(resumed, true);
    assert.ok(alarmCreated);
  });

  it("registers the alarm listener and advances a skipped item", async () => {
    let alarmHandler = null;
    globalThis.chrome = {
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-2",
        cursor: 0,
        items: [
          {
            calendarId: "cal-1",
            skip: true
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    assert.ok(alarmHandler);
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    let cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    for (let attempt = 0; attempt < 5 && cached; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    }
    assert.strictEqual(cached, null);
  });

  it("clears completed jobs when the cursor is at the end", async () => {
    let alarmHandler = null;
    globalThis.chrome = {
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-3",
        cursor: 1,
        items: [{ calendarId: "cal-1", skip: true }]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    assert.ok(alarmHandler);
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    let cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    for (let attempt = 0; attempt < 5 && cached; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    }
    assert.strictEqual(cached, null);
  });

  it("schedules another alarm when items remain", async () => {
    let alarmHandler = null;
    let alarmCreated = null;
    globalThis.chrome = {
      alarms: {
        create: (name, info) => {
          alarmCreated = { name, info };
        },
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-4",
        cursor: 0,
        items: [
          { calendarId: "cal-1", skip: true },
          { calendarId: "cal-1", skip: true }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    for (let attempt = 0; attempt < 5 && !alarmCreated; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(alarmCreated);
  });

  it("continues when calendar event fetches fail", async () => {
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} }
      }
    };
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "fail"
    });
    const settings = {
      schedulingHorizonDays: 3,
      googleCalendarTaskSettings: {
        "cal-1": { syncScheduledEvents: true, syncDays: 2 }
      }
    };
    const tasks = [
      {
        id: "task-5",
        title: "Fallback",
        completed: false,
        scheduleStatus: "scheduled",
        scheduledInstances: [
          { start: "2026-01-07T10:00:00Z", end: "2026-01-07T11:00:00Z" }
        ]
      }
    ];
    const result = await startCalendarSyncJob({ tasks, settings, now: new Date("2026-01-07T00:00:00Z") });
    assert.strictEqual(result.started, true);
  });

  it("clears alarms when no job exists", async () => {
    let alarmHandler = null;
    let cleared = false;
    globalThis.chrome = {
      alarms: {
        create: () => {},
        clear: () => {
          cleared = true;
        },
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    for (let attempt = 0; attempt < 5 && !cleared; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.strictEqual(cleared, true);
  });

  it("updates existing events during sync steps", async () => {
    let alarmHandler = null;
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({})
    });
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-5",
        cursor: 0,
        items: [
          {
            action: "update",
            calendarId: "cal-1",
            eventId: "evt-1",
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            skip: false
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    let cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    for (let attempt = 0; attempt < 5 && cached; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    }
    assert.strictEqual(cached, null);
  });

  it("deletes orphaned events during sync steps", async () => {
    let alarmHandler = null;
    let lastMethod = "";
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    globalThis.fetch = async (_url, options) => {
      lastMethod = options?.method || "";
      return { ok: true, status: 204, text: async () => "" };
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-6",
        cursor: 0,
        items: [
          {
            action: "delete",
            calendarId: "cal-1",
            eventId: "evt-2",
            skip: false
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    let cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    for (let attempt = 0; attempt < 5 && cached; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    }
    assert.strictEqual(lastMethod, "DELETE");
    assert.strictEqual(cached, null);
  });

  it("creates new events during sync steps", async () => {
    let alarmHandler = null;
    let lastMethod = "";
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    globalThis.fetch = async (_url, options) => {
      lastMethod = options?.method || "";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "evt-3",
          summary: "Created",
          start: { dateTime: "2026-01-07T10:00:00Z" },
          end: { dateTime: "2026-01-07T11:00:00Z" }
        })
      };
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-7",
        cursor: 0,
        items: [
          {
            action: "create",
            calendarId: "cal-1",
            title: "Create me",
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            skip: false
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    for (let attempt = 0; attempt < 5 && !lastMethod; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.strictEqual(lastMethod, "POST");
  });

  it("continues when sync step writes fail", async () => {
    let alarmHandler = null;
    globalThis.chrome = {
      identity: {
        lastError: null,
        getAuthToken: (_opts, cb) => cb("token")
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: {
          addListener: (handler) => {
            alarmHandler = handler;
          }
        }
      }
    };
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: {
        id: "job-9",
        cursor: 0,
        items: [
          {
            action: "update",
            calendarId: "cal-1",
            eventId: "evt-4",
            start: "2026-01-07T10:00:00Z",
            end: "2026-01-07T11:00:00Z",
            skip: false
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    initCalendarSyncAlarms();
    await alarmHandler({ name: "skedpal-calendar-sync-step" });
    let cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    for (let attempt = 0; attempt < 5 && cached; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cached = await getCalendarCacheEntry(GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY);
    }
    assert.strictEqual(cached, null);
  });

  it("uses a timeout fallback when alarms are unavailable", async () => {
    globalThis.chrome = undefined;
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: { id: "job-8", cursor: 0, items: [{ skip: true }] },
      updatedAt: new Date().toISOString()
    });
    const resumed = await resumeCalendarSyncJob();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(resumed, true);
  });

  it("clears the fallback timeout before rescheduling", async () => {
    globalThis.chrome = undefined;
    await saveCalendarCacheEntry({
      key: GOOGLE_CALENDAR_SYNC_JOB_CACHE_KEY,
      value: { id: "job-10", cursor: 0, items: [{ skip: true }] },
      updatedAt: new Date().toISOString()
    });
    const first = await resumeCalendarSyncJob();
    const second = await resumeCalendarSyncJob();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(first, true);
    assert.strictEqual(second, true);
  });
});
