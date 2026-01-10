import {
  DEFAULT_TASK_MIN_BLOCK_MIN,
  FIFTY,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  SIXTY,
  TWO,
  TWENTY,
  TWO_THOUSAND_FIVE_HUNDRED,
  THREE_THOUSAND_FIVE_HUNDRED,
  domRefs
} from "./constants.js";
import { state } from "./state/page-state.js";
import { getDateFromDayKey, roundMinutesToStep, clampMinutes } from "./calendar-utils.js";
import { showNotificationBanner } from "./notifications.js";
import { sendExternalCreateRequest } from "./calendar-external-events.js";
import { syncExternalEventsCache } from "./calendar-external.js";
import { HOUR_HEIGHT, formatEventTimeRange } from "./calendar-render.js";
import {
  closeCalendarEventModal,
  isCalendarEventModalOpen
} from "./calendar-event-modal.js";

const DEFAULT_DURATION_MIN = SIXTY;
const MIN_DURATION_MIN = DEFAULT_TASK_MIN_BLOCK_MIN;
let calendarCreateCleanup = null;
let calendarRenderHandler = null;
let draftBlock = null;
let draftDayKey = "";

function getRuntime() {
  return globalThis.chrome?.runtime || null;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(TWO, "0");
  const day = `${date.getDate()}`.padStart(TWO, "0");
  return `${year}-${month}-${day}`;
}

function toInputTime(minutes) {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const mins = Math.floor(minutes % MINUTES_PER_HOUR);
  return `${`${hours}`.padStart(TWO, "0")}:${`${mins}`.padStart(TWO, "0")}`;
}

function parseTimeInput(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {return null;}
  return hours * MINUTES_PER_HOUR + minutes;
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) {return DEFAULT_DURATION_MIN;}
  return Math.max(MIN_DURATION_MIN, Math.round(duration));
}

function getCalendarGrid() {
  return domRefs.calendarGrid || document.getElementById("calendar-grid");
}

function resolveDefaultCalendarId(calendars) {
  const selection = Array.isArray(state.settingsCache.googleCalendarIds)
    ? state.settingsCache.googleCalendarIds
    : [];
  if (selection.length) {
    return selection[0];
  }
  const primary = (calendars || []).find((entry) => entry.primary);
  return primary?.id || calendars?.[0]?.id || "";
}

async function requestCalendarList() {
  const runtime = getRuntime();
  if (!runtime?.sendMessage) {return [];}
  return new Promise((resolve) => {
    runtime.sendMessage({ type: "calendar-list" }, (resp) => {
      if (runtime.lastError || !resp?.ok) {
        resolve([]);
        return;
      }
      resolve(resp.calendars || []);
    });
  });
}

function setCalendarOptions(select, calendars, selectedId) {
  if (!select) {return;}
  select.innerHTML = "";
  if (!calendars.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No calendars available";
    option.setAttribute("data-test-skedpal", "calendar-create-calendar-option-empty");
    select.appendChild(option);
    select.value = "";
    return;
  }
  calendars.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id || "";
    option.textContent = entry.summary || entry.id || "Untitled calendar";
    option.setAttribute("data-test-skedpal", "calendar-create-calendar-option");
    select.appendChild(option);
  });
  select.value = selectedId || calendars[0]?.id || "";
}

function clearDraftBlock() {
  if (!draftBlock) {return;}
  draftBlock.remove?.();
  draftBlock = null;
  draftDayKey = "";
}

function buildDraftBlock(dayCol, startMinutes, durationMinutes, titleText) {
  const block = document.createElement("div");
  block.className = "calendar-event calendar-event--draft";
  block.setAttribute("data-test-skedpal", "calendar-event-draft");
  block.dataset.eventSource = "external";
  block.dataset.eventExternalId = "";
  block.dataset.eventCalendarId = "";
  block.style.top = `${(startMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT}px`;
  block.style.height = `${Math.max(TWENTY, (durationMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT)}px`;
  block.style.left = "8px";
  block.style.right = "8px";
  const title = document.createElement("div");
  title.className = "calendar-event-title";
  title.textContent = titleText || "(No title)";
  title.setAttribute("data-test-skedpal", "calendar-event-draft-title");
  const time = document.createElement("div");
  time.className = "calendar-event-time";
  time.setAttribute("data-test-skedpal", "calendar-event-draft-time");
  const start = getDateFromDayKey(dayCol.dataset.day);
  if (start) {
    start.setMinutes(startMinutes, 0, 0);
    const end = new Date(start.getTime() + durationMinutes * MS_PER_MINUTE);
    time.textContent = formatEventTimeRange(start, end);
  }
  block.appendChild(title);
  block.appendChild(time);
  return block;
}

