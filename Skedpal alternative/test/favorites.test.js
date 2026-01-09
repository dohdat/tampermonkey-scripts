import assert from "assert";
import { describe, it } from "mocha";

import {
  applyFavoriteOrder,
  buildFavoriteKey,
  getNextFavoriteOrder,
  toggleFavoriteById
} from "../src/ui/favorites.js";

describe("favorites", () => {
  it("builds favorite keys for sections and subsections", () => {
    assert.strictEqual(
      buildFavoriteKey({ type: "section", sectionId: "work" }),
      "section:work"
    );
    assert.strictEqual(
      buildFavoriteKey({ type: "subsection", sectionId: "work", subsectionId: "ops" }),
      "subsection:work:ops"
    );
    assert.strictEqual(buildFavoriteKey({ type: "section" }), "section:");
    assert.strictEqual(buildFavoriteKey({ type: "subsection" }), "subsection::");
  });

  it("calculates next favorite order across sections and subsections", () => {
    const settings = {
      sections: [
        { id: "s1", favorite: true, favoriteOrder: 2 },
        { id: "s2", favorite: false, favoriteOrder: null }
      ],
      subsections: {
        s1: [
          { id: "sub-1", favorite: true, favoriteOrder: 5 },
          { id: "sub-2", favorite: false, favoriteOrder: null }
        ],
        s2: null
      }
    };

    assert.strictEqual(getNextFavoriteOrder(settings), 6);
    assert.strictEqual(getNextFavoriteOrder(null), 1);
  });

  it("toggles favorite without clearing other favorites", () => {
    const list = [
      { id: "sub-1", favorite: false, favoriteOrder: null },
      { id: "sub-2", favorite: true, favoriteOrder: 2 }
    ];

    const updated = toggleFavoriteById(list, "sub-1", 3);

    assert.strictEqual(updated[0].favorite, true);
    assert.strictEqual(updated[0].favoriteOrder, 3);
    assert.strictEqual(updated[1].favorite, true);
    assert.strictEqual(updated[1].favoriteOrder, 2);
  });

  it("clears favorite order when unfavoriting", () => {
    const list = [
      { id: "sub-1", favorite: true, favoriteOrder: 1 },
      { id: "sub-2", favorite: false, favoriteOrder: null }
    ];

    const updated = toggleFavoriteById(list, "sub-1", 4);

    assert.strictEqual(updated[0].favorite, false);
    assert.strictEqual(updated[0].favoriteOrder, null);
    assert.strictEqual(updated[1].favorite, false);
    assert.strictEqual(updated[1].favoriteOrder, null);
  });

  it("applies favorite order with existing keys and leaves non-favorites alone", () => {
    const settings = {
      sections: [
        { id: "s1", favorite: true, favoriteOrder: null },
        { id: "s2", favorite: false, favoriteOrder: 9 }
      ],
      subsections: {
        s1: [{ id: "sub-1", favorite: true, favoriteOrder: null }],
        s2: [{ id: "sub-2", favorite: false, favoriteOrder: 4 }]
      }
    };

    const orderedKeys = ["section:s1", "subsection:s1:sub-1"];
    const updated = applyFavoriteOrder(settings, orderedKeys);

    assert.strictEqual(updated.sections[0].favoriteOrder, 1);
    assert.strictEqual(updated.sections[1].favoriteOrder, 9);
    assert.strictEqual(updated.subsections.s1[0].favoriteOrder, 2);
    assert.strictEqual(updated.subsections.s2[0].favoriteOrder, 4);
  });
});
