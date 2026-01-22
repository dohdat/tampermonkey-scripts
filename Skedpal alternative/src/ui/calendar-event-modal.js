import {
  TASK_REPEAT_NONE,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_UNSCHEDULED,
  CALENDAR_EVENT_MODAL_EXTERNAL_EYEBROW,
  END_OF_DAY_HOUR,
  END_OF_DAY_MINUTE,
  END_OF_DAY_MS,
  END_OF_DAY_SECOND,
  TEN,
  domRefs,
  editIconSvg,
  removeIconSvg,
  zoomInIconSvg,
  deferIconSvg,
  checkboxIconSvg
} from "./constants.js";
import { state } from "./state/page-state.js";
import { saveTask } from "../data/db.js";
import { parseLocalDateInput } from "./utils.js";
import {
  resolveCalendarEventAction,
  setActionButtonVisibility
} from "./calendar-event-actions.js";
import {
  getCalendarEventModalPanel,
  resetCalendarModalPosition,
  scheduleCalendarEventModalPosition
} from "./calendar-event-modal-layout.js";
import {
  cleanupCalendarEventModalDetails,
  renderExternalDetailRows,
  renderTaskDetailRows
} from "./calendar-event-modal-details.js";

let activeTask = null;
let activeEventMeta = null;
let activeExternalEvent = null;
let activeExternalAnchor = null;
let calendarEventModalInitializedFor = null;
let calendarEventModalCleanupFns = [];
function resolveRef(current, id) {
  if (current) {return current;}
  return document.getElementById(id);
}

