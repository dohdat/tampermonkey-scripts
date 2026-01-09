import assert from "assert";
import { describe, it, before, after } from "mocha";
import {
  buildCumulativeOffsets,
  findStartIndex,
  findEndIndex,
  adjustRangeForPinned,
  destroyTaskVirtualizers,
  initializeTaskVirtualizers,
  registerTaskVirtualizer,
  scheduleTaskVirtualizationUpdate,
  shouldVirtualizeTaskList
} from "../src/ui/tasks/task-virtualization.js";

describe("task virtualization helpers", () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalResizeObserver = global.ResizeObserver;

  const stubWindow = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    getComputedStyle: () => ({ rowGap: "8px", gap: "8px" })
  };

  before(() => {
    global.window = stubWindow;
    global.document = originalDocument || { createElement: () => ({ style: {} }) };
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  after(() => {
    destroyTaskVirtualizers();
    global.window = originalWindow;
    global.document = originalDocument;
    global.ResizeObserver = originalResizeObserver;
  });

  it("builds cumulative offsets with gaps", () => {
    const offsets = buildCumulativeOffsets([10, 20, 30], 5);
    assert.deepStrictEqual(offsets, [0, 15, 40, 70]);
  });

  it("returns null when heights are invalid", () => {
    assert.strictEqual(buildCumulativeOffsets([10, 0, 20], 4), null);
    assert.strictEqual(buildCumulativeOffsets([10, -5, 20], 4), null);
  });

  it("finds start and end indexes from offsets", () => {
    const offsets = buildCumulativeOffsets([10, 20, 30], 5);
    assert.strictEqual(findStartIndex(offsets, 0), 0);
    assert.strictEqual(findStartIndex(offsets, 14), 0);
    assert.strictEqual(findStartIndex(offsets, 15), 1);
    assert.strictEqual(findEndIndex(offsets, 15), 1);
    assert.strictEqual(findEndIndex(offsets, 39), 2);
    assert.strictEqual(findEndIndex(offsets, 70), 3);
  });

  it("expands range to include pinned rows", () => {
    const adjusted = adjustRangeForPinned({
      startIndex: 5,
      endIndex: 10,
      pinnedIndices: [2, 12],
      itemCount: 20
    });
    assert.deepStrictEqual(adjusted, { startIndex: 2, endIndex: 13 });
  });

  it("matches the virtualization threshold", () => {
    assert.strictEqual(shouldVirtualizeTaskList(20), false);
    assert.strictEqual(shouldVirtualizeTaskList(21), true);
  });

  it("registers and clears virtualizers safely", () => {
    registerTaskVirtualizer({
      listEl: { isConnected: true },
      tasks: []
    });
    initializeTaskVirtualizers();
    destroyTaskVirtualizers();
  });

  it("schedules virtualization updates without crashing", () => {
    scheduleTaskVirtualizationUpdate();
    destroyTaskVirtualizers();
  });
});
