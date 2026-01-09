import assert from "assert";
import { afterEach, describe, it } from "mocha";

describe("constants dom refs", () => {
  const previousDocument = global.document;

  afterEach(() => {
    global.document = previousDocument;
  });

  it("populates querySelector-based refs when available", async () => {
    global.document = {
      querySelector: (_selector) => ({ id: "stub-node" }),
      querySelectorAll: (_selector) => [{ id: "stub-node" }],
      getElementById: (id) => ({ id })
    };

    const { domRefs } = await import("../src/ui/constants.js?qs=1");
    assert.ok(Array.isArray(domRefs.views));
    assert.ok(domRefs.taskLinkClearBtn);
    assert.ok(domRefs.calendarSplitToggleSlot);
  });
});
