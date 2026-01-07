import {
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

let activeTask = null;
let activeEventMeta = null;
let calendarEventModalInitializedFor = null;

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

function getSectionLabel(sectionId) {
  const match = (state.settingsCache?.sections || []).find((section) => section.id === sectionId);
  return match?.name || "";
}

function getSubsectionLabel(sectionId, subsectionId) {
  if (!sectionId || !subsectionId) {return "";}
  const list = state.settingsCache?.subsections?.[sectionId] || [];
  const match = list.find((subsection) => subsection.id === subsectionId);
  return match?.name || "";
}

function getTimeMapLabel(timeMapId) {
  if (!timeMapId) {return "";}
  const timeMap = (state.tasksTimeMapsCache || []).find((map) => map.id === timeMapId);
  return timeMap?.name || "";
}

function getTimeMapColor(timeMapId) {
  if (!timeMapId) {return "";}
  const timeMap = (state.tasksTimeMapsCache || []).find((map) => map.id === timeMapId);
  return timeMap?.color || "";
}

function pushDetailRow(rows, label, value, extra = {}) {
  if (!value) {return;}
  rows.push({ label, value, ...extra });
}

function buildDetailRows(task, eventMeta) {
  const rows = [];
  pushDetailRow(rows, "TimeMap", getTimeMapLabel(eventMeta?.timeMapId), {
    textColor: getTimeMapColor(eventMeta?.timeMapId)
  });
  pushDetailRow(rows, "Section", getSectionLabel(task.section), {
    zoomType: "section",
    sectionId: task.section || "",
    subsectionId: ""
  });
  pushDetailRow(rows, "Subsection", getSubsectionLabel(task.section, task.subsection), {
    zoomType: "subsection",
    sectionId: task.section || "",
    subsectionId: task.subsection || ""
  });
  pushDetailRow(rows, "Duration", task.durationMin ? `${task.durationMin} min` : "");
  pushDetailRow(rows, "Deadline", task.deadline ? new Date(task.deadline).toLocaleDateString() : "");
  pushDetailRow(
    rows,
    "Start from",
    task.startFrom ? new Date(task.startFrom).toLocaleDateString() : ""
  );
  pushDetailRow(rows, "Priority", task.priority ? `${task.priority}` : "");
  pushDetailRow(rows, "Link", task.link || "", { isLink: true });
  return rows;
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

function renderDetailRows(task, eventMeta) {
  const calendarEventModalDetails = resolveRef(
    domRefs.calendarEventModalDetails,
    "calendar-event-modal-details"
  );
  if (!calendarEventModalDetails) {return;}
  calendarEventModalDetails.innerHTML = "";
  buildDetailRows(task, eventMeta).forEach((row, index) => {
    const wrap = document.createElement("div");
    wrap.className = "calendar-event-modal__detail-row";
    wrap.setAttribute("data-test-skedpal", "calendar-event-modal-detail-row");
    const label = document.createElement("span");
    label.className = "calendar-event-modal__detail-label";
    label.textContent = row.label;
    label.setAttribute("data-test-skedpal", "calendar-event-modal-detail-label");
    let value = null;
    if (row.isLink) {
      value = document.createElement("a");
      value.className = "calendar-event-modal__detail-value calendar-event-modal__detail-link";
      value.href = row.value;
      value.target = "_blank";
      value.rel = "noopener noreferrer";
    } else if (row.zoomType) {
      value = document.createElement("button");
      value.type = "button";
      value.className =
        "calendar-event-modal__detail-value calendar-event-modal__detail-link calendar-event-modal__detail-link--zoom";
      value.dataset.zoomType = row.zoomType;
      value.dataset.zoomSection = row.sectionId || "";
      value.dataset.zoomSubsection = row.subsectionId || "";
      value.addEventListener("click", () =>
        zoomFromModal(row.sectionId || "", row.subsectionId || "", row.zoomType)
      );
    } else {
      value = document.createElement("span");
      value.className = "calendar-event-modal__detail-value";
    }
    if (row.textColor) {
      value.style.color = row.textColor;
    }
    value.textContent = row.value;
    value.setAttribute("data-test-skedpal", `calendar-event-modal-detail-value-${index}`);
    wrap.appendChild(label);
    wrap.appendChild(value);
    calendarEventModalDetails.appendChild(wrap);
  });
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
  const btn = document.querySelector(selector);
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
    scheduleStatus: completed ? "completed" : "unscheduled"
  });
  emitTasksUpdated();
}

