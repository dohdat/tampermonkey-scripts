import assert from "assert";
import { describe, it, before } from "mocha";
import {
  SUBTASK_SCHEDULE_SEQUENTIAL,
  SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE
} from "../src/constants.js";

function installDocumentStub() {
  global.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  };
}

describe("task template payload helpers", () => {
  let buildTemplatePayload;
  let buildTemplateSubtaskPayload;
  let cloneTemplateSubtasks;
  let repeatStore;

  before(async () => {
    installDocumentStub();
    ({ buildTemplatePayload, buildTemplateSubtaskPayload, cloneTemplateSubtasks } =
      await import("../src/ui/tasks/task-template-payload.js"));
    ({ repeatStore } = await import("../src/ui/repeat.js"));
  });

  it("builds template payload with existing order and schedule mode", () => {
    repeatStore.lastRepeatSelection = { type: "custom", unit: "week", interval: 2 };
    const values = {
      id: "t1",
      title: "Template",
      link: "",
      durationMin: 30,
      minBlockMin: 15,
      priority: 3,
      deadline: "2026-01-12",
      startFrom: "2026-01-10",
      timeMapIds: ["tm-1"]
    };
    const existing = { subtasks: [{ id: "s1" }], order: 7 };
    const payload = buildTemplatePayload(values, existing, {
      nextOrder: 4,
      subtaskScheduleMode: SUBTASK_SCHEDULE_SEQUENTIAL
    });

    assert.strictEqual(payload.order, 7);
    assert.strictEqual(payload.subtaskScheduleMode, SUBTASK_SCHEDULE_SEQUENTIAL);
    assert.deepStrictEqual(payload.subtasks, existing.subtasks);
  });

  it("assigns a next order for new templates", () => {
    repeatStore.lastRepeatSelection = { type: "none" };
    const values = {
      id: "t2",
      title: "New",
      link: "",
      durationMin: 25,
      minBlockMin: 15,
      priority: 2,
      deadline: "",
      startFrom: "",
      timeMapIds: []
    };
    const payload = buildTemplatePayload(values, null, {
      nextOrder: 9,
      subtaskScheduleMode: SUBTASK_SCHEDULE_SEQUENTIAL
    });

    assert.strictEqual(payload.order, 9);
  });

  it("builds template subtasks with parent fallback and schedule mode", () => {
    repeatStore.lastRepeatSelection = { type: "custom", unit: "day", interval: 1 };
    const values = {
      id: "s1",
      title: "Child",
      link: "",
      durationMin: 20,
      minBlockMin: 10,
      priority: 1,
      deadline: "",
      startFrom: "",
      timeMapIds: []
    };
    const existing = { subtaskParentId: "parent-1" };
    const payload = buildTemplateSubtaskPayload(
      values,
      "s1",
      null,
      existing,
      SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE
    );

    assert.strictEqual(payload.subtaskParentId, "parent-1");
    assert.strictEqual(payload.subtaskScheduleMode, SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE);
  });

  it("honors explicit parent ids for template subtasks", () => {
    const values = {
      id: "s2",
      title: "Child",
      link: "",
      durationMin: 15,
      minBlockMin: 5,
      priority: 1,
      deadline: "",
      startFrom: "",
      timeMapIds: []
    };
    const payload = buildTemplateSubtaskPayload(
      values,
      "s2",
      "parent-2",
      null,
      SUBTASK_SCHEDULE_SEQUENTIAL
    );

    assert.strictEqual(payload.subtaskParentId, "parent-2");
  });

  it("keeps falsy but defined parent ids for template subtasks", () => {
    const values = {
      id: "s2b",
      title: "Child",
      link: "",
      durationMin: 15,
      minBlockMin: 5,
      priority: 1,
      deadline: "",
      startFrom: "",
      timeMapIds: []
    };
    const payload = buildTemplateSubtaskPayload(
      values,
      "s2b",
      0,
      null,
      SUBTASK_SCHEDULE_SEQUENTIAL
    );

    assert.strictEqual(payload.subtaskParentId, 0);
  });

  it("clears parent ids when none are provided", () => {
    const values = {
      id: "s3",
      title: "Loose",
      link: "",
      durationMin: 10,
      minBlockMin: 5,
      priority: 1,
      deadline: "",
      startFrom: "",
      timeMapIds: []
    };
    const payload = buildTemplateSubtaskPayload(values, "s3", null, null, "invalid");

    assert.strictEqual(payload.subtaskParentId, null);
  });

  it("clones template subtask arrays defensively", () => {
    const original = [{ id: "s1" }];
    const clone = cloneTemplateSubtasks(original);
    assert.deepStrictEqual(clone, original);
    assert.notStrictEqual(clone, original);
  });

  it("returns empty arrays when cloning invalid subtask lists", () => {
    assert.deepStrictEqual(cloneTemplateSubtasks(null), []);
  });
});
