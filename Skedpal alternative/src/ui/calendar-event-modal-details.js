import { state } from "./state/page-state.js";

let detailZoomButtons = [];
let detailZoomHandler = null;

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

function buildTaskDetailRows(task, eventMeta) {
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
  pushDetailRow(rows, "Priority", task.priority ? `${task.priority}` : "", {
    priorityValue: Number(task.priority) || 0
  });
  pushDetailRow(rows, "Link", task.link || "", { isLink: true });
  return rows;
}

function buildExternalDetailRows(event) {
  const rows = [];
  pushDetailRow(rows, "Calendar", event.calendarId || "");
  pushDetailRow(rows, "Event ID", event.id || "");
  pushDetailRow(rows, "Link", event.link || "", { isLink: true });
  return rows;
}

function handleDetailZoomClick(event) {
  const target = event?.currentTarget || null;
  if (!target?.dataset) {return;}
  const zoomType = target.dataset.zoomType || "";
  if (!zoomType || typeof detailZoomHandler !== "function") {return;}
  detailZoomHandler({
    type: zoomType,
    sectionId: target.dataset.zoomSection || "",
    subsectionId: target.dataset.zoomSubsection || ""
  });
}

function clearDetailZoomListeners() {
  detailZoomButtons.forEach((button) => {
    button.removeEventListener("click", handleDetailZoomClick);
  });
  detailZoomButtons = [];
  detailZoomHandler = null;
}

export function cleanupCalendarEventModalDetails() {
  clearDetailZoomListeners();
}

export function renderTaskDetailRows(task, eventMeta, container, onZoom) {
  if (!container) {return;}
  clearDetailZoomListeners();
  detailZoomHandler = onZoom;
  container.innerHTML = "";
  buildTaskDetailRows(task, eventMeta).forEach((row, index) => {
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
      value.addEventListener("click", handleDetailZoomClick);
      detailZoomButtons.push(value);
    } else {
      value = document.createElement("span");
      value.className = "calendar-event-modal__detail-value";
    }
    value.textContent = row.value;
    value.setAttribute("data-test-skedpal", `calendar-event-modal-detail-value-${index}`);
    if (row.priorityValue) {
      value.classList.add("priority-text");
      value.dataset.priority = String(row.priorityValue);
    }
    if (row.textColor) {
      value.style.color = row.textColor;
    }
    wrap.appendChild(label);
    wrap.appendChild(value);
    container.appendChild(wrap);
  });
}

export function renderExternalDetailRows(event, container) {
  if (!container) {return;}
  clearDetailZoomListeners();
  container.innerHTML = "";
  buildExternalDetailRows(event).forEach((row, index) => {
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
    } else {
      value = document.createElement("span");
      value.className = "calendar-event-modal__detail-value";
    }
    value.textContent = row.value || "";
    value.setAttribute("data-test-skedpal", `calendar-event-modal-detail-value-${index}`);
    wrap.appendChild(label);
    wrap.appendChild(value);
    container.appendChild(wrap);
  });
}
