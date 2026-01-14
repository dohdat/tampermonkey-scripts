import assert from "assert";
import { describe, it } from "mocha";

import { INDEX_NOT_FOUND } from "../src/constants.js";
import { compareSequentialIndex } from "../src/core/scheduler/sequential-utils.js";

describe("sequential-utils", () => {
  it("compares sequential indices across missing and numeric values", () => {
    assert.strictEqual(compareSequentialIndex(undefined, undefined), 0);
    assert.strictEqual(compareSequentialIndex(undefined, 1), 1);
    assert.strictEqual(compareSequentialIndex(1, undefined), INDEX_NOT_FOUND);
    assert.strictEqual(compareSequentialIndex(1, 2), INDEX_NOT_FOUND);
    assert.strictEqual(compareSequentialIndex(2, 1), 1);
    assert.strictEqual(compareSequentialIndex(2, 2), 0);
  });
});
