import assert from "assert";
import { describe, it } from "mocha";

import {
  buildReminderEntry,
  mergeReminderEntries,
  normalizeReminders,
  removeReminderEntry
} from "../src/ui/tasks/task-reminders-helpers.js";

describe("task reminder helpers", () => {
  it("normalizes reminder entries and filters invalid records", () => {
    const normalized = normalizeReminders([
      null,
      { id: "keep-1", days: "2", remindAt: "2026-01-10T10:00:00.000Z" },
      { id: "drop-1", days: 0, remindAt: "2026-01-10T10:00:00.000Z" },
      { id: "drop-2", days: 2, remindAt: "" },
      { id: "keep-2", days: 1, remindAt: "2026-01-09T10:00:00.000Z", dismissedAt: "x" }
    ]);
    assert.strictEqual(normalized.length, 2);
    assert.strictEqual(normalized[0].id, "keep-1");
    assert.strictEqual(normalized[0].createdAt, "2026-01-10T10:00:00.000Z");
    assert.strictEqual(normalized[1].dismissedAt, "x");
  });

  it("builds reminder entries using the provided base time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const entry = buildReminderEntry(3, now);
    assert.ok(entry.id);
    assert.strictEqual(entry.days, 3);
    assert.strictEqual(entry.createdAt, now.toISOString());
    assert.strictEqual(entry.remindAt, "2026-01-04T00:00:00.000Z");
  });

  it("merges reminder day values without duplicates and ignores dismissed only for collisions", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const existing = [
      { id: "r1", days: 1, remindAt: "2026-01-02T00:00:00.000Z", dismissedAt: "" },
      { id: "r2", days: 2, remindAt: "2026-01-03T00:00:00.000Z", dismissedAt: "x" }
    ];
    const merged = mergeReminderEntries(existing, [1, 2, 3, "3", -1, "bad"], now);
    assert.strictEqual(merged.added, true);
    const days = merged.reminders.map((entry) => entry.days).sort((a, b) => a - b);
    assert.deepStrictEqual(days, [1, 2, 2, 3]);
  });

  it("returns unchanged reminders when no new reminder days are valid", () => {
    const existing = [{ id: "r1", days: 1, remindAt: "2026-01-02T00:00:00.000Z" }];
    const merged = mergeReminderEntries(existing, [0, -1, "bad"]);
    assert.strictEqual(merged.added, false);
    assert.deepStrictEqual(merged.reminders.map((r) => r.id), ["r1"]);
  });

  it("removes a reminder entry by id", () => {
    const list = [{ id: "a" }, { id: "b" }];
    assert.deepStrictEqual(removeReminderEntry(list, "b"), {
      reminders: [{ id: "a" }],
      removed: true
    });
    assert.deepStrictEqual(removeReminderEntry(list, "missing"), {
      reminders: list,
      removed: false
    });
    assert.deepStrictEqual(removeReminderEntry(null, "x"), {
      reminders: [],
      removed: false
    });
  });
});
