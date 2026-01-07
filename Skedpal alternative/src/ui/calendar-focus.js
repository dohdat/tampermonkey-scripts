import { themeColors } from "./theme.js";

function toRgba(color, alpha) {
  if (!color) {return "";}
  const trimmed = color.trim();
  if (trimmed.startsWith("rgba(")) {return trimmed;}
  if (trimmed.startsWith("rgb(")) {
    return trimmed.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  if (!trimmed.startsWith("#")) {return trimmed;}
  let hex = trimmed.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (hex.length !== 6) {return trimmed;}
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) {return trimmed;}
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function clearCalendarEventFocus(calendarGrid) {
  if (!calendarGrid) {return;}
  const focusedBlocks = calendarGrid.querySelectorAll("[data-calendar-focus]");
  focusedBlocks.forEach((block) => {
    if (block.dataset.calendarFocusTimeout) {
      window.clearTimeout(Number(block.dataset.calendarFocusTimeout));
      delete block.dataset.calendarFocusTimeout;
    }
    if (block.dataset.calendarFocusPulseTimeout) {
      window.clearTimeout(Number(block.dataset.calendarFocusPulseTimeout));
      delete block.dataset.calendarFocusPulseTimeout;
    }
    block.style.boxShadow = block.dataset.calendarFocusBoxShadow || "";
    block.style.outline = block.dataset.calendarFocusOutline || "";
    block.style.zIndex = block.dataset.calendarFocusZIndex || "";
    block.style.filter = block.dataset.calendarFocusFilter || "";
    block.style.transition = block.dataset.calendarFocusTransition || "";
    delete block.dataset.calendarFocusBoxShadow;
    delete block.dataset.calendarFocusOutline;
    delete block.dataset.calendarFocusZIndex;
    delete block.dataset.calendarFocusFilter;
    delete block.dataset.calendarFocusTransition;
    block.removeAttribute("data-calendar-focus");
  });
}

export function focusCalendarEventBlock(eventBlock, options = {}) {
  if (!eventBlock) {return false;}
  const { autoClearMs = 2500, pulse = true } = options;
  const focusOutlineColor = themeColors.slate100 || themeColors.white;
  const focusGlowColor = themeColors.black;
  eventBlock.dataset.calendarFocusBoxShadow = eventBlock.style.boxShadow || "";
  eventBlock.dataset.calendarFocusOutline = eventBlock.style.outline || "";
  eventBlock.dataset.calendarFocusZIndex = eventBlock.style.zIndex || "";
  eventBlock.dataset.calendarFocusFilter = eventBlock.style.filter || "";
  eventBlock.dataset.calendarFocusTransition = eventBlock.style.transition || "";
  eventBlock.setAttribute("data-calendar-focus", "true");
  eventBlock.style.outline = `2px solid ${focusOutlineColor}`;
  const baseShadow = [
    `0 0 0 3px ${toRgba(focusOutlineColor, 0.6)}`,
    `0 0 0 6px ${toRgba(focusGlowColor, 0.35)}`
  ].join(", ");
  eventBlock.style.boxShadow = baseShadow;
  eventBlock.style.zIndex = "6";
  eventBlock.style.filter = "brightness(1.05)";
  eventBlock.style.transition = "box-shadow 240ms ease, outline-color 240ms ease, filter 240ms ease";
  if (pulse) {
    const pulseShadow = [
      `0 0 0 4px ${toRgba(focusOutlineColor, 0.8)}`,
      `0 0 0 8px ${toRgba(focusGlowColor, 0.45)}`
    ].join(", ");
    const pulseTimeout = window.setTimeout(() => {
      eventBlock.style.boxShadow = pulseShadow;
      eventBlock.dataset.calendarFocusPulseTimeout = String(
        window.setTimeout(() => {
          eventBlock.style.boxShadow = baseShadow;
        }, 260)
      );
    }, 120);
    eventBlock.dataset.calendarFocusPulseTimeout = String(pulseTimeout);
  }
  if (autoClearMs > 0) {
    eventBlock.dataset.calendarFocusTimeout = String(
      window.setTimeout(() => {
        const grid = eventBlock.closest?.('[data-test-skedpal="calendar-grid"]');
        clearCalendarEventFocus(grid || eventBlock.parentElement);
      }, autoClearMs)
    );
  }
  return true;
}