function formatTimeRange(start, end) {
  const startLabel = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

export function formatCalendarEventWindow(start, end) {
  const startDate = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
  const sameDay = start.toDateString() === end.toDateString();
  const timeLabel = formatTimeRange(start, end);
  if (sameDay) {
    return `${startDate} | ${timeLabel}`;
  }
  const endDate = end.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
  return `${startDate} ${start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })} - ${endDate} ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

async function zoomFromModal(sectionId, subsectionId, type) {
  if (!sectionId) {return;}
  if (typeof window !== "undefined" && typeof window.__skedpalZoomFromModal === "function") {
    window.__skedpalZoomFromModal({
      type,
      sectionId,
      subsectionId: subsectionId || ""
    });
    closeCalendarEventModal();
    return;
  }
  const { setZoomFilter, switchView } = await import("./navigation.js");
  switchView("tasks");
  if (type === "subsection") {
    setZoomFilter({
      type: "subsection",
      sectionId,
      subsectionId: subsectionId || ""
    });
  } else {
    setZoomFilter({ type: "section", sectionId });
  }
  closeCalendarEventModal();
}

async function zoomTaskFromModal(task) {
  if (!task) {return;}
  const payload = {
    type: "task",
    taskId: task.id,
    sectionId: task.section || "",
    subsectionId: task.subsection || ""
  };
  if (typeof window !== "undefined" && typeof window.__skedpalZoomFromModal === "function") {
    window.__skedpalZoomFromModal(payload);
    closeCalendarEventModal();
    return;
  }
  const { setZoomFilter } = await import("./navigation.js");
  setZoomFilter(payload);
  closeCalendarEventModal();
}

function setActionButtonIcons() {
  const calendarEventModalActionButtons = domRefs.calendarEventModalActionButtons || [];
  if (!calendarEventModalActionButtons.length) {return;}
  calendarEventModalActionButtons.forEach((button) => {
    if (!button?.dataset?.calendarEventAction) {return;}
    if (button.dataset.calendarEventAction === "complete") {
      button.innerHTML = checkboxIconSvg;
      button.title = "Complete";
    } else if (button.dataset.calendarEventAction === "zoom") {
      button.innerHTML = zoomInIconSvg;
      button.title = "Zoom in";
    } else if (button.dataset.calendarEventAction === "defer") {
      button.innerHTML = deferIconSvg;
      button.title = "Defer";
    } else if (button.dataset.calendarEventAction === "edit") {
      button.innerHTML = editIconSvg;
      button.title = "Edit";
    } else if (button.dataset.calendarEventAction === "delete") {
      button.innerHTML = removeIconSvg;
      button.title = "Delete";
    }
  });
}

function triggerTaskButton(selector) {
  const btn = typeof document?.querySelector === "function"
    ? document.querySelector(selector)
    : null;
  if (!btn || typeof btn.click !== "function") {return false;}
  btn.click();
  return true;
}

function emitTasksUpdated() {
  window.dispatchEvent(new Event("skedpal:tasks-updated"));
}

async function fallbackCompleteToggle() {
  if (!activeTask) {return;}
  const completed = !activeTask.completed;
  await saveTask({
    ...activeTask,
    completed,
    completedAt: completed ? new Date().toISOString() : null,
    scheduleStatus: completed ? TASK_STATUS_COMPLETED : TASK_STATUS_UNSCHEDULED
  });
  emitTasksUpdated();
}

async function fallbackDefer(dateValue) {
  if (!activeTask) {return;}
  const parsed = parseLocalDateInput(dateValue);
  await saveTask({
    ...activeTask,
    startFrom: parsed,
    scheduleStatus: TASK_STATUS_UNSCHEDULED,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  });
  emitTasksUpdated();
}


export function closeCalendarEventModal() {
  const calendarEventModal = domRefs.calendarEventModal;
  if (!calendarEventModal) {return;}
  if (calendarEventModal.classList) {
    calendarEventModal.classList.add("hidden");
  }
  resetCalendarModalPosition(calendarEventModal);
  cleanupCalendarEventModalDetails();
  activeTask = null;
  activeEventMeta = null;
  activeExternalEvent = null;
  activeExternalAnchor = null;
}

function setModalText(ref, fallbackId, value) {
  const node = resolveRef(ref, fallbackId);
  if (node) {
    node.textContent = value;
  }
}

function setModalValue(ref, fallbackId, value) {
  const node = resolveRef(ref, fallbackId);
  if (node) {
    node.value = value;
  }
}

function setModalChecked(ref, fallbackId, checked) {
  const node = resolveRef(ref, fallbackId);
  if (node) {
    node.checked = checked;
  }
}

function setModalEyebrow(text) {
  const node = resolveRef(domRefs.calendarEventModalEyebrow, "calendar-event-modal-eyebrow");
  if (node) {
    const shouldShow = Boolean(text);
    node.textContent = text || "";
    node.classList.toggle("hidden", !shouldShow);
    node.hidden = !shouldShow;
    if (node.style) {
      node.style.display = shouldShow ? "" : "none";
    }
  }
}

function setModalToolbarVisibility(visible) {
  const node = resolveRef(domRefs.calendarEventModalToolbar, "calendar-event-modal-toolbar");
  if (!node) {return;}
  node.classList.toggle("hidden", !visible);
  node.hidden = !visible;
  if (node.style) {
    node.style.display = visible ? "" : "none";
  }
}

function setDeferInputVisibility(visible) {
  const input = resolveRef(
    domRefs.calendarEventModalDeferInput,
    "calendar-event-modal-defer-date"
  );
  if (!input) {return;}
  input.classList.toggle("hidden", !visible);
  input.setAttribute("aria-hidden", visible ? "false" : "true");
  input.disabled = !visible;
  input.hidden = !visible;
  if (input.style) {
    input.style.display = visible ? "" : "none";
  }
}

function showCalendarEventModal(calendarEventModal) {
  if (calendarEventModal?.classList) {
    calendarEventModal.classList.remove("hidden");
  }
}

function applyCalendarEventModalFields(task, eventMeta) {
  setModalText(
    domRefs.calendarEventModalTitle,
    "calendar-event-modal-title",
    task.title || "Untitled task"
  );
  if (eventMeta.start && eventMeta.end) {
    setModalText(
      domRefs.calendarEventModalTime,
      "calendar-event-modal-time",
      formatCalendarEventWindow(eventMeta.start, eventMeta.end)
    );
  }
  setModalChecked(
    domRefs.calendarEventModalComplete,
    "calendar-event-modal-complete-checkbox",
    Boolean(task.completed)
  );
  setModalValue(
    domRefs.calendarEventModalDeferInput,
    "calendar-event-modal-defer-date",
    task.startFrom ? task.startFrom.slice(0, TEN) : ""
  );
  const calendarEventModalDetails = resolveRef(
    domRefs.calendarEventModalDetails,
    "calendar-event-modal-details"
  );
  renderTaskDetailRows(task, eventMeta, calendarEventModalDetails, (payload) => {
    if (!payload) {return;}
    zoomFromModal(payload.sectionId, payload.subsectionId, payload.type);
  });
}

function scheduleModalPosition(anchorEl) {
  const calendarEventModal = domRefs.calendarEventModal;
  scheduleCalendarEventModalPosition(calendarEventModal, anchorEl);
}

function isCalendarModalOpen() {
  const calendarEventModal = domRefs.calendarEventModal;
  if (!calendarEventModal?.classList) {return false;}
  return !calendarEventModal.classList.contains("hidden");
}

export function isCalendarEventModalOpen() {
  return isCalendarModalOpen();
}

function isClickInsideModal(target, panel) {
  if (!target || !panel) {return false;}
  if (typeof target.closest === "function") {
    return Boolean(target.closest(".calendar-event-modal__panel"));
  }
  return target === panel;
}

function isClickOnCalendarEvent(target) {
  if (!target) {return false;}
  if (typeof target.closest === "function") {
    return Boolean(target.closest(".calendar-event"));
  }
  return false;
}

function handleCalendarModalOutsideClick(event) {
  if (!isCalendarModalOpen()) {return;}
  const calendarEventModal = domRefs.calendarEventModal;
  const panel = getCalendarEventModalPanel(calendarEventModal);
  if (!panel) {return;}
  if (isClickInsideModal(event?.target, panel)) {return;}
  if (isClickOnCalendarEvent(event?.target)) {return;}
  closeCalendarEventModal();
}

export function openCalendarEventModal(eventMeta, anchorEl = null) {
  const calendarEventModal = resolveRef(domRefs.calendarEventModal, "calendar-event-modal");
  if (!calendarEventModal || !eventMeta) {return;}
  const task = state.tasksCache.find((entry) => entry.id === eventMeta.taskId);
  if (!task) {return;}
  activeTask = task;
  activeEventMeta = eventMeta;
  activeExternalEvent = null;
  activeExternalAnchor = null;
  setModalEyebrow("");
  setModalToolbarVisibility(true);
  const actionButtons = getCalendarEventActionButtons(calendarEventModal);
  setActionButtonVisibility(actionButtons, {
    complete: true,
    zoom: true,
    defer: true,
    edit: true,
    delete: true
  });
  setDeferInputVisibility(true);
  applyCalendarEventModalFields(task, eventMeta);
  showCalendarEventModal(calendarEventModal);
  scheduleModalPosition(anchorEl);
}

export function openExternalEventModal(event, anchorEl = null) {
  const calendarEventModal = resolveRef(domRefs.calendarEventModal, "calendar-event-modal");
  if (!calendarEventModal || !event) {return;}
  activeTask = null;
  activeEventMeta = null;
  activeExternalEvent = event;
  activeExternalAnchor = anchorEl;
  setModalEyebrow(CALENDAR_EVENT_MODAL_EXTERNAL_EYEBROW);
  setModalToolbarVisibility(false);
  const actionButtons = getCalendarEventActionButtons(calendarEventModal);
  setActionButtonVisibility(actionButtons, {
    complete: false,
    zoom: false,
    defer: false,
    edit: true,
    delete: true
  });
  setDeferInputVisibility(false);
  setModalText(
    domRefs.calendarEventModalTitle,
    "calendar-event-modal-title",
    event.title || "Calendar event"
  );
  if (event.start && event.end) {
    setModalText(
      domRefs.calendarEventModalTime,
      "calendar-event-modal-time",
      formatCalendarEventWindow(event.start, event.end)
    );
  }
  const calendarEventModalDetails = resolveRef(
    domRefs.calendarEventModalDetails,
    "calendar-event-modal-details"
  );
  renderExternalDetailRows(event, calendarEventModalDetails);
  showCalendarEventModal(calendarEventModal);
  scheduleModalPosition(anchorEl);
}

function handleCompleteAction() {
  if (!activeTask) {return;}
  if (
    activeTask.repeat?.type &&
    activeTask.repeat.type !== TASK_REPEAT_NONE &&
    activeEventMeta?.start
  ) {
    const occurrenceDate = new Date(activeEventMeta.start);
    occurrenceDate.setHours(END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS);
    window.dispatchEvent(
      new CustomEvent("skedpal:repeat-occurrence-complete", {
        detail: {
          taskId: activeTask.id,
          occurrenceIso: occurrenceDate.toISOString()
        }
      })
    );
    closeCalendarEventModal();
    return;
  }
  const handled = triggerTaskButton(`[data-complete-task="${activeTask.id}"]`);
  if (!handled) {
    fallbackCompleteToggle();
  }
  closeCalendarEventModal();
}

function handleZoomAction() {
  if (!activeTask) {return;}
  const parentId = activeTask.subtaskParentId || "";
  const targetTask = parentId
    ? state.tasksCache.find((task) => task.id === parentId) || activeTask
    : activeTask;
  const handled = triggerTaskButton(`[data-zoom-task="${targetTask.id}"]`);
  if (!handled) {
    zoomTaskFromModal(targetTask);
    return;
  }
  closeCalendarEventModal();
}

function handleEditAction() {
  if (!activeTask) {return;}
  window.dispatchEvent(
    new CustomEvent("skedpal:task-edit", {
      detail: {
        taskId: activeTask.id,
        switchView: false
      }
    })
  );
  closeCalendarEventModal();
}

function handleDeleteAction() {
  if (!activeTask) {return;}
  triggerTaskButton(`[data-delete="${activeTask.id}"]`);
  closeCalendarEventModal();
}

function handleDeferAction() {
  const calendarEventModalDeferInput = resolveRef(
    domRefs.calendarEventModalDeferInput,
    "calendar-event-modal-defer-date"
  );
  if (!calendarEventModalDeferInput) {return;}
  calendarEventModalDeferInput.dispatchEvent(new Event("click", { bubbles: true }));
}

function handleDeferChange(event) {
  if (!event?.target?.value) {return;}
  fallbackDefer(event.target.value);
  closeCalendarEventModal();
}

function handleCalendarEventActionClick(event) {
  const btn = event?.currentTarget || this;
  const action = btn?.dataset?.calendarEventAction;
  const handler = resolveCalendarEventAction(action, {
    activeTask,
    activeExternalEvent,
    onComplete: handleCompleteAction,
    onZoom: handleZoomAction,
    onDefer: handleDeferAction,
    onEdit: handleEditAction,
    onDelete: handleDeleteAction,
    onExternalEdit: handleExternalEditAction,
    onExternalDelete: handleExternalDeleteAction
  });
  handler?.();
}

function handleExternalEditAction() {
  const link = resolveExternalEventLink();
  if (link && typeof window !== "undefined") {
    window.open(link, "_blank", "noopener,noreferrer");
  }
  closeCalendarEventModal();
}

function handleExternalDeleteAction() {
  const deleteBtn = activeExternalAnchor?.querySelector?.("[data-calendar-event-delete]");
  if (deleteBtn && typeof deleteBtn.click === "function") {
    deleteBtn.click();
  }
  closeCalendarEventModal();
}

function resolveExternalEventLink() {
  const directLink = activeExternalEvent?.link || activeExternalAnchor?.dataset?.eventLink || "";
  if (directLink) {return directLink;}
  const eventId =
    activeExternalEvent?.id ||
    activeExternalAnchor?.dataset?.eventExternalId ||
    activeExternalAnchor?.dataset?.eventId ||
    "";
  if (!eventId) {return "";}
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(eventId)}`;
}

function resetCalendarEventModalListeners() {
  calendarEventModalCleanupFns.forEach((cleanup) => cleanup());
  calendarEventModalCleanupFns = [];
}

function getCalendarEventActionButtons(calendarEventModal) {
  const buttons = domRefs.calendarEventModalActionButtons || [];
  if (buttons.length) {return buttons;}
  if (!calendarEventModal?.querySelectorAll) {return [];}
  const refreshed = [...calendarEventModal.querySelectorAll("[data-calendar-event-action]")];
  domRefs.calendarEventModalActionButtons = refreshed;
  return refreshed;
}

function getCalendarEventCloseButtons(calendarEventModal) {
  const buttons = domRefs.calendarEventModalCloseButtons || [];
  if (buttons.length) {return buttons;}
  if (!calendarEventModal?.querySelectorAll) {return [];}
  const refreshed = [...calendarEventModal.querySelectorAll("[data-calendar-event-close]")];
  domRefs.calendarEventModalCloseButtons = refreshed;
  return refreshed;
}

export function cleanupCalendarEventModal() {
  resetCalendarEventModalListeners();
  calendarEventModalInitializedFor = null;
}

export function initCalendarEventModal() {
  const calendarEventModal = resolveRef(domRefs.calendarEventModal, "calendar-event-modal");
  if (!calendarEventModal) {return;}
  if (calendarEventModalInitializedFor === calendarEventModal) {return;}
  if (calendarEventModalInitializedFor && calendarEventModalInitializedFor !== calendarEventModal) {
    cleanupCalendarEventModal();
  }
  calendarEventModalInitializedFor = calendarEventModal;
  resetCalendarEventModalListeners();
  const calendarEventModalCloseButtons = getCalendarEventCloseButtons(calendarEventModal);
  const calendarEventModalActionButtons = getCalendarEventActionButtons(calendarEventModal);
  const calendarEventModalComplete = resolveRef(
    domRefs.calendarEventModalComplete,
    "calendar-event-modal-complete-checkbox"
  );
  const calendarEventModalDeferInput = resolveRef(
    domRefs.calendarEventModalDeferInput,
    "calendar-event-modal-defer-date"
  );
  if (!calendarEventModal) {return;}
  setActionButtonIcons();
  calendarEventModalCloseButtons.forEach((btn) => {
    btn.addEventListener("click", closeCalendarEventModal);
    calendarEventModalCleanupFns.push(() => {
      btn.removeEventListener("click", closeCalendarEventModal);
    });
  });
  calendarEventModalActionButtons.forEach((btn) => {
    btn.addEventListener("click", handleCalendarEventActionClick);
    calendarEventModalCleanupFns.push(() => {
      btn.removeEventListener("click", handleCalendarEventActionClick);
    });
  });
  if (calendarEventModalComplete) {
    calendarEventModalComplete.addEventListener("change", handleCompleteAction);
    calendarEventModalCleanupFns.push(() => {
      calendarEventModalComplete.removeEventListener("change", handleCompleteAction);
    });
  }
  if (calendarEventModalDeferInput) {
    calendarEventModalDeferInput.addEventListener("change", handleDeferChange);
    calendarEventModalCleanupFns.push(() => {
      calendarEventModalDeferInput.removeEventListener("change", handleDeferChange);
    });
  }
  document.addEventListener("click", handleCalendarModalOutsideClick);
  calendarEventModalCleanupFns.push(() => {
    document.removeEventListener("click", handleCalendarModalOutsideClick);
  });
}
