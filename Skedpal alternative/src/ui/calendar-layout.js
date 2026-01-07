import { addCalendarDays, getMinutesIntoDay } from "./calendar-utils.js";

function normalizeEventToDay(event, dayStart, dayEnd) {
  const eventStart = new Date(Math.max(event.start.getTime(), dayStart.getTime()));
  const eventEnd = new Date(Math.min(event.end.getTime(), dayEnd.getTime()));
  const startMinutes = getMinutesIntoDay(eventStart);
  const endMinutes = getMinutesIntoDay(eventEnd);
  if (endMinutes <= startMinutes) return null;
  return {
    event,
    eventStart,
    eventEnd,
    startMinutes,
    endMinutes
  };
}

function buildOverlapGroups(items) {
  const groups = [];
  const sorted = [...items].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.endMinutes - b.endMinutes;
  });
  let current = null;
  sorted.forEach((item) => {
    if (!current || item.startMinutes >= current.endMinutes) {
      current = { items: [item], endMinutes: item.endMinutes };
      groups.push(current);
      return;
    }
    current.items.push(item);
    current.endMinutes = Math.max(current.endMinutes, item.endMinutes);
  });
  return groups;
}

export function buildDayEventLayout(dayEvents, day) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addCalendarDays(dayStart, 1);
  const normalized = dayEvents
    .map((event) => normalizeEventToDay(event, dayStart, dayEnd))
    .filter(Boolean);
  const groups = buildOverlapGroups(normalized);
  const layout = [];
  groups.forEach((group) => {
    const columns = [];
    const groupLayout = [];
    group.items.forEach((item) => {
      let columnIndex = columns.findIndex((end) => item.startMinutes >= end);
      if (columnIndex < 0) {
        columns.push(item.endMinutes);
        columnIndex = columns.length - 1;
      } else {
        columns[columnIndex] = item.endMinutes;
      }
      groupLayout.push({
        ...item,
        columnIndex,
        columnCount: columns.length
      });
    });
    groupLayout.forEach((item) => {
      item.columnCount = columns.length;
      layout.push(item);
    });
  });
  return layout;
}
