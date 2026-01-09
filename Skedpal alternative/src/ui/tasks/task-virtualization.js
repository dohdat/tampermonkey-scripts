import { renderTaskCard } from "./task-card.js";
import { sortTasksByOrder } from "../utils.js";
import { state } from "../state/page-state.js";

export const TASK_VIRTUALIZATION_THRESHOLD = 200;
export const TASK_VIRTUALIZATION_BUFFER_MULTIPLIER = 2;

const taskHeightCache = new Map();
const pendingVirtualizers = [];
const activeVirtualizers = new Set();
const raf =
  typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => setTimeout(callback, 0);
const cancelRaf =
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id) => clearTimeout(id);
let scheduledUpdateId = null;
let hasGlobalListeners = false;

export function buildCumulativeOffsets(heights, gap = 0) {
  const offsets = [0];
  for (let i = 0; i < heights.length; i += 1) {
    const height = heights[i];
    if (!Number.isFinite(height) || height <= 0) {
      return null;
    }
    const stride = height + (i < heights.length - 1 ? gap : 0);
    offsets.push(offsets[i] + stride);
  }
  return offsets;
}

export function findStartIndex(offsets, target) {
  if (!Array.isArray(offsets) || offsets.length === 0) {return 0;}
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return Math.max(0, low - 1);
}

export function findEndIndex(offsets, target) {
  if (!Array.isArray(offsets) || offsets.length === 0) {return 0;}
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return Math.min(offsets.length - 1, low);
}

export function adjustRangeForPinned({ startIndex, endIndex, pinnedIndices, itemCount }) {
  if (!Array.isArray(pinnedIndices) || pinnedIndices.length === 0) {
    return { startIndex, endIndex };
  }
  const minPinned = Math.min(...pinnedIndices);
  const maxPinned = Math.max(...pinnedIndices);
  const safeStart = Math.max(0, Math.min(startIndex, minPinned));
  const safeEnd = Math.min(itemCount, Math.max(endIndex, maxPinned + 1));
  return { startIndex: safeStart, endIndex: safeEnd };
}

function buildMeasureContainer(listWidth, rowGap) {
  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.visibility = "hidden";
  wrap.style.pointerEvents = "none";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = `${listWidth}px`;
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.rowGap = `${rowGap}px`;
  wrap.setAttribute("data-test-skedpal", "task-virtualization-measure");
  document.body.appendChild(wrap);
  return wrap;
}

function measureTaskHeights(tasks, context, listWidth, rowGap) {
  if (!tasks.length) {return;}
  const wrap = buildMeasureContainer(listWidth, rowGap);
  const nodes = tasks.map((task) => {
    const node = renderTaskCard(task, context);
    wrap.appendChild(node);
    return node;
  });
  nodes.forEach((node, index) => {
    const height = node.getBoundingClientRect().height;
    taskHeightCache.set(tasks[index].id, height);
  });
  wrap.remove();
}

function getRowGapPx(listEl) {
  if (!listEl) {return 0;}
  const styles = window.getComputedStyle(listEl);
  const gapValue = styles.rowGap || styles.gap || "0";
  const gap = parseFloat(gapValue);
  return Number.isNaN(gap) ? 0 : gap;
}

function getListWidth(listEl) {
  return listEl?.getBoundingClientRect?.().width || 0;
}

function scheduleGlobalUpdate() {
  if (scheduledUpdateId !== null) {return;}
  scheduledUpdateId = raf(() => {
    scheduledUpdateId = null;
    activeVirtualizers.forEach((virtualizer) => virtualizer.update());
  });
}

function handleGlobalScroll() {
  scheduleGlobalUpdate();
}

function handleGlobalResize() {
  scheduleGlobalUpdate();
}

function ensureGlobalListeners() {
  if (hasGlobalListeners) {return;}
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  window.addEventListener("resize", handleGlobalResize);
  hasGlobalListeners = true;
}

function removeGlobalListeners() {
  if (!hasGlobalListeners) {return;}
  window.removeEventListener("scroll", handleGlobalScroll);
  window.removeEventListener("resize", handleGlobalResize);
  hasGlobalListeners = false;
}

