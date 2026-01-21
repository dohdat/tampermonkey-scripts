import assert from "assert";
import { describe, it } from "mocha";

const { buildSectionOrder, buildSubsectionListFromOrder, addCollapsedId } = await import(
  "../src/ui/sections-sortable-helpers.js"
);

describe("sections sortable", () => {
  it("orders sections by the dragged id list", () => {
    const sections = [
      { id: "s1", name: "One" },
      { id: "s2", name: "Two" },
      { id: "s3", name: "Three" }
    ];
    const ordered = buildSectionOrder(sections, ["s3", "s1"]);
    assert.deepStrictEqual(
      ordered.map((section) => section.id),
      ["s3", "s1", "s2"]
    );
  });

  it("updates subsection parents based on drag order nodes", () => {
    const list = [
      { id: "sub-1", name: "A", parentId: "" },
      { id: "sub-2", name: "B", parentId: "" },
      { id: "sub-3", name: "C", parentId: "sub-2" }
    ];
    const orderedNodes = [
      { id: "sub-2", parentId: "" },
      { id: "sub-1", parentId: "sub-2" },
      { id: "sub-3", parentId: "sub-2" }
    ];
    const updated = buildSubsectionListFromOrder(list, orderedNodes);
    const byId = new Map(updated.map((item) => [item.id, item]));
    assert.deepStrictEqual(
      updated.map((item) => item.id),
      ["sub-2", "sub-1", "sub-3"]
    );
    assert.strictEqual(byId.get("sub-1")?.parentId, "sub-2");
  });

  it("adds collapsed ids only once", () => {
    assert.deepStrictEqual(addCollapsedId(["a"], "a"), ["a"]);
    assert.deepStrictEqual(addCollapsedId(["a"], "b"), ["a", "b"]);
    assert.deepStrictEqual(addCollapsedId([], ""), []);
  });

  it("handles non-array inputs when adding collapsed ids", () => {
    assert.deepStrictEqual(addCollapsedId(null, "a"), ["a"]);
    assert.deepStrictEqual(addCollapsedId(undefined, ""), []);
  });
});
