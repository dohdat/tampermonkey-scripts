import assert from "assert";
import { describe, it } from "mocha";

import {
  addCollapsedId,
  buildSectionOrder,
  buildSubsectionListFromOrder
} from "../src/ui/sections-sortable-helpers.js";

describe("sections sortable helpers", () => {
  it("keeps unknown ids out of the ordered section list", () => {
    const sections = [
      { id: "s1", name: "Work" },
      { id: "s2", name: "Personal" }
    ];
    const ordered = buildSectionOrder(sections, ["missing", "s2"]);
    assert.deepStrictEqual(ordered.map((s) => s.id), ["s2", "s1"]);
    assert.deepStrictEqual(buildSectionOrder(null, ["s1"]), []);
  });

  it("updates parent ids when subsection order requests changes", () => {
    const list = [
      { id: "sub1", parentId: "" },
      { id: "sub2", parentId: "old" }
    ];
    const orderedNodes = [
      { id: "sub1", parentId: "p1" },
      { id: "missing", parentId: "p2" }
    ];
    const result = buildSubsectionListFromOrder(list, orderedNodes);
    assert.deepStrictEqual(
      result.map((s) => ({ id: s.id, parentId: s.parentId })),
      [
        { id: "sub1", parentId: "p1" },
        { id: "sub2", parentId: "old" }
      ]
    );
    assert.deepStrictEqual(buildSubsectionListFromOrder(null, orderedNodes), []);
  });

  it("adds collapsed ids while ignoring falsy or duplicate entries", () => {
    assert.deepStrictEqual(addCollapsedId(["a"], ""), ["a"]);
    assert.deepStrictEqual(addCollapsedId(["a"], "a"), ["a"]);
    assert.deepStrictEqual(addCollapsedId(null, "b"), ["b"]);
  });
});