function getViewportRange(listEl) {
  const viewportTop = window.scrollY || 0;
  const viewportBottom = viewportTop + (window.innerHeight || 0);
  const rect = listEl.getBoundingClientRect();
  const listTop = rect.top + viewportTop;
  const visibleTop = Math.max(0, viewportTop - listTop);
  const visibleBottom = Math.max(0, viewportBottom - listTop);
  return { visibleTop, visibleBottom };
}

class TaskVirtualizer {
  constructor({ listEl, tasks, context }) {
    this.listEl = listEl;
    this.tasks = Array.isArray(tasks) ? tasks : [];
    this.context = context;
    this.sortedTasks = sortTasksByOrder(this.tasks);
    this.indexById = new Map(this.sortedTasks.map((task, index) => [task.id, index]));
    this.rowGap = 0;
    this.offsets = null;
    this.currentRange = null;
    this.activeNodes = new Map();
    this.needsLayout = true;
    this.resizeObserver = new ResizeObserver(this.handleResizeEntries.bind(this));
    this.isDestroyed = false;
    this.isFallback = false;
  }

  handleResizeEntries(entries) {
    let changed = false;
    entries.forEach((entry) => {
      const taskId = entry.target?.dataset?.taskId;
      if (!taskId) {return;}
      const nextHeight = entry.contentRect?.height || entry.target.getBoundingClientRect().height;
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) {return;}
      if (taskHeightCache.get(taskId) === nextHeight) {return;}
      taskHeightCache.set(taskId, nextHeight);
      changed = true;
    });
    if (changed) {
      this.needsLayout = true;
      scheduleGlobalUpdate();
    }
  }

  init() {
    if (this.isDestroyed || !this.listEl || !this.listEl.isConnected) {return;}
    if (!this.sortedTasks.length) {return;}
    this.rowGap = getRowGapPx(this.listEl);
    const listWidth = getListWidth(this.listEl);
    if (listWidth <= 0) {return;}
    const missing = this.sortedTasks.filter((task) => !taskHeightCache.has(task.id));
    if (missing.length) {
      measureTaskHeights(missing, this.context, listWidth, this.rowGap);
    }
    this.rebuildOffsets();
    if (this.isFallback) {
      this.renderAll();
      return;
    }
    this.update(true);
  }

  rebuildOffsets() {
    const heights = this.sortedTasks.map((task) => taskHeightCache.get(task.id));
    this.offsets = buildCumulativeOffsets(heights, this.rowGap);
    this.isFallback = !this.offsets;
    this.needsLayout = false;
  }

  shouldSuspendUpdates() {
    const draggingId = state.draggingTaskId;
    return Boolean(draggingId && this.indexById.has(draggingId));
  }

  getPinnedIndices() {
    const pinned = [];
    state.expandedTaskDetails?.forEach((id) => {
      const index = this.indexById.get(id);
      if (Number.isFinite(index)) {
        pinned.push(index);
      }
    });
    const draggingId = state.draggingTaskId;
    const draggingIndex = draggingId ? this.indexById.get(draggingId) : null;
    if (Number.isFinite(draggingIndex)) {
      pinned.push(draggingIndex);
    }
    return pinned;
  }

  update(force = false) {
    if (this.isDestroyed || this.isFallback || !this.offsets || !this.offsets.length) {return;}
    if (this.shouldSuspendUpdates()) {return;}
    if (this.needsLayout) {
      this.rebuildOffsets();
    }
    const { bufferedTop, bufferedBottom, totalHeight } = this.getBufferedViewportRange();
    const nextRange = this.computeRange(bufferedTop, bufferedBottom);
    if (!force && this.isSameRange(nextRange)) {return;}
    this.applyRange(nextRange, totalHeight);
  }

  getBufferedViewportRange() {
    const { visibleTop, visibleBottom } = getViewportRange(this.listEl);
    const bufferPx = (window.innerHeight || 0) * TASK_VIRTUALIZATION_BUFFER_MULTIPLIER;
    const totalHeight = this.offsets[this.offsets.length - 1] || 0;
    return {
      totalHeight,
      bufferedTop: Math.max(0, visibleTop - bufferPx),
      bufferedBottom: Math.min(totalHeight, visibleBottom + bufferPx)
    };
  }

  computeRange(bufferedTop, bufferedBottom) {
    let startIndex = findStartIndex(this.offsets, bufferedTop);
    let endIndex = findEndIndex(this.offsets, bufferedBottom);
    const pinned = this.getPinnedIndices();
    if (pinned.length) {
      const adjusted = adjustRangeForPinned({
        startIndex,
        endIndex,
        pinnedIndices: pinned,
        itemCount: this.sortedTasks.length
      });
      startIndex = adjusted.startIndex;
      endIndex = adjusted.endIndex;
    }
    return { startIndex, endIndex };
  }

  isSameRange(range) {
    if (!this.currentRange) {return false;}
    return (
      this.currentRange.startIndex === range.startIndex &&
      this.currentRange.endIndex === range.endIndex
    );
  }

  applyRange(range, totalHeight) {
    this.currentRange = range;
    const paddingTop = this.offsets[range.startIndex] || 0;
    const paddingBottom = Math.max(0, totalHeight - (this.offsets[range.endIndex] || 0));
    this.listEl.style.paddingTop = `${paddingTop}px`;
    this.listEl.style.paddingBottom = `${paddingBottom}px`;
    this.renderRange(range.startIndex, range.endIndex);
  }

  renderAll() {
    const fragment = document.createDocumentFragment();
    this.sortedTasks.forEach((task) => {
      const node = renderTaskCard(task, this.context);
      fragment.appendChild(node);
    });
    this.listEl.style.paddingTop = "0px";
    this.listEl.style.paddingBottom = "0px";
    this.listEl.replaceChildren(fragment);
  }

  renderRange(startIndex, endIndex) {
    const visibleTasks = this.sortedTasks.slice(startIndex, endIndex);
    const nextIds = new Set(visibleTasks.map((task) => task.id));
    this.activeNodes.forEach((node, id) => {
      if (!nextIds.has(id)) {
        this.resizeObserver.unobserve(node);
        this.activeNodes.delete(id);
      }
    });
    const fragment = document.createDocumentFragment();
    visibleTasks.forEach((task) => {
      let node = this.activeNodes.get(task.id);
      if (!node) {
        node = renderTaskCard(task, this.context);
        this.activeNodes.set(task.id, node);
        this.resizeObserver.observe(node);
      }
      fragment.appendChild(node);
    });
    this.listEl.replaceChildren(fragment);
  }

  destroy() {
    this.isDestroyed = true;
    this.resizeObserver.disconnect();
    this.activeNodes.clear();
    this.listEl = null;
  }
}

export function registerTaskVirtualizer(config) {
  if (!config?.listEl || !Array.isArray(config.tasks)) {return;}
  pendingVirtualizers.push(config);
}

export function initializeTaskVirtualizers() {
  if (!pendingVirtualizers.length) {return;}
  const toInit = pendingVirtualizers.splice(0, pendingVirtualizers.length);
  toInit.forEach((config) => {
    const virtualizer = new TaskVirtualizer(config);
    virtualizer.init();
    activeVirtualizers.add(virtualizer);
  });
  ensureGlobalListeners();
  scheduleGlobalUpdate();
}

export function destroyTaskVirtualizers() {
  pendingVirtualizers.splice(0, pendingVirtualizers.length);
  activeVirtualizers.forEach((virtualizer) => virtualizer.destroy());
  activeVirtualizers.clear();
  removeGlobalListeners();
  if (scheduledUpdateId !== null) {
    cancelRaf(scheduledUpdateId);
    scheduledUpdateId = null;
  }
}

export function shouldVirtualizeTaskList(taskCount) {
  return taskCount > TASK_VIRTUALIZATION_THRESHOLD;
}

export function scheduleTaskVirtualizationUpdate() {
  scheduleGlobalUpdate();
}
