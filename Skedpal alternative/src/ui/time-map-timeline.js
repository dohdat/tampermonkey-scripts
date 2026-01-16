import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  ONE_HUNDRED,
  TWO,
  ZERO,
  TIME_MAP_DEFAULT_END,
  TIME_MAP_DEFAULT_START,
  TIME_MAP_LABEL_HOURS,
  TIME_MAP_MINUTES_IN_DAY,
  TIME_MAP_MINUTE_STEP
} from "./constants.js";

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
const snapMinutes = (value) => Math.round(value / TIME_MAP_MINUTE_STEP) * TIME_MAP_MINUTE_STEP;

export function timeStringToMinutes(value, fallback) {
  if (!value) {return fallback;}
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {return fallback;}
  const total = hours * MINUTES_PER_HOUR + minutes;
  if (!Number.isFinite(total)) {return fallback;}
  return clampNumber(total, ZERO, TIME_MAP_MINUTES_IN_DAY);
}

export function minutesToTimeString(value) {
  const clamped = clampNumber(Math.round(value), ZERO, TIME_MAP_MINUTES_IN_DAY);
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const minutes = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(TWO, "0")}:${String(minutes).padStart(TWO, "0")}`;
}

export function normalizeTimeRange(startMinutes, endMinutes) {
  const minDuration = TIME_MAP_MINUTE_STEP;
  let start = snapMinutes(clampNumber(startMinutes, ZERO, TIME_MAP_MINUTES_IN_DAY - minDuration));
  let end = snapMinutes(clampNumber(endMinutes, start + minDuration, TIME_MAP_MINUTES_IN_DAY));
  if (end - start < minDuration) {
    end = clampNumber(start + minDuration, minDuration, TIME_MAP_MINUTES_IN_DAY);
  }
  return { start, end };
}

function buildTimeRangeLabel(startMinutes, endMinutes) {
  return `${minutesToTimeString(startMinutes)} - ${minutesToTimeString(endMinutes)}`;
}

export function syncTimeMapTimelineHeader() {
  const header = document.getElementById("timemap-timeline-header");
  if (!header) {return;}
  header.innerHTML = "";
  TIME_MAP_LABEL_HOURS.forEach((hour) => {
    const tick = document.createElement("span");
    tick.className = "timemap-timeline-tick";
    tick.style.left = `${(hour / HOURS_PER_DAY) * ONE_HUNDRED}%`;
    tick.textContent = String(hour).padStart(TWO, "0");
    tick.setAttribute("data-test-skedpal", "timemap-timeline-tick");
    header.appendChild(tick);
  });
}

function syncTimeBlockPosition(block) {
  const startMinutes = Number(block.dataset.startMinute);
  const endMinutes = Number(block.dataset.endMinute);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {return;}
  const duration = Math.max(endMinutes - startMinutes, TIME_MAP_MINUTE_STEP);
  const left = (startMinutes / TIME_MAP_MINUTES_IN_DAY) * ONE_HUNDRED;
  const width = (duration / TIME_MAP_MINUTES_IN_DAY) * ONE_HUNDRED;
  block.style.left = `${left}%`;
  block.style.width = `${width}%`;
  const label = block.querySelector("[data-block-label]");
  if (label) {
    label.textContent = buildTimeRangeLabel(startMinutes, endMinutes);
  }
  block.title = buildTimeRangeLabel(startMinutes, endMinutes);
}

export function setTimeBlockMinutes(block, startMinutes, endMinutes) {
  const normalized = normalizeTimeRange(startMinutes, endMinutes);
  block.dataset.startMinute = String(normalized.start);
  block.dataset.endMinute = String(normalized.end);
  syncTimeBlockPosition(block);
}

export function createTimeBlock(day, block = { startTime: TIME_MAP_DEFAULT_START, endTime: TIME_MAP_DEFAULT_END }) {
  const startMinutes = timeStringToMinutes(
    block.startTime,
    timeStringToMinutes(TIME_MAP_DEFAULT_START, ZERO)
  );
  const endMinutes = timeStringToMinutes(
    block.endTime,
    timeStringToMinutes(TIME_MAP_DEFAULT_END, TIME_MAP_MINUTE_STEP)
  );
  const wrapper = document.createElement("div");
  wrapper.className = "timemap-block-range";
  wrapper.dataset.block = day;
  wrapper.setAttribute("data-test-skedpal", "timemap-block");

  const startHandle = document.createElement("span");
  startHandle.className = "timemap-block-handle timemap-block-handle--start";
  startHandle.setAttribute("data-timeline-handle", "start");
  startHandle.setAttribute("data-test-skedpal", "timemap-block-handle-start");

  const endHandle = document.createElement("span");
  endHandle.className = "timemap-block-handle timemap-block-handle--end";
  endHandle.setAttribute("data-timeline-handle", "end");
  endHandle.setAttribute("data-test-skedpal", "timemap-block-handle-end");

  const label = document.createElement("span");
  label.className = "timemap-block-label";
  label.setAttribute("data-block-label", "true");
  label.setAttribute("data-test-skedpal", "timemap-block-label");

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.title = "Remove time range";
  removeBtn.className = "timemap-block-remove";
  removeBtn.textContent = "x";
  removeBtn.setAttribute("data-block-remove", "true");
  removeBtn.setAttribute("data-test-skedpal", "timemap-block-remove");
  removeBtn.setAttribute("aria-label", "Remove time range");

  wrapper.appendChild(startHandle);
  wrapper.appendChild(label);
  wrapper.appendChild(removeBtn);
  wrapper.appendChild(endHandle);
  setTimeBlockMinutes(wrapper, startMinutes, endMinutes);
  return wrapper;
}

export function createTimeline(day, blocks) {
  const timelineRow = document.createElement("div");
  timelineRow.className = "timemap-timeline-row";
  timelineRow.setAttribute("data-test-skedpal", "timemap-timeline-row");
  const timeline = document.createElement("div");
  timeline.className = "timemap-timeline";
  timeline.dataset.timeline = day;
  timeline.setAttribute("data-test-skedpal", "timemap-timeline");
  if (blocks.length > 0) {
    blocks.forEach((block) => timeline.appendChild(createTimeBlock(day, block)));
  } else {
    timeline.appendChild(createTimeBlock(day));
  }
  timelineRow.appendChild(timeline);
  return timelineRow;
}

function getEventTargetElement(event) {
  if (!event?.target) {return null;}
  if (typeof Element === "undefined") {return null;}
  return event.target instanceof Element ? event.target : null;
}

function resolveDragTarget(event) {
  if (event.pointerType === "mouse" && event.button !== ZERO) {return null;}
  const target = getEventTargetElement(event);
  if (!target || target.closest?.("[data-block-remove]")) {return null;}
  const block = target.closest?.("[data-block]");
  const timeline = target.closest?.("[data-timeline]");
  if (!block || !timeline) {return null;}
  return { target, block, timeline };
}

function buildDragState(target, block, timeline, event) {
  const startMinutes = Number(block.dataset.startMinute);
  const endMinutes = Number(block.dataset.endMinute);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {return null;}
  const handle = target.closest?.("[data-timeline-handle]");
  return {
    block,
    timeline,
    mode: handle?.dataset?.timelineHandle || "move",
    startX: event.clientX,
    startMinutes,
    endMinutes,
    pointerId: event.pointerId
  };
}

function applyDragUpdate(active, deltaX) {
  const rect = active.timeline.getBoundingClientRect();
  if (!rect.width) {return;}
  const deltaMinutes = (deltaX / rect.width) * TIME_MAP_MINUTES_IN_DAY;
  const snappedDelta = snapMinutes(deltaMinutes);
  if (active.mode === "move") {
    const duration = active.endMinutes - active.startMinutes;
    const nextStart = clampNumber(
      active.startMinutes + snappedDelta,
      ZERO,
      TIME_MAP_MINUTES_IN_DAY - duration
    );
    setTimeBlockMinutes(active.block, nextStart, nextStart + duration);
    return;
  }
  if (active.mode === "start") {
    const nextStart = clampNumber(
      active.startMinutes + snappedDelta,
      ZERO,
      active.endMinutes - TIME_MAP_MINUTE_STEP
    );
    setTimeBlockMinutes(active.block, nextStart, active.endMinutes);
    return;
  }
  const nextEnd = clampNumber(
    active.endMinutes + snappedDelta,
    active.startMinutes + TIME_MAP_MINUTE_STEP,
    TIME_MAP_MINUTES_IN_DAY
  );
  setTimeBlockMinutes(active.block, active.startMinutes, nextEnd);
}

export function setupTimeMapTimelineInteractions(container) {
  let active = null;

  function clearActiveDrag() {
    if (active?.block) {
      active.block.classList.remove("timemap-block--dragging");
    }
    active = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
  }

  function handlePointerMove(event) {
    if (!active || event.pointerId !== active.pointerId) {return;}
    applyDragUpdate(active, event.clientX - active.startX);
  }

  function handlePointerUp(event) {
    if (!active || event.pointerId !== active.pointerId) {return;}
    clearActiveDrag();
  }

  function handlePointerDown(event) {
    const resolved = resolveDragTarget(event);
    if (!resolved) {return;}
    const nextState = buildDragState(resolved.target, resolved.block, resolved.timeline, event);
    if (!nextState) {return;}
    resolved.block.classList.add("timemap-block--dragging");
    active = nextState;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  container.addEventListener("pointerdown", handlePointerDown);
  return () => {
    container.removeEventListener("pointerdown", handlePointerDown);
    clearActiveDrag();
  };
}
