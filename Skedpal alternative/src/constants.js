export const DEFAULT_TASK_DURATION_MIN = 30;
export const DEFAULT_TASK_MIN_BLOCK_MIN = 15;
export const TASK_DURATION_STEP_MIN = 15;
export const DEFAULT_TASK_PRIORITY = 3;
export const TASK_REPEAT_NONE = "none";
export const DEFAULT_TASK_REPEAT = Object.freeze({ type: TASK_REPEAT_NONE });
export const TASK_STATUS_SCHEDULED = "scheduled";
export const TASK_STATUS_UNSCHEDULED = "unscheduled";
export const TASK_STATUS_IGNORED = "ignored";
export const TASK_STATUS_COMPLETED = "completed";
export const SUBTASK_SCHEDULE_PARALLEL = "parallel";
export const SUBTASK_SCHEDULE_SEQUENTIAL = "sequential";
export const SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE = "sequential-single";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-20b";
export const CALENDAR_EVENT_MODAL_TASK_EYEBROW = "Scheduled task";
export const CALENDAR_EVENT_MODAL_EXTERNAL_EYEBROW = "Google Calendar";
export const CREATE_TASK_MENU_ID = "skedpal-create-task";
export const CREATE_TASK_OVERLAY_SCRIPT = "src/content/create-task-overlay.js";
export const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
export const DB_NAME = "personal-skedpal";
export const DB_VERSION = 4;
export const DEFAULT_CALENDAR_IDS = [
  "951d3b2328ace2ababeb5e28228a9bcefa20851a5de9e810dfd8e4ad49277d3c@group.calendar.google.com",
  "dohdat@gmail.com"
];
export const CALENDAR_COLOR_OVERRIDES = {
  "951d3b2328ace2ababeb5e28228a9bcefa20851a5de9e810dfd8e4ad49277d3c@group.calendar.google.com": "#a479b1",
  "dohdat@gmail.com": "#63ca00"
};
