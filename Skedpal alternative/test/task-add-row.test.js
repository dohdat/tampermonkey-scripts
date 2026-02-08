import assert from "assert";
import { describe, it } from "mocha";
import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  SUBTASK_SCHEDULE_SEQUENTIAL
} from "../src/ui/constants.js";
import {
  buildQuickAddTaskPayload,
  buildQuickAddTaskPayloadsFromTitles,
  parseClipboardTaskTitles
} from "../src/ui/tasks/task-add-row.js";
import { parseLocalDateInput } from "../src/ui/utils.js";
import { state } from "../src/ui/state/page-state.js";

describe("task add row helpers", () => {
  it("builds a quick-add payload with defaults and ordering", () => {
    const payload = buildQuickAddTaskPayload({
      id: "task-new",
      title: "  Quick add  ",
      sectionId: "section-a",
      subsectionId: "",
      tasks: [
        { id: "task-1", section: "section-a", subsection: "", order: 2 }
      ],
      settings: { defaultTimeMapId: "tm-default" }
    });

    assert.strictEqual(payload.id, "task-new");
    assert.strictEqual(payload.title, "Quick add");
    assert.strictEqual(payload.section, "section-a");
    assert.strictEqual(payload.subsection, "");
    assert.strictEqual(payload.order, 3);
    assert.strictEqual(payload.durationMin, DEFAULT_TASK_DURATION_MIN);
    assert.strictEqual(payload.minBlockMin, DEFAULT_TASK_MIN_BLOCK_MIN);
    assert.strictEqual(payload.priority, DEFAULT_TASK_PRIORITY);
    assert.deepStrictEqual(payload.timeMapIds, ["tm-default"]);
  });

  it("respects subsection template fields when provided", () => {
    const template = {
      durationMin: 45,
      minBlockMin: 30,
      priority: 5,
      deadline: "2026-01-10",
      startFrom: "2026-01-09",
      repeat: { type: "custom", interval: 2 },
      timeMapIds: ["tm-a"],
      subtaskScheduleMode: SUBTASK_SCHEDULE_SEQUENTIAL,
      link: "https://example.com/task"
    };
    const payload = buildQuickAddTaskPayload({
      id: "task-template",
      title: "Template task",
      sectionId: "section-b",
      subsectionId: "sub-1",
      tasks: [],
      template,
      settings: {}
    });

    assert.strictEqual(payload.durationMin, 45);
    assert.strictEqual(payload.minBlockMin, 30);
    assert.strictEqual(payload.priority, 5);
    assert.strictEqual(payload.link, "https://example.com/task");
    assert.deepStrictEqual(payload.timeMapIds, ["tm-a"]);
    assert.deepStrictEqual(payload.repeat, template.repeat);
    assert.strictEqual(payload.subtaskScheduleMode, SUBTASK_SCHEDULE_SEQUENTIAL);
    assert.strictEqual(payload.deadline, parseLocalDateInput(template.deadline));
    assert.strictEqual(payload.startFrom, parseLocalDateInput(template.startFrom));
  });

  it("parses clipboard text into task titles", () => {
    const titles = parseClipboardTaskTitles(" - Alpha \n2) Beta\n\nGamma");
    assert.deepStrictEqual(titles, ["Alpha", "Beta", "Gamma"]);
  });

  it("returns an empty list for empty clipboard text", () => {
    assert.deepStrictEqual(parseClipboardTaskTitles(""), []);
  });

  it("builds sequential quick-add payloads for multiple titles", () => {
    const payloads = buildQuickAddTaskPayloadsFromTitles({
      titles: ["First", "Second"],
      sectionId: "section-a",
      subsectionId: "",
      tasks: [{ id: "task-1", section: "section-a", subsection: "", order: 2 }]
    });

    assert.strictEqual(payloads.length, 2);
    assert.strictEqual(payloads[0].order, 3);
    assert.strictEqual(payloads[1].order, 4);
  });

  it("uses subsection templates when available", () => {
    const previousSettings = state.settingsCache;
    state.settingsCache = {
      ...state.settingsCache,
      subsections: {
        sectionX: [
          {
            id: "subX",
            name: "Sub",
            template: {
              durationMin: 50,
              minBlockMin: 20,
              priority: 4,
              timeMapIds: ["tm-template"],
              deadline: "2026-01-20"
            }
          }
        ]
      }
    };
    const payload = buildQuickAddTaskPayload({
      id: "task-from-template",
      title: "Template-based",
      sectionId: "sectionX",
      subsectionId: "subX",
      tasks: []
    });
    assert.strictEqual(payload.durationMin, 50);
    assert.strictEqual(payload.minBlockMin, 20);
    assert.strictEqual(payload.priority, 4);
    assert.deepStrictEqual(payload.timeMapIds, ["tm-template"]);
    assert.strictEqual(payload.deadline, parseLocalDateInput("2026-01-20"));
    state.settingsCache = previousSettings;
  });

  it("builds payloads for parent tasks", () => {
    const parentTask = {
      id: "parent-task",
      section: "sec-parent",
      subsection: "sub-parent",
      order: 1,
      repeatAnchor: "2026-01-01"
    };
    const payload = buildQuickAddTaskPayload({
      id: "child-task",
      title: "Follow up soon",
      parentTask,
      tasks: [parentTask]
    });
    assert.strictEqual(payload.subtaskParentId, parentTask.id);
    assert.strictEqual(payload.section, "sec-parent");
    assert.strictEqual(payload.subsection, "sub-parent");
  });

  it("handles non-array task lists when building payloads", () => {
    const payloads = buildQuickAddTaskPayloadsFromTitles({
      titles: ["One", "", "Two"],
      tasks: null
    });
    assert.strictEqual(payloads.length, 2);
    assert.strictEqual(payloads[0].order, 1);
    assert.strictEqual(payloads[1].order, 2);
  });
});
