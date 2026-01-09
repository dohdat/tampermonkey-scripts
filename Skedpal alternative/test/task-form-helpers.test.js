import assert from "assert";
import { describe, it } from "mocha";
import {
  resolveInheritedSubtaskScheduleMode,
  resolveSavedSubtaskScheduleMode,
  shouldShowSubtaskSchedule
} from "../src/ui/tasks/task-form-helpers.js";

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

  it("shows subtask scheduling for parent tasks or top-level tasks", () => {
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: null }, false), true);
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: "parent" }, false), false);
    assert.strictEqual(shouldShowSubtaskSchedule({ subtaskParentId: "parent" }, true), true);
    assert.strictEqual(shouldShowSubtaskSchedule(null, false), false);
  });
});