async function fallbackDefer(dateValue) {
  if (!activeTask) {return;}
  const parsed = parseLocalDateInput(dateValue);
  await saveTask({
    ...activeTask,
    startFrom: parsed,
    scheduleStatus: "unscheduled",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledTimeMapId: null,
    scheduledInstances: []
  });
  emitTasksUpdated();
}

function closeCalendarEventModal() {
  const calendarEventModal = domRefs.calendarEventModal;
  if (!calendarEventModal) {return;}
  if (calendarEventModal.classList) {
    calendarEventModal.classList.add("hidden");
  }
  if (document.body?.classList) {
    document.body.classList.remove("modal-open");
  }
  activeTask = null;
  activeEventMeta = null;
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

export function openCalendarEventModal(eventMeta) {
  const calendarEventModal = resolveRef(domRefs.calendarEventModal, "calendar-event-modal");
  if (!calendarEventModal || !eventMeta) {return;}
  const task = state.tasksCache.find((entry) => entry.id === eventMeta.taskId);
  if (!task) {return;}
  activeTask = task;
  activeEventMeta = eventMeta;
  setModalText(domRefs.calendarEventModalTitle, "calendar-event-modal-title", task.title || "Untitled task");
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
    task.startFrom ? task.startFrom.slice(0, 10) : ""
  );
  renderDetailRows(task, eventMeta);
  if (calendarEventModal?.classList) {
    calendarEventModal.classList.remove("hidden");
  }
  if (document.body?.classList) {
    document.body.classList.add("modal-open");
  }
}

function handleCompleteAction() {
  if (!activeTask) {return;}
  if (activeTask.repeat?.type && activeTask.repeat.type !== "none" && activeEventMeta?.start) {
    const occurrenceDate = new Date(activeEventMeta.start);
    occurrenceDate.setHours(23, 59, 59, 999);
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
  triggerTaskButton(`[data-zoom-task="${activeTask.id}"]`);
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
  if (typeof calendarEventModalDeferInput.showPicker === "function") {
    calendarEventModalDeferInput.showPicker();
  } else {
    calendarEventModalDeferInput.focus();
  }
}

function handleDeferChange(event) {
  if (!event?.target?.value) {return;}
  fallbackDefer(event.target.value);
  closeCalendarEventModal();
}

export function initCalendarEventModal() {
  const calendarEventModal = resolveRef(domRefs.calendarEventModal, "calendar-event-modal");
  if (!calendarEventModal) {return;}
  if (calendarEventModalInitializedFor === calendarEventModal) {return;}
  calendarEventModalInitializedFor = calendarEventModal;
  const calendarEventModalCloseButtons = domRefs.calendarEventModalCloseButtons || [];
  const calendarEventModalActionButtons = domRefs.calendarEventModalActionButtons || [];
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
  });
  calendarEventModalActionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.calendarEventAction;
      if (action === "complete") {
        handleCompleteAction();
      } else if (action === "zoom") {
        handleZoomAction();
      } else if (action === "defer") {
        handleDeferAction();
      } else if (action === "edit") {
        handleEditAction();
      } else if (action === "delete") {
        handleDeleteAction();
      }
    });
  });
  if (calendarEventModalComplete) {
    calendarEventModalComplete.addEventListener("change", handleCompleteAction);
  }
  if (calendarEventModalDeferInput) {
    calendarEventModalDeferInput.addEventListener("change", handleDeferChange);
  }
}
