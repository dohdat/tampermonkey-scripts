import assert from "assert";
import { describe, it } from "mocha";
import {
  buildTemplateFormValues,
  buildSubtaskFormValues,
  validateTaskForm
} from "../src/ui/tasks/task-form-helpers.js";
import { state } from "../src/ui/state/page-state.js";
import { EXTERNAL_CALENDAR_TIMEMAP_PREFIX } from "../src/constants.js";

describe("task form helpers", () => {
  it("builds template form values with defaults", () => {
    const values = buildTemplateFormValues(null);

    assert.strictEqual(values.title, "");
    assert.strictEqual(values.link, "");
    assert.strictEqual(values.durationMin, 30);
    assert.strictEqual(values.minBlockMin, 15);
    assert.strictEqual(values.priority, 3);
    assert.deepStrictEqual(values.repeat, { type: "none" });
  });

  it("does not inherit parent links when adding subtasks", () => {
    const parentTask = {
      id: "p1",
      title: "Parent task",
      link: "https://example.com",
      durationMin: 30,
      minBlockMin: 30,
      priority: 2,
      section: "",
      subsection: "",
      timeMapIds: ["tm-1"]
    };

    const values = buildSubtaskFormValues(parentTask);

    assert.strictEqual(values.link, "");
  });

  it("requires a subsection before saving a task", () => {
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subsection: "",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Select a subsection.");
  });

  it("rejects missing title or duration", () => {
    const error = validateTaskForm({
      title: "",
      durationMin: 0,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Title and duration are required.");
  });

  it("rejects durations that are too short or off-step", () => {
    const tooShort = validateTaskForm({
      title: "Task",
      durationMin: 10,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(
      tooShort,
      "Duration must be at least 15 minutes and in 15 minute steps."
    );

    const offStep = validateTaskForm({
      title: "Task",
      durationMin: 25,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(
      offStep,
      "Duration must be at least 15 minutes and in 15 minute steps."
    );
  });

  it("requires at least one TimeMap", () => {
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: [],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Select at least one TimeMap.");
  });

  it("requires a real TimeMap when only external calendars are selected", () => {
    state.tasksTimeMapsCache = [{ id: "tm-1", name: "Work" }];
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: [`${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Select at least one TimeMap.");
    state.tasksTimeMapsCache = [];
  });

  it("rejects start dates after deadlines", () => {
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "2026-01-10",
      deadline: "2026-01-09"
    });

    assert.strictEqual(error, "Start from cannot be after deadline.");
  });

  it("rejects titles longer than 90 characters", () => {
    const error = validateTaskForm({
      title: "a".repeat(91),
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "",
      deadline: ""
    });

    assert.strictEqual(error, "Title must be 90 characters or less.");
  });

  it("returns an empty string when the task values are valid", () => {
    const error = validateTaskForm({
      title: "Task",
      durationMin: 30,
      timeMapIds: ["tm-1"],
      subsection: "sub-1",
      startFrom: "2026-01-09",
      deadline: "2026-01-10"
    });

    assert.strictEqual(error, "");
  });
});
