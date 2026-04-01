import assert from "assert";
import { describe, it } from "mocha";
import { BACKUP_AUTO_INTERVAL_MS } from "../src/core/constants.js";
import {
  isAutomaticBackupDue,
  runAutomaticBackupIfDue
} from "../src/ui/backup-auto.js";

describe("automatic backup", () => {
  it("treats missing latest backup as due", () => {
    assert.strictEqual(
      isAutomaticBackupDue(null, "2026-03-31T10:00:00.000Z"),
      true
    );
  });

  it("does not run when latest backup is newer than the interval", () => {
    const now = new Date("2026-03-31T10:00:00.000Z");
    const latestBackup = {
      createdAt: new Date(now.getTime() - BACKUP_AUTO_INTERVAL_MS + 1).toISOString()
    };
    assert.strictEqual(isAutomaticBackupDue(latestBackup, now), false);
  });

  it("runs when latest backup age reaches the interval", () => {
    const now = new Date("2026-03-31T10:00:00.000Z");
    const latestBackup = {
      createdAt: new Date(now.getTime() - BACKUP_AUTO_INTERVAL_MS).toISOString()
    };
    assert.strictEqual(isAutomaticBackupDue(latestBackup, now), true);
  });

  it("treats malformed latest backup timestamps as due", () => {
    assert.strictEqual(
      isAutomaticBackupDue({ createdAt: "not-a-date" }, "2026-03-31T10:00:00.000Z"),
      true
    );
  });

  it("saves a snapshot when an automatic backup is due", async () => {
    const calls = [];
    const result = await runAutomaticBackupIfDue({
      latestBackup: null,
      now: "2026-03-31T10:00:00.000Z",
      createSnapshot: async () => ({ createdAt: "2026-03-31T10:00:00.000Z", tasks: [] }),
      saveBackup: async (snapshot) => {
        calls.push(snapshot);
      }
    });

    assert.strictEqual(result.ran, true);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], result.snapshot);
  });

  it("does not save when automatic backup is not due", async () => {
    let calls = 0;
    const now = new Date("2026-03-31T10:00:00.000Z");
    const result = await runAutomaticBackupIfDue({
      latestBackup: {
        createdAt: new Date(now.getTime() - BACKUP_AUTO_INTERVAL_MS + 10).toISOString()
      },
      now,
      createSnapshot: async () => ({ createdAt: now.toISOString(), tasks: [] }),
      saveBackup: async () => {
        calls += 1;
      }
    });

    assert.strictEqual(result.ran, false);
    assert.strictEqual(result.snapshot, null);
    assert.strictEqual(calls, 0);
  });

  it("fills a missing snapshot timestamp with the provided now value", async () => {
    let saved = null;
    const nowIso = "2026-03-31T10:00:00.000Z";
    const result = await runAutomaticBackupIfDue({
      latestBackup: null,
      now: nowIso,
      createSnapshot: async () => ({ tasks: [] }),
      saveBackup: async (snapshot) => {
        saved = snapshot;
      }
    });

    assert.strictEqual(result.ran, true);
    assert.ok(saved?.createdAt);
    assert.strictEqual(saved.createdAt, nowIso);
  });
});
