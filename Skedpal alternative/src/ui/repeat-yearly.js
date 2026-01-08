import { getLocalDateKey } from "./utils.js";

export function getDateParts(dateValue) {
  if (!dateValue) {return null;}
  if (typeof dateValue === "string") {
    const [datePart] = dateValue.split("T");
    const pieces = datePart.split("-").map((part) => Number(part));
    if (pieces.length === 3 && pieces.every((part) => Number.isFinite(part))) {
      const [, month, day] = pieces;
      return { month, day };
    }
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {return null;}
  return { month: date.getMonth() + 1, day: date.getDate() };
}

export function syncYearlyRangeInputs(repeatState, baseDate, rangeStartInput, rangeEndInput) {
  const fallback = getLocalDateKey(baseDate);
  if (rangeStartInput) {
    rangeStartInput.value = repeatState.yearlyRangeStartDate || fallback;
  }
  if (rangeEndInput) {
    rangeEndInput.value = repeatState.yearlyRangeEndDate || fallback;
  }
}
