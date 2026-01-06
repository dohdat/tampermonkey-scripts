import assert from "assert";
import { describe, it } from "mocha";

import { toggleFavoriteById } from "../src/ui/favorites.js";

describe("favorites", () => {
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
});
