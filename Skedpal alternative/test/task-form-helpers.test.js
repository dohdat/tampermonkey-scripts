import assert from "assert";
import { describe, it } from "mocha";
import {
  buildSubtaskFormValues,
  buildTemplateFormValues,
  hasValidTimeMapSelection,
  resolveInheritedSubtaskScheduleMode,
  resolveSavedSubtaskScheduleMode,
  shouldShowSubtaskSchedule
} from "../src/ui/tasks/task-form-helpers.js";
import { EXTERNAL_CALENDAR_TIMEMAP_PREFIX } from "../src/constants.js";
import { state } from "../src/ui/state/page-state.js";

describe("task form helpers", () => {
  it("normalizes inherited subtask schedule mode", () => {
    assert.strictEqual(
      resolveInheritedSubtaskScheduleMode({ subtaskScheduleMode: "sequential-single" }),
      "sequential-single"
    );
    assert.strictEqual(
      resolveInheritedSubtaskScheduleMode({ subtaskScheduleMode: "sequential" }),
      "sequential"
    );
    assert.strictEqual(
      resolveInheritedSubtaskScheduleMode({ subtaskScheduleMode: "unknown" }),
      "parallel"
    );
    assert.strictEqual(resolveInheritedSubtaskScheduleMode(null), "parallel");
  });

  it("uses selected schedule mode when selector is visible", () => {
    assert.strictEqual(
      resolveSavedSubtaskScheduleMode({
        selectedMode: "sequential-single",
        existingMode: "parallel",
        isSelectorVisible: true
      }),
      "sequential-single"
    );
  });

  it("keeps existing schedule mode when selector is hidden", () => {
    assert.strictEqual(
      resolveSavedSubtaskScheduleMode({
        selectedMode: "sequential",
        existingMode: "parallel",
        isSelectorVisible: false
      }),
      "parallel"
    );
  });

  it("falls back to selected schedule mode when hidden and existing is missing", () => {
    assert.strictEqual(
      resolveSavedSubtaskScheduleMode({
        selectedMode: "sequential",
        existingMode: "",
        isSelectorVisible: false
      }),
      "sequential"
    );
  });

  it("shows subtask scheduling for parent tasks or top-level tasks", () => {
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: null }, false), true);
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: "parent" }, false), false);
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: "parent" }, true), true);
    assert.strictEqual(shouldShowSubtaskSchedule(null, false), false);
  });

  it("validates timemap selections with cache awareness", () => {
    const originalCache = state.tasksTimeMapsCache;
    state.tasksTimeMapsCache = null;
    assert.strictEqual(hasValidTimeMapSelection(["any"]), true);
    state.tasksTimeMapsCache = [{ id: "tm-1" }];
    assert.strictEqual(
      hasValidTimeMapSelection([`${EXTERNAL_CALENDAR_TIMEMAP_PREFIX}cal-1`]),
      false
    );
    assert.strictEqual(hasValidTimeMapSelection("bad"), false);
    state.tasksTimeMapsCache = originalCache;
  });

  it("builds template and subtask values with defaults", () => {
    const templateValues = buildTemplateFormValues({});
    assert.strictEqual(templateValues.title, "");
    assert.ok(templateValues.durationMin);

    const subtaskValues = buildSubtaskFormValues({ id: "task-1", title: "" });
    assert.strictEqual(subtaskValues.title, "");
    assert.ok(subtaskValues.minBlockMin);
  });
});
