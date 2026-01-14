import { parse as chronoParse } from "../../vendor/chrono-node/locales/en/index.js";
import { FIVE, FOUR, ONE, SIX, THREE, TWO, ZERO } from "./constants.js";
const TITLE_KEYWORD_CLEANUP =
  /^(from|starting|start|beginning|begin|by|due|until|before|deadline)\b\s*/i;
const TITLE_KEYWORD_TRAIL_CLEANUP =
  /\s*\b(from|starting|start|beginning|begin|by|due|until|before|deadline)\b$/i;
const REPEAT_DAYLIST_REGEX =
  /\b(?:repeat\s+)?every\s+((?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*(?:,|and)\s*(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))*)\b/i;
const REPEAT_WEEKDAY_REGEX = /\b(?:repeat\s+)?every\s+(\d+)?\s*(weekday|weekend)s?\b/i;
export const REPEAT_YEARLY_RANGE_REGEX =
  /\b(?:repeat\s+)?(?:every\s+(\d+|other)?\s*years?|yearly)\s+between\s+/i;
export const BETWEEN_RANGE_REGEX =
  /\bbetween\s+[^]+?\s+(?:and|to)\s+[^]+?(?=$|[,.])/i;
const REPEAT_INTERVAL_REGEX = /\b(?:repeat\s+)?every\s+(\d+|other)?\s*(day|week|month|year)s?\b/i;
const REPEAT_INTERVAL_WEEK_REGEX = /\b(?:repeat\s+)?every\s+(\d+|other)\s*weeks?\b/i;
const REPEAT_DAYLIST_ON_REGEX =
  /\bon\s+((?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*(?:,|and)\s*(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))*)\b/i;
const REPEAT_ALL_DAYS_REGEX = /\b(any\s*day|every\s*day|everyday|all\s*days)\b/i;
const REPEAT_SIMPLE_REGEX = /\b(?:repeat\s+)?(daily|weekly|monthly|yearly)\b/i;
const REPEAT_LIST_SPLIT_REGEX = /\s*(?:,|and)\s*/i;
const WEEKDAY_ALIASES = new Map([
  ["sun", ZERO],
  ["sunday", ZERO],
  ["mon", ONE],
  ["monday", ONE],
  ["tue", TWO],
  ["tues", TWO],
  ["tuesday", TWO],
  ["wed", THREE],
  ["weds", THREE],
  ["wednesday", THREE],
  ["thu", FOUR],
  ["thur", FOUR],
  ["thurs", FOUR],
  ["thursday", FOUR],
  ["fri", FIVE],
  ["friday", FIVE],
  ["sat", SIX],
  ["saturday", SIX]
]);

export const TITLE_REPEAT_PATTERNS = [
  REPEAT_DAYLIST_REGEX,
  REPEAT_WEEKDAY_REGEX,
  REPEAT_YEARLY_RANGE_REGEX,
  REPEAT_INTERVAL_REGEX,
  REPEAT_INTERVAL_WEEK_REGEX,
  REPEAT_DAYLIST_ON_REGEX,
  REPEAT_ALL_DAYS_REGEX,
  REPEAT_SIMPLE_REGEX
];

export function formatLocalDateInputValue(date) {
  if (!date || Number.isNaN(date.getTime?.())) {return "";}
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(TWO, "0");
  const day = `${date.getDate()}`.padStart(TWO, "0");
  return `${year}-${month}-${day}`;
}

export function cleanupParsedTitle(title) {
  let cleaned = title.replace(/\s{2,}/g, " ").trim();
  cleaned = cleaned.replace(/^[,;:.-]+\s*/g, "");
  cleaned = cleaned.replace(/\s*[,;:.-]+$/g, "");
  cleaned = cleaned.replace(/\(\s*\)/g, "");
  cleaned = cleaned.replace(/\[\s*\]/g, "");
  cleaned = cleaned.replace(TITLE_KEYWORD_CLEANUP, "");
  cleaned = cleaned.replace(TITLE_KEYWORD_TRAIL_CLEANUP, "");
  return cleaned.trim();
}

function cleanupRepeatTitle(title) {
  return cleanupParsedTitle(title);
}

function buildRepeatBase(referenceDate) {
  const baseDate = referenceDate instanceof Date ? referenceDate : new Date();
  return {
    type: "custom",
    interval: ONE,
    unit: "week",
    weeklyDays: [baseDate.getDay()],
    weeklyMode: "any",
    monthlyMode: "day",
    monthlyDay: baseDate.getDate(),
    yearlyMonth: baseDate.getMonth() + ONE,
    yearlyDay: baseDate.getDate(),
    end: { type: "never", date: "", count: ONE }
  };
}

function normalizeWeekdayToken(token) {
  return (token || "").toLowerCase().trim();
}

