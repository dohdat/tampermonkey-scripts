import assert from "assert";
import { describe, it } from "mocha";
import {
  buildCalendarTaskUpdates,
  buildCalendarTaskPayload,
  buildGoogleCalendarTaskId,
  getCalendarTaskCalendarIds,
  getCalendarTaskSettings
} from "../src/ui/calendar-task-import.js";
import { TASK_STATUS_COMPLETED } from "../src/ui/constants.js";

describe("calendar task import", () => {
  it("builds stable task ids for calendar events", () => {
    const id = buildGoogleCalendarTaskId("cal-1", "evt-1");
    assert.strictEqual(id, "google-calendar-task:cal-1:evt-1");
  });

  it("collects treated calendar ids", () => {
    const ids = getCalendarTaskCalendarIds({
      googleCalendarTaskSettings: {
        "cal-1": { treatAsTasks: true },
        "cal-2": { treatAsTasks: false }
      }
    });
    assert.deepStrictEqual([...ids], ["cal-1"]);
  });

  it("returns defaults when calendar id is missing", () => {
    const settings = {
      googleCalendarTaskSettings: { "cal-1": { treatAsTasks: true } }
    };
    assert.deepStrictEqual(getCalendarTaskSettings(settings, ""), {
      treatAsTasks: false,
      sectionId: "",
      subsectionId: ""
    });
  });

  it("builds task payloads for treated calendars", () => {
    const start = new Date("2026-01-10T09:00:00Z");
    const end = new Date("2026-01-10T10:00:00Z");
    const settings = {
      defaultTimeMapId: "tm-default",
      googleCalendarTaskSettings: {
        "cal-1": { treatAsTasks: true, sectionId: "sec-1", subsectionId: "sub-1" }
      },
      subsections: {
        "sec-1": [
          {
            id: "sub-1",
            name: "Sub",
            template: { timeMapIds: ["tm-template"], priority: 4, durationMin: 45 }
          }
        ]
      }
    };
    const { tasksToSave, treatedCalendarIds } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-1",
          calendarId: "cal-1",
          title: "Planning",
          link: "https://calendar.google.com",
          start,
          end
        }
      ],
      settings,
      tasks: []
    });
    assert.strictEqual(tasksToSave.length, 1);
    assert.ok(treatedCalendarIds.has("cal-1"));
    const task = tasksToSave[0];
    assert.strictEqual(task.section, "sec-1");
    assert.strictEqual(task.subsection, "sub-1");
    assert.deepStrictEqual(task.timeMapIds, ["tm-template"]);
    assert.strictEqual(task.title, "Planning");
    assert.strictEqual(task.externalTitle, "Planning");
    assert.strictEqual(task.durationMin, 45);
  });

  it("keeps existing task placement choices", () => {
    const start = new Date("2026-01-11T13:00:00Z");
    const end = new Date("2026-01-11T14:30:00Z");
    const taskId = buildGoogleCalendarTaskId("cal-2", "evt-2");
    const existingTask = {
      id: taskId,
      title: "Old",
      section: "custom-sec",
      subsection: "",
      timeMapIds: ["tm-custom"],
      priority: 2,
      minBlockMin: 10,
      completed: false,
      scheduleStatus: "unscheduled",
      scheduledInstances: []
    };
    const settings = {
      defaultTimeMapId: "tm-default",
      googleCalendarTaskSettings: {
        "cal-2": { treatAsTasks: true, sectionId: "sec-2", subsectionId: "sub-2" }
      }
    };
    const { tasksToSave } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-2",
          calendarId: "cal-2",
          title: "Updated",
          link: "",
          start,
          end
        }
      ],
      settings,
      tasks: [existingTask]
    });
    assert.strictEqual(tasksToSave.length, 1);
    assert.strictEqual(tasksToSave[0].section, "custom-sec");
    assert.deepStrictEqual(tasksToSave[0].timeMapIds, ["tm-custom"]);
  });

  it("skips calendars not marked as tasks", () => {
    const start = new Date("2026-01-12T08:00:00Z");
    const end = new Date("2026-01-12T09:00:00Z");
    const { tasksToSave, treatedCalendarIds } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-4",
          calendarId: "cal-3",
          title: "Ignored",
          link: "",
          start,
          end
        }
      ],
      settings: {
        googleCalendarTaskSettings: { "cal-3": { treatAsTasks: false } }
      },
      tasks: []
    });
    assert.strictEqual(tasksToSave.length, 0);
    assert.strictEqual(treatedCalendarIds.size, 0);
  });

  it("preserves schedule fields for completed tasks", () => {
    const start = new Date("2026-01-13T10:00:00Z");
    const end = new Date("2026-01-13T11:00:00Z");
    const existingTask = {
      id: buildGoogleCalendarTaskId("cal-4", "evt-5"),
      completed: true,
      scheduleStatus: TASK_STATUS_COMPLETED,
      scheduledStart: "2026-01-13T10:00:00.000Z",
      scheduledEnd: "2026-01-13T11:00:00.000Z",
      scheduledInstances: [{ start: "2026-01-13T10:00:00.000Z", end: "2026-01-13T11:00:00.000Z" }]
    };
    const payload = buildCalendarTaskPayload({
      event: {
        id: "evt-5",
        calendarId: "cal-4",
        title: "Done",
        link: "",
        start,
        end
      },
      settings: {},
      sectionId: "",
      subsectionId: "",
      existingTask
    });
    assert.strictEqual(payload.scheduleStatus, TASK_STATUS_COMPLETED);
    assert.strictEqual(payload.scheduledStart, existingTask.scheduledStart);
    assert.strictEqual(payload.scheduledEnd, existingTask.scheduledEnd);
  });

  it("updates tasks when time map defaults change", () => {
    const start = new Date("2026-01-14T07:00:00Z");
    const end = new Date("2026-01-14T08:00:00Z");
    const taskId = buildGoogleCalendarTaskId("cal-5", "evt-6");
    const existingTask = {
      id: taskId,
      title: "Old",
      timeMapIds: [],
      scheduleStatus: "unscheduled"
    };
    const { tasksToSave } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-6",
          calendarId: "cal-5",
          title: "Old",
          link: "",
          start,
          end
        }
      ],
      settings: {
        defaultTimeMapId: "tm-default",
        googleCalendarTaskSettings: { "cal-5": { treatAsTasks: true } }
      },
      tasks: [existingTask]
    });
    assert.strictEqual(tasksToSave.length, 1);
    assert.deepStrictEqual(tasksToSave[0].timeMapIds, ["tm-default"]);
  });

  it("updates tasks when time map ids are missing", () => {
    const start = new Date("2026-01-15T09:00:00Z");
    const end = new Date("2026-01-15T10:00:00Z");
    const taskId = buildGoogleCalendarTaskId("cal-6", "evt-7");
    const existingTask = {
      id: taskId,
      title: "Missing maps",
      timeMapIds: null,
      scheduleStatus: "unscheduled"
    };
    const { tasksToSave } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-7",
          calendarId: "cal-6",
          title: "Missing maps",
          link: "",
          start,
          end
        }
      ],
      settings: {
        defaultTimeMapId: "tm-default",
        googleCalendarTaskSettings: { "cal-6": { treatAsTasks: true } }
      },
      tasks: [existingTask]
    });
    assert.strictEqual(tasksToSave.length, 1);
    assert.deepStrictEqual(tasksToSave[0].timeMapIds, ["tm-default"]);
  });

  it("preserves user title overrides for calendar tasks", () => {
    const start = new Date("2026-01-16T09:00:00Z");
    const end = new Date("2026-01-16T10:00:00Z");
    const taskId = buildGoogleCalendarTaskId("cal-7", "evt-8");
    const existingTask = {
      id: taskId,
      title: "My override",
      externalTitle: "Original title",
      timeMapIds: ["tm-default"],
      scheduleStatus: "unscheduled"
    };
    const { tasksToSave } = buildCalendarTaskUpdates({
      events: [
        {
          id: "evt-8",
          calendarId: "cal-7",
          title: "External updated",
          link: "",
          start,
          end
        }
      ],
      settings: {
        googleCalendarTaskSettings: { "cal-7": { treatAsTasks: true } }
      },
      tasks: [existingTask]
    });
    assert.strictEqual(tasksToSave.length, 1);
    assert.strictEqual(tasksToSave[0].title, "My override");
    assert.strictEqual(tasksToSave[0].externalTitle, "External updated");
  });
});
