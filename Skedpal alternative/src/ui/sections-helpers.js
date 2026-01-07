import { repeatStore } from "./repeat.js";

export const DEFAULT_SUBSECTION_TEMPLATE = {
  title: "",
  link: "",
  durationMin: 30,
  minBlockMin: 30,
  priority: 3,
  deadline: "",
  startFrom: "",
  repeat: { type: "none" },
  timeMapIds: [],
  subtaskScheduleMode: "parallel"
};

export function resolveSubsectionRepeatSelection() {
  const selection = repeatStore.subsectionRepeatSelection;
  if (selection?.type && selection.type !== "none") {
    return selection;
  }
  return { type: "none" };
}

export function formatTemplateDate(value) {
  return value ? value.slice(0, 10) : "";
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
