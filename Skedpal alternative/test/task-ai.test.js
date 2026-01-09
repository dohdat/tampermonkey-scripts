import assert from "assert";
import { describe, it } from "mocha";

global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null
};

const { parseTaskListResponse } = await import("../src/ui/tasks/task-ai.js");

describe("task ai parser", () => {
  it("parses fenced JSON task lists", () => {
    const input = [
      "```json",
      "{\"tasks\":[{\"title\":\"Plan\",\"subtasks\":[\"Research\",\"Outline\"]},{\"title\":\"Build\",\"subtasks\":[]}]}",
      "```"
    ].join("\n");
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [
      { title: "Plan", subtasks: ["Research", "Outline"] },
      { title: "Build", subtasks: [] }
    ]);
  });

  it("returns empty list for invalid JSON", () => {
    const result = parseTaskListResponse("Not JSON");
    assert.deepStrictEqual(result, []);
  });

  it("trims empty titles and subtasks", () => {
    const input = "{\"tasks\":[{\"title\":\"  \",\"subtasks\":[\"Keep\"]},{\"title\":\"Ship\",\"subtasks\":[\"  \",\"Test\"]}]}";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [{ title: "Ship", subtasks: ["Test"] }]);
  });

  it("recovers tasks from truncated JSON", () => {
    const input = "{\"tasks\":[{\"title\":\"Collect receipts\",\"subtasks\":[\"Get bill\"]},{\"title\":\"Submit\"";
    const result = parseTaskListResponse(input);
    assert.deepStrictEqual(result, [
      { title: "Collect receipts", subtasks: ["Get bill"] },
      { title: "Submit", subtasks: [] }
    ]);
  });
});