function renderDraftBlock(options) {
  const grid = getCalendarGrid();
  if (!grid) {return;}
  const dayCol = grid.querySelector?.(`[data-day="${options.dayKey}"]`);
  if (!dayCol) {return;}
  clearDraftBlock();
  draftDayKey = options.dayKey;
  const titleText = domRefs.calendarCreateTitle?.value?.trim() || "";
  draftBlock = buildDraftBlock(
    dayCol,
    options.startMinutes,
    options.durationMinutes,
    titleText
  );
  dayCol.appendChild(draftBlock);
}

function updateDraftFromInputs() {
  if (!draftBlock) {return;}
  const dateValue = domRefs.calendarCreateDate?.value || "";
  const timeValue = domRefs.calendarCreateTime?.value || "";
  const durationValue = domRefs.calendarCreateDuration?.value || "";
  const dayKey = dateValue || draftDayKey;
  const minutes = parseTimeInput(timeValue);
  const durationMinutes = normalizeDuration(durationValue);
  if (!dayKey || !Number.isFinite(minutes)) {return;}
  const startMinutes = clampMinutes(
    minutes,
    0,
    HOURS_PER_DAY * MINUTES_PER_HOUR - MIN_DURATION_MIN
  );
  renderDraftBlock({ dayKey, startMinutes, durationMinutes });
}

function handleDraftTitleInput() {
  if (!draftBlock) {return;}
  const titleText = domRefs.calendarCreateTitle?.value?.trim() || "(No title)";
  const title = draftBlock.querySelector?.('[data-test-skedpal="calendar-event-draft-title"]');
  if (!title) {return;}
  title.textContent = titleText;
}

function applyModalDefaults(options) {
  const { calendarCreateDate, calendarCreateTime, calendarCreateDuration } = domRefs;
  const date = getDateFromDayKey(options.dayKey);
  if (date && calendarCreateDate) {
    calendarCreateDate.value = toInputDate(date);
  }
  if (calendarCreateTime) {
    calendarCreateTime.value = toInputTime(options.startMinutes);
  }
  if (calendarCreateDuration) {
    calendarCreateDuration.value = String(DEFAULT_DURATION_MIN);
  }
}

export async function openCalendarCreateModal(options) {
  const { calendarCreateModal, calendarCreateTitle, calendarCreateCalendarSelect } = domRefs;
  if (!calendarCreateModal) {return;}
  applyModalDefaults(options);
  if (calendarCreateTitle) {
    calendarCreateTitle.value = "";
  }
  renderDraftBlock({
    dayKey: options.dayKey,
    startMinutes: options.startMinutes,
    durationMinutes: DEFAULT_DURATION_MIN
  });
  const calendars = await requestCalendarList();
  const selectedId = resolveDefaultCalendarId(calendars);
  setCalendarOptions(calendarCreateCalendarSelect, calendars, selectedId);
  calendarCreateModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => {
    calendarCreateTitle?.focus?.();
  }, FIFTY);
}

function closeCalendarCreateModal() {
  const { calendarCreateModal } = domRefs;
  if (!calendarCreateModal) {return;}
  calendarCreateModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  clearDraftBlock();
}

function handleCalendarCreateOverlayClick(event) {
  if (event.target === domRefs.calendarCreateModal) {
    closeCalendarCreateModal();
  }
}

function handleCalendarCreateKeydown(event) {
  if (event.key === "Escape") {
    closeCalendarCreateModal();
  }
}

function buildCreatePayload() {
  const {
    calendarCreateTitle,
    calendarCreateCalendarSelect,
    calendarCreateDate,
    calendarCreateTime,
    calendarCreateDuration
  } = domRefs;
  const calendarId = calendarCreateCalendarSelect?.value || "";
  if (!calendarId) {
    return { error: "Select a calendar first." };
  }
  const title = calendarCreateTitle?.value?.trim() || "";
  const dateValue = calendarCreateDate?.value || "";
  const timeValue = calendarCreateTime?.value || "";
  if (!dateValue || !timeValue) {
    return { error: "Pick a start date and time." };
  }
  const minutes = parseTimeInput(timeValue);
  if (!Number.isFinite(minutes)) {
    return { error: "Invalid start time." };
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { error: "Invalid date." };
  }
  date.setMinutes(minutes, 0, 0);
  const duration = normalizeDuration(calendarCreateDuration?.value);
  const end = new Date(date.getTime() + duration * MS_PER_MINUTE);
  return {
    calendarId,
    title,
    start: date,
    end
  };
}