function resolveWeekdayValue(token) {
  return WEEKDAY_ALIASES.get(normalizeWeekdayToken(token));
}

function parseWeekdayList(text) {
  const values = new Set();
  if (!text) {return [];}
  text.split(REPEAT_LIST_SPLIT_REGEX).forEach((token) => {
    const value = resolveWeekdayValue(token);
    if (Number.isFinite(value)) {
      values.add(value);
    }
  });
  return Array.from(values);
}

function removeMatchedPhrase(title, match) {
  if (!match) {return title;}
  const matchText = match[0] || "";
  const matchIndex = match.index ?? title.indexOf(matchText);
  if (!matchText || matchIndex < 0) {return title;}
  return `${title.slice(0, matchIndex)} ${title.slice(matchIndex + matchText.length)}`;
}

function resolveIntervalToken(value) {
  const raw = (value || "").toLowerCase();
  if (raw === "other") {return TWO;}
  return Number(raw) || ONE;
}

function findWeekIntervalMatch(title) {
  if (!title) {return null;}
  return title.match(REPEAT_INTERVAL_WEEK_REGEX);
}

function buildRepeatFromUnit(unit, interval, referenceDate) {
  const base = buildRepeatBase(referenceDate);
  return {
    ...base,
    unit,
    interval: Math.max(ONE, Number(interval) || ONE)
  };
}

function getChronoResults(text, referenceDate) {
  return chronoParse(text, referenceDate, { forwardDate: true }) || [];
}

function extractChronoRange(result, text) {
  if (!result) {return null;}
  const startDate = result?.start?.date?.();
  const endDate = result?.end?.date?.();
  if (!startDate || !endDate) {return null;}
  const rangeStart = formatLocalDateInputValue(startDate);
  const rangeEnd = formatLocalDateInputValue(endDate);
  if (!rangeStart || !rangeEnd) {return null;}
  const resultText = result?.text || "";
  const resultIndex = Number.isFinite(result?.index)
    ? result.index
    : text.indexOf(resultText);
  if (resultIndex < 0 || !resultText) {return null;}
  return { rangeStart, rangeEnd, resultIndex, resultText };
}

function extractSplitChronoRange(startResult, endResult, text) {
  const startDate = startResult?.start?.date?.();
  const endDate = endResult?.start?.date?.();
  if (!startDate || !endDate) {return null;}
  const rangeStart = formatLocalDateInputValue(startDate);
  const rangeEnd = formatLocalDateInputValue(endDate);
  if (!rangeStart || !rangeEnd) {return null;}
  const endText = endResult?.text || "";
  const endIndex = Number.isFinite(endResult?.index)
    ? endResult.index
    : text.indexOf(endText);
  if (endIndex < 0 || !endText) {return null;}
  return {
    rangeStart,
    rangeEnd,
    resultIndex: ZERO,
    resultText: text.slice(0, endIndex + endText.length)
  };
}

function extractChronoRangeFromResults(results, text) {
  if (!results.length) {return null;}
  const direct = extractChronoRange(results[0], text);
  if (direct) {return direct;}
  if (results.length < TWO) {return null;}
  return extractSplitChronoRange(results[0], results[1], text);
}

function getChronoRangeParts(text, referenceDate) {
  const results = getChronoResults(text, referenceDate);
  return extractChronoRangeFromResults(results, text);
}

function findBetweenClause(text) {
  /* c8 ignore next */
  if (!text) {return null;}
  const match = text.match(/\bbetween\s+[^]+?\s+(?:and|to)\s+[^]+?(?=$|[,.])/i);
  if (!match) {return null;}
  const matchText = match[0] || "";
  /* c8 ignore next */
  const matchIndex = match.index ?? text.indexOf(matchText);
  /* c8 ignore next */
  if (!matchText || matchIndex < 0) {return null;}
  return { text: matchText, index: matchIndex };
}

function removeChronoRange(title, matchIndex, rangeParts) {
  const removalStart = matchIndex;
  const removalEnd = matchIndex + rangeParts.resultIndex + rangeParts.resultText.length;
  return `${title.slice(0, removalStart)} ${title.slice(removalEnd)}`;
}

