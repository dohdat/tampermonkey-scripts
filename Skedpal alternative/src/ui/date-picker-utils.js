const TWO = 2;
const THREE = 3;
const FIVE = 5;
const SIX = 6;
const SEVEN = 7;
const TWELVE = 12;
const FOURTEEN = 14;
const TWENTY_ONE = 21;

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function toDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {return "";}
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(TWO, "0");
  const day = `${date.getDate()}`.padStart(TWO, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value) {
  if (!value) {return null;}
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== THREE || parts.some((part) => !Number.isFinite(part))) {return null;}
  const [year, month, day] = parts;
  const candidate = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(candidate.getTime())) {return null;}
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

export function addDays(date, days) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

export function addMonths(date, months) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const rawMonth = base.getMonth() + months;
  const targetYear = base.getFullYear() + Math.floor(rawMonth / TWELVE);
  const targetMonth = ((rawMonth % TWELVE) + TWELVE) % TWELVE;
  const targetDay = Math.min(base.getDate(), getDaysInMonth(targetYear, targetMonth));
  return new Date(targetYear, targetMonth, targetDay);
}

export function getMonthData(viewDate) {
  const year = viewDate.getFullYear();
  const monthIndex = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  return { year, monthIndex, daysInMonth, startWeekday };
}

export function formatShortDateLabel(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDateLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function getMonthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function buildQuickPickSections(baseDate) {
  return [
    {
      id: "soon",
      label: "Soon",
      options: [
        { label: "Today", date: addDays(baseDate, 0) },
        { label: "Tomorrow", date: addDays(baseDate, 1) },
        { label: "In 3 days", date: addDays(baseDate, THREE) },
        { label: "In 5 days", date: addDays(baseDate, FIVE) }
      ]
    },
    {
      id: "month",
      label: "This Month",
      options: [
        { label: "Next week", date: addDays(baseDate, SEVEN) },
        { label: "In 2 weeks", date: addDays(baseDate, FOURTEEN) },
        { label: "In 3 weeks", date: addDays(baseDate, TWENTY_ONE) }
      ]
    },
    {
      id: "later",
      label: "Later",
      options: [
        { label: "Next month", date: addMonths(baseDate, 1) },
        { label: "In 2 months", date: addMonths(baseDate, TWO) },
        { label: "In 3 months", date: addMonths(baseDate, THREE) },
        { label: "In 6 months", date: addMonths(baseDate, SIX) }
      ]
    }
  ];
}
