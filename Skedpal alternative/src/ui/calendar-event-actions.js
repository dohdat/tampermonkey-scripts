import { INDEX_NOT_FOUND } from "./constants.js";

export function setActionButtonVisibility(buttons = [], visibility = {}) {
  if (!buttons.length) {return;}
  buttons.forEach((button) => {
    const action = button?.dataset?.calendarEventAction;
    if (!action) {return;}
    const shouldShow = visibility[action] !== false;
    button.classList.toggle("hidden", !shouldShow);
    button.hidden = !shouldShow;
    if (button.style) {
      button.style.display = shouldShow ? "" : "none";
    }
    button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    button.tabIndex = shouldShow ? 0 : INDEX_NOT_FOUND;
    if (shouldShow) {
      button.removeAttribute("disabled");
    } else {
      button.setAttribute("disabled", "true");
    }
  });
}

export function resolveCalendarEventAction(action, options = {}) {
  const {
    activeTask,
    activeExternalEvent,
    onComplete,
    onZoom,
    onDefer,
    onEdit,
    onDelete,
    onExternalEdit,
    onExternalDelete
  } = options;
  if (!action) {return null;}
  if (!activeTask && activeExternalEvent) {
    if (action === "edit") {return onExternalEdit;}
    if (action === "delete") {return onExternalDelete;}
    return null;
  }
  const taskActions = {
    complete: onComplete,
    zoom: onZoom,
    defer: onDefer,
    edit: onEdit,
    delete: onDelete
  };
  return taskActions[action] || null;
}
