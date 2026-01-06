import assert from "assert";
import { describe, it } from "mocha";
const { DEFAULT_SETTINGS } = await import("../src/data/db.js");
const { applyFavoriteOrder } = await import("../src/ui/favorites.js");

describe("favorite ordering", () => {
  it("updates favorite order based on drag list", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      sections: [
        { id: "s1", name: "Work", favorite: true, favoriteOrder: 1 },
        { id: "s2", name: "Personal", favorite: true, favoriteOrder: 2 }
      ],
      subsections: {
        s1: [{ id: "sub1", name: "Deep", favorite: true, favoriteOrder: 3 }],
        s2: []
      }
    };

    const updated = applyFavoriteOrder(settings, [
      "subsection:s1:sub1",
      "section:s2",
      "section:s1"
    ]);

    const s1 = updated.sections.find((s) => s.id === "s1");
    const s2 = updated.sections.find((s) => s.id === "s2");
    const sub1 = updated.subsections.s1.find((s) => s.id === "sub1");
    assert.strictEqual(sub1.favoriteOrder, 1);
    assert.strictEqual(s2.favoriteOrder, 2);
    assert.strictEqual(s1.favoriteOrder, 3);
  });
});
