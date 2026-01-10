import {
  DEFAULT_TASK_DURATION_MIN,
  DEFAULT_TASK_MIN_BLOCK_MIN,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_REPEAT,
  TEN,
  SUBTASK_SCHEDULE_PARALLEL,
  TASK_REPEAT_NONE
} from "./constants.js";
import { repeatStore } from "./repeat.js";

export const DEFAULT_SUBSECTION_TEMPLATE = {
  title: "",
  link: "",
  durationMin: DEFAULT_TASK_DURATION_MIN,
  minBlockMin: DEFAULT_TASK_MIN_BLOCK_MIN,
  priority: DEFAULT_TASK_PRIORITY,
  deadline: "",
  startFrom: "",
  repeat: { ...DEFAULT_TASK_REPEAT },
  timeMapIds: [],
  subtaskScheduleMode: SUBTASK_SCHEDULE_PARALLEL
};

export function resolveSubsectionRepeatSelection() {
  const selection = repeatStore.subsectionRepeatSelection;
  if (selection?.type && selection.type !== TASK_REPEAT_NONE) {
    return selection;
  }
  return { ...DEFAULT_TASK_REPEAT };
}

export function formatTemplateDate(value) {
  return value ? value.slice(0, TEN) : "";
}

export function getInputValue(input, fallback = "") {
  if (!input) {return fallback;}
  const value = input.value;
  return value !== undefined && value !== null && value !== "" ? value : fallback;
}

export function getNumberInputValue(input, fallback) {
  const value = Number(getInputValue(input, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function setInputValue(input, value) {
  if (input) {
    input.value = value;
  }
}
