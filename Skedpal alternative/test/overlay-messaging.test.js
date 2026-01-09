import assert from "assert";
import { afterEach, beforeEach, describe, it } from "mocha";
import { requestCreateTaskOverlayClose } from "../src/ui/overlay-messaging.js";

describe("overlay messaging", () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = global.window;
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("returns false when window is undefined", () => {
    global.window = undefined;
    assert.strictEqual(requestCreateTaskOverlayClose(), false);
  });

  it("returns false when not inside an iframe", () => {
    const windowStub = {};
    windowStub.parent = windowStub;
    windowStub.postMessage = () => {
      throw new Error("should not be called");
    };
    global.window = windowStub;

    assert.strictEqual(requestCreateTaskOverlayClose(), false);
  });

  it("posts a close message to the parent window", () => {
    let message;
    let target;
    const parentStub = {
      postMessage: (payload, origin) => {
        message = payload;
        target = origin;
      }
    };
    global.window = {
      parent: parentStub
    };

    assert.strictEqual(requestCreateTaskOverlayClose(), true);
    assert.deepStrictEqual(message, { type: "skedpal:create-task-close" });
    assert.strictEqual(target, "*");
  });

  it("returns false when postMessage throws", () => {
    const parentStub = {
      postMessage: () => {
        throw new Error("blocked");
      }
    };
    global.window = {
      parent: parentStub
    };

    assert.strictEqual(requestCreateTaskOverlayClose(), false);
  });
});
