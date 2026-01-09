function resolveViewportSize() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0
  };
}

function computeModalLeft(anchorRect, panelWidth, viewportWidth, margin) {
  let left = anchorRect.right + margin;
  if (left + panelWidth > viewportWidth - margin) {
    left = anchorRect.left - panelWidth - margin;
  }
  if (left < margin) {
    left = Math.min(Math.max(margin, left), viewportWidth - panelWidth - margin);
  }
  return left;
}

function computeModalTop(anchorRect, panelHeight, viewportHeight, margin) {
  let top = anchorRect.top;
  if (top + panelHeight > viewportHeight - margin) {
    top = viewportHeight - panelHeight - margin;
  }
  if (top < margin) {
    top = margin;
  }
  return top;
}

export function getCalendarEventModalPanel(calendarEventModal) {
  if (!calendarEventModal || typeof calendarEventModal.querySelector !== "function") {return null;}
  return calendarEventModal.querySelector(".calendar-event-modal__panel");
}

export function resetCalendarModalPosition(calendarEventModal) {
  const panel = getCalendarEventModalPanel(calendarEventModal);
  if (!panel) {return;}
  panel.style.position = "";
  panel.style.top = "";
  panel.style.left = "";
}

export function positionCalendarEventModal(calendarEventModal, anchorRect) {
  if (!calendarEventModal || !anchorRect) {return;}
  const panel = getCalendarEventModalPanel(calendarEventModal);
  if (!panel) {return;}
  const margin = 12;
  const viewport = resolveViewportSize();
  const panelRect = panel.getBoundingClientRect();
  const left = computeModalLeft(anchorRect, panelRect.width, viewport.width, margin);
  const top = computeModalTop(anchorRect, panelRect.height, viewport.height, margin);
  panel.style.position = "fixed";
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

export function scheduleCalendarEventModalPosition(calendarEventModal, anchorEl) {
  if (!anchorEl?.getBoundingClientRect) {
    resetCalendarModalPosition(calendarEventModal);
    return;
  }
  const rect = anchorEl.getBoundingClientRect();
  const schedule = globalThis.requestAnimationFrame || ((cb) => cb());
  schedule(() => positionCalendarEventModal(calendarEventModal, rect));
}
