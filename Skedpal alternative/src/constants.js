export const DEFAULT_TASK_DURATION_MIN = 30;
export const DEFAULT_TASK_MIN_BLOCK_MIN = 15;
export const TASK_DURATION_STEP_MIN = 15;
export const DEFAULT_TASK_PRIORITY = 3;
export const INDEX_NOT_FOUND = -1;

export const TWO = 2;
export const THREE = 3;
export const FOUR = 4;
export const FIVE = 5;
export const SIX = 6;
export const SEVEN = 7;
export const EIGHT = 8;
export const EIGHTY = 80;
export const TEN = 10;
export const ELEVEN = 11;
export const TWELVE = 12;
export const THIRTEEN = 13;
export const FOURTEEN = 14;
export const FIFTEEN = 15;
export const SIXTEEN = 16;
export const TWENTY = 20;
export const TWENTY_THREE = 23;
export const TWENTY_FOUR = 24;
export const TWENTY_NINE = 29;
export const THIRTY_ONE = 31;
export const THIRTY_SIX = 36;
export const FORTY = 40;
export const FIFTY = 50;
export const FIFTY_NINE = 59;
export const SIXTY = 60;
export const NINETY = 90;
export const ONE_HUNDRED = 100;
export const ONE_TWENTY = 120;
export const TWO_FIFTY = 250;
export const TWO_FIFTY_FIVE = 255;
export const TWO_THOUSAND_FIVE_HUNDRED = 2500;
export const TWO_SIXTY = 260;
export const THREE_SIXTY = 360;
export const THREE_THOUSAND_FIVE_HUNDRED = 3500;
export const FOUR_TWENTY = 420;
export const THREE_SIXTY_FIVE = 365;
export const SIX_THOUSAND_FIVE_HUNDRED = 6500;
export const END_OF_DAY_MS = 999;
export const PERCENT_LABEL_CAP = 999;
export const MAX_INT_32 = 2147483647;

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = SIXTY;
export const MINUTES_PER_HOUR = SIXTY;
export const HOURS_PER_DAY = TWENTY_FOUR;
export const DAYS_PER_WEEK = SEVEN;
export const DAYS_PER_YEAR = THREE_SIXTY_FIVE;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

export const END_OF_DAY_HOUR = TWENTY_THREE;
export const END_OF_DAY_MINUTE = FIFTY_NINE;
export const END_OF_DAY_SECOND = FIFTY_NINE;

export const OPACITY_TWENTY_TWO = 0.22;
export const OPACITY_THIRTY_FIVE = 0.35;
export const OPACITY_FORTY_FIVE = 0.45;
export const OPACITY_SIXTY = 0.6;
export const OPACITY_EIGHTY = 0.8;

export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_FORBIDDEN = 403;

export const HALF = 0.5;
export const SORT_BEFORE = INDEX_NOT_FOUND;
export const SORT_AFTER = 1;
export const REMINDER_DAY_OPTIONS = [1, TWO, THREE, FIVE, SEVEN, FOURTEEN];
export const REMINDER_PANEL_PADDING_PX = TWELVE;
export const REMINDER_PANEL_FALLBACK_WIDTH_PX = THREE_SIXTY;
export const REMINDER_PANEL_FALLBACK_HEIGHT_PX = FOUR_TWENTY;
export const REMINDER_PANEL_ANCHOR_OFFSET_PX = TWENTY_FOUR;
export const REMINDER_PANEL_FOCUS_DELAY_MS = FIFTY;
export const TASK_CHILD_INDENT_PX = TEN;
export const TASK_TITLE_MAX_LENGTH = TWO_FIFTY;
export const TASK_TITLE_LONG_THRESHOLD = EIGHTY;
export const MOUSE_BUTTON_BACK = THREE;
export const MOUSE_BUTTON_FORWARD = FOUR;
export const TASK_REPEAT_NONE = "none";
export const DEFAULT_TASK_REPEAT = Object.freeze({ type: TASK_REPEAT_NONE });
export const TASK_STATUS_SCHEDULED = "scheduled";
export const TASK_STATUS_UNSCHEDULED = "unscheduled";
export const TASK_STATUS_IGNORED = "ignored";
export const TASK_STATUS_COMPLETED = "completed";
export const SUBTASK_SCHEDULE_PARALLEL = "parallel";
export const SUBTASK_SCHEDULE_SEQUENTIAL = "sequential";
export const SUBTASK_SCHEDULE_SEQUENTIAL_SINGLE = "sequential-single";
export const EXTERNAL_CALENDAR_TIMEMAP_PREFIX = "external-calendar:";

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