function parseRepeatFromYearlyRange(title, referenceDate) {
  const match = title.match(REPEAT_YEARLY_RANGE_REGEX);
  if (!match) {return null;}
  const matchText = match[0] || "";
  /* c8 ignore next */
  const matchIndex = match.index ?? title.indexOf(matchText);
  /* c8 ignore next */
  if (!matchText || matchIndex < 0) {return null;}
  const interval = resolveIntervalToken(match[1]);
  const tail = title.slice(matchIndex);
  const betweenClause = findBetweenClause(tail);
  const rangeSource = betweenClause ? betweenClause.text : tail;
  const rangeParts = getChronoRangeParts(rangeSource, referenceDate);
  /* c8 ignore next */
  if (!rangeParts) {return null;}
  const cleanedTitle = betweenClause
    ? `${title.slice(0, matchIndex)} ${title.slice(matchIndex + betweenClause.index + betweenClause.text.length)}`
    : removeChronoRange(title, matchIndex, rangeParts);
  return {
    repeat: {
      ...buildRepeatFromUnit("year", interval, referenceDate),
      yearlyRangeStartDate: rangeParts.rangeStart,
      yearlyRangeEndDate: rangeParts.rangeEnd
    },
    title: cleanedTitle
  };
}

function parseRepeatFromDayList(title, referenceDate) {
  const listMatch = title.match(REPEAT_DAYLIST_REGEX);
  if (!listMatch) {return null;}
  const days = parseWeekdayList(listMatch[1]);
  /* c8 ignore next */
  if (!days.length) {return null;}
  let cleanedTitle = removeMatchedPhrase(title, listMatch);
  const intervalMatch = findWeekIntervalMatch(cleanedTitle);
  const interval = intervalMatch ? resolveIntervalToken(intervalMatch[1]) : ONE;
  if (intervalMatch) {
    cleanedTitle = removeMatchedPhrase(cleanedTitle, intervalMatch);
  }
  return {
    repeat: { ...buildRepeatFromUnit("week", interval, referenceDate), weeklyDays: days },
    title: cleanedTitle
  };
}

function parseRepeatFromWeekGroup(title, referenceDate) {
  const match = title.match(REPEAT_WEEKDAY_REGEX);
  if (!match) {return null;}
  const interval = Number(match[1]) || ONE;
  /* c8 ignore next */
  const group = (match[2] || "").toLowerCase();
  const weekdays = group === "weekday" ? [ONE, TWO, THREE, FOUR, FIVE] : [ZERO, SIX];
  return {
    repeat: { ...buildRepeatFromUnit("week", interval, referenceDate), weeklyDays: weekdays },
    title: removeMatchedPhrase(title, match)
  };
}

function parseRepeatFromInterval(title, referenceDate) {
  const match = title.match(REPEAT_INTERVAL_REGEX);
  if (!match) {return null;}
  const rawInterval = (match[1] || "").toLowerCase();
  /* c8 ignore next */
  const unit = match[2]?.toLowerCase() || "week";
  const interval = resolveIntervalToken(rawInterval);
  let cleanedTitle = removeMatchedPhrase(title, match);
  let weeklyDays = null;
  if (unit === "week") {
    const allDaysMatch = cleanedTitle.match(REPEAT_ALL_DAYS_REGEX);
    if (allDaysMatch) {
      weeklyDays = [ZERO, ONE, TWO, THREE, FOUR, FIVE, SIX];
      cleanedTitle = removeMatchedPhrase(cleanedTitle, allDaysMatch);
    }
    const onMatch = cleanedTitle.match(REPEAT_DAYLIST_ON_REGEX);
    if (onMatch) {
      const days = parseWeekdayList(onMatch[1]);
      if (days.length) {
        weeklyDays = days;
        cleanedTitle = removeMatchedPhrase(cleanedTitle, onMatch);
      }
    }
  }
  const repeat = buildRepeatFromUnit(unit, interval, referenceDate);
  if (weeklyDays) {
    repeat.weeklyDays = weeklyDays;
  }
  return {
    repeat,
    title: cleanedTitle
  };
}

function parseRepeatFromSimple(title, referenceDate) {
  const match = title.match(REPEAT_SIMPLE_REGEX);
  if (!match) {return null;}
  /* c8 ignore next */
  const word = match[1]?.toLowerCase() || "weekly";
  const unitMap = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
  /* c8 ignore next */
  const unit = unitMap[word] || "week";
  return {
    repeat: buildRepeatFromUnit(unit, ONE, referenceDate),
    title: removeMatchedPhrase(title, match)
  };
}

export function parseTitleRepeat(rawTitle, referenceDate) {
  if (!rawTitle) {
    return { title: "", repeat: null, hasRepeat: false };
  }
  const handlers = [
    parseRepeatFromYearlyRange,
    parseRepeatFromDayList,
    parseRepeatFromWeekGroup,
    parseRepeatFromInterval,
    parseRepeatFromSimple
  ];
  for (const handler of handlers) {
    const parsed = handler(rawTitle, referenceDate);
    if (parsed) {
      const cleanedTitle = cleanupRepeatTitle(parsed.title);
      return {
        title: cleanedTitle || rawTitle,
        repeat: parsed.repeat,
        hasRepeat: true
      };
    }
  }
  return { title: rawTitle, repeat: null, hasRepeat: false };
}