function applyCreatedEvent(created) {
  state.calendarExternalEvents = [
    ...(state.calendarExternalEvents || []),
    {
      ...created,
      start: new Date(created.start),
      end: new Date(created.end)
    }
  ];
}

async function submitCreatePayload(payload) {
  const response = await sendExternalCreateRequest(getRuntime(), payload);
  if (!response?.ok || !response?.event) {
    throw new Error(response?.error || "Calendar event creation failed.");
  }
  return response.event;
}

async function handleCalendarCreateSubmit(event) {
  event.preventDefault();
  const payload = buildCreatePayload();
  if (payload.error) {
    showNotificationBanner(payload.error);
    return;
  }
  showNotificationBanner("Creating event...");
  try {
    const created = await submitCreatePayload(payload);
    applyCreatedEvent(created);
    await syncExternalEventsCache(state.calendarExternalEvents);
    calendarRenderHandler?.();
    closeCalendarCreateModal();
    showNotificationBanner("Event created.", { autoHideMs: TWO_THOUSAND_FIVE_HUNDRED });
  } catch (error) {
    console.warn("Failed to create Google Calendar event.", error);
    showNotificationBanner(error?.message || "Failed to create Google Calendar event.", {
      autoHideMs: THREE_THOUSAND_FIVE_HUNDRED
    });
  }
}

export function openCalendarCreateFromClick(event) {
  if (isCalendarEventModalOpen()) {
    closeCalendarEventModal();
    return true;
  }
  const dayCol = event.target?.closest?.(".calendar-day-col");
  if (!dayCol || !dayCol.dataset.day) {return false;}
  const rect = dayCol.getBoundingClientRect?.();
  if (!rect) {return false;}
  const y = clampMinutes(event.clientY - rect.top, 0, rect.height);
  const pointerMinutes = (y / rect.height) * HOURS_PER_DAY * MINUTES_PER_HOUR;
  const rounded = roundMinutesToStep(pointerMinutes, MIN_DURATION_MIN);
  const minutes = clampMinutes(
    rounded,
    0,
    HOURS_PER_DAY * MINUTES_PER_HOUR - MIN_DURATION_MIN
  );
  openCalendarCreateModal({ dayKey: dayCol.dataset.day, startMinutes: minutes });
  return true;
}

export function initCalendarCreateModal(options = {}) {
  if (options.onRender) {
    calendarRenderHandler = options.onRender;
  }
  const {
    calendarCreateModal,
    calendarCreateForm,
    calendarCreateCloseButtons,
    calendarCreateTitle,
    calendarCreateDate,
    calendarCreateTime,
    calendarCreateDuration
  } = domRefs;
  if (!calendarCreateModal || !calendarCreateForm) {return;}
  if (calendarCreateModal.dataset.modalReady === "true") {return;}
  calendarCreateModal.dataset.modalReady = "true";
  calendarCreateModal.addEventListener("click", handleCalendarCreateOverlayClick);
  calendarCreateForm.addEventListener("submit", handleCalendarCreateSubmit);
  calendarCreateTitle?.addEventListener("input", handleDraftTitleInput);
  calendarCreateDate?.addEventListener("change", updateDraftFromInputs);
  calendarCreateTime?.addEventListener("change", updateDraftFromInputs);
  calendarCreateDuration?.addEventListener("change", updateDraftFromInputs);
  calendarCreateCloseButtons.forEach((btn) => {
    btn.addEventListener("click", closeCalendarCreateModal);
  });
  document.addEventListener("keydown", handleCalendarCreateKeydown);
  calendarCreateCleanup = () => {
    calendarCreateModal.removeEventListener("click", handleCalendarCreateOverlayClick);
    calendarCreateForm.removeEventListener("submit", handleCalendarCreateSubmit);
    calendarCreateTitle?.removeEventListener("input", handleDraftTitleInput);
    calendarCreateDate?.removeEventListener("change", updateDraftFromInputs);
    calendarCreateTime?.removeEventListener("change", updateDraftFromInputs);
    calendarCreateDuration?.removeEventListener("change", updateDraftFromInputs);
    calendarCreateCloseButtons.forEach((btn) => {
      btn.removeEventListener("click", closeCalendarCreateModal);
    });
    document.removeEventListener("keydown", handleCalendarCreateKeydown);
    calendarCreateModal.dataset.modalReady = "false";
  };
}

export function cleanupCalendarCreateModal() {
  if (!calendarCreateCleanup) {return;}
  calendarCreateCleanup();
  calendarCreateCleanup = null;
}
