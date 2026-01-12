import assert from "assert";
import { describe, it } from "mocha";
import { buildBackupExportPayload, parseBackupImportJson } from "../src/ui/backup-transfer.js";

describe("backup transfer", () => {
  it("builds export payload with defaults", () => {
    const payload = buildBackupExportPayload({ tasks: [{ id: "t1" }] });
    const parsed = JSON.parse(payload);
    assert.ok(parsed.createdAt);
    assert.deepStrictEqual(parsed.tasks, [{ id: "t1" }]);
    assert.deepStrictEqual(parsed.timeMaps, []);
    assert.deepStrictEqual(parsed.taskTemplates, []);
    assert.deepStrictEqual(parsed.settings, {});
  });

  it("parses import JSON and normalizes shape", () => {
    const snapshot = parseBackupImportJson(JSON.stringify({ tasks: [], settings: { foo: "bar" } }));
    assert.ok(snapshot.createdAt);
    assert.deepStrictEqual(snapshot.tasks, []);
    assert.deepStrictEqual(snapshot.timeMaps, []);
    assert.deepStrictEqual(snapshot.taskTemplates, []);
    assert.deepStrictEqual(snapshot.settings, { foo: "bar" });
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseBackupImportJson("{not-json}"), /Invalid JSON backup file/);
  });
});
