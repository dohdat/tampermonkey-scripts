import { parse as chronoParse } from "../../vendor/chrono-node/locales/en/index.js";
import { TWO, THREE, FOUR, FIVE, SIX } from "./constants.js";
import { parseLocalDateInput } from "./utils.js";

const ZERO = 0;
const ONE = 1;
const TITLE_START_KEYWORDS = /\b(from|start|starting|begin|beginning|after)\s*$/i;
const TITLE_DEADLINE_KEYWORDS = /\b(by|due|until|before|deadline)\s*$/i;
const TITLE_KEYWORD_CLEANUP =
  /^(from|starting|start|beginning|begin|by|due|until|before|deadline)\b\s*/i;
const TITLE_KEYWORD_TRAIL_CLEANUP =
  /\s*\b(from|starting|start|beginning|begin|by|due|until|before|deadline)\b$/i;
const REPEAT_DAYLIST_REGEX =
  /\bevery\s+((?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*(?:,|and)\s*(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))*)\b/i;
const REPEAT_WEEKDAY_REGEX = /\bevery\s+(\d+)?\s*(weekday|weekend)s?\b/i;
const REPEAT_INTERVAL_REGEX = /\bevery\s+(\d+|other)?\s*(day|week|month|year)s?\b/i;
const REPEAT_SIMPLE_REGEX = /\b(daily|weekly|monthly|yearly)\b/i;
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

export function formatLocalDateInputValue(date) {
  if (!date || Number.isNaN(date.getTime?.())) {return "";}
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(TWO, "0");
  const day = `${date.getDate()}`.padStart(TWO, "0");
  return `${year}-${month}-${day}`;
}

function cleanupParsedTitle(title) {
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

function resolveTitleDateIntent(rawTitle, matchIndex, matchText) {
  if (!rawTitle || !matchText || !Number.isFinite(matchIndex)) {return "deadline";}
  const before = rawTitle.slice(0, matchIndex).toLowerCase();
  if (TITLE_START_KEYWORDS.test(before)) {return "start";}
  if (TITLE_DEADLINE_KEYWORDS.test(before)) {return "deadline";}
  return "deadline";
}

function resolveReferenceDate(options) {
  return options?.referenceDate instanceof Date ? options.referenceDate : new Date();
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

function buildRepeatFromUnit(unit, interval, referenceDate) {
  const base = buildRepeatBase(referenceDate);
  return {
    ...base,
    unit,
    interval: Math.max(ONE, Number(interval) || ONE)
  };
}

function parseRepeatFromDayList(title, referenceDate) {
  const match = title.match(REPEAT_DAYLIST_REGEX);
  if (!match) {return null;}
  const days = parseWeekdayList(match[1]);
  if (!days.length) {return null;}
  return {
    repeat: { ...buildRepeatFromUnit("week", ONE, referenceDate), weeklyDays: days },
    title: removeMatchedPhrase(title, match)
  };
}

function parseRepeatFromWeekGroup(title, referenceDate) {
  const match = title.match(REPEAT_WEEKDAY_REGEX);
  if (!match) {return null;}
  const interval = Number(match[1]) || ONE;
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
  const unit = match[2]?.toLowerCase() || "week";
  const interval = rawInterval === "other" ? TWO : Number(rawInterval) || ONE;
  return {
    repeat: buildRepeatFromUnit(unit, interval, referenceDate),
    title: removeMatchedPhrase(title, match)
  };
}

function parseRepeatFromSimple(title, referenceDate) {
  const match = title.match(REPEAT_SIMPLE_REGEX);
  if (!match) {return null;}
  const word = match[1]?.toLowerCase() || "weekly";
  const unitMap = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
  const unit = unitMap[word] || "week";
  return {
    repeat: buildRepeatFromUnit(unit, ONE, referenceDate),
    title: removeMatchedPhrase(title, match)
  };
}

function parseTitleRepeat(rawTitle, referenceDate) {
  if (!rawTitle) {
    return { title: "", repeat: null, hasRepeat: false };
  }
  const handlers = [
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

function getChronoMatch(title, referenceDate) {
  const results = chronoParse(title, referenceDate, { forwardDate: true }) || [];
  if (!results.length) {return null;}
  const [result] = results;
  const matchText = result?.text || "";
  /* c8 ignore next 3 */
  const matchIndex = Number.isFinite(result?.index)
    ? result.index
    : title.indexOf(matchText);
  return { result, matchText, matchIndex };
}

function buildCleanedTitle(title, matchText, matchIndex) {
  /* c8 ignore next */
  if (!matchText || matchIndex < 0) {return title;}
  const cleaned = `${title.slice(0, matchIndex)} ${title.slice(matchIndex + matchText.length)}`;
  const normalized = cleanupParsedTitle(cleaned);
  return normalized || title;
}

function buildParsedIsoDates(result) {
  const startDate = result?.start?.date?.() || null;
  const endDate = result?.end?.date?.() || null;
  const startIso = parseLocalDateInput(formatLocalDateInputValue(startDate));
  const endIso = parseLocalDateInput(formatLocalDateInputValue(endDate));
  return { startIso, endIso };
}

export function parseTitleDates(rawTitle, options = {}) {
  const baseTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const referenceDate = resolveReferenceDate(options);
  const repeatParsed = parseTitleRepeat(baseTitle, referenceDate);
  const title = repeatParsed.title || "";
  if (!title) {
    return {
      title: "",
      startFrom: null,
      deadline: null,
      hasDate: false,
      repeat: repeatParsed.repeat,
      hasRepeat: repeatParsed.hasRepeat
    };
  }
  const match = getChronoMatch(title, referenceDate);
  if (!match) {
    return {
      title,
      startFrom: null,
      deadline: null,
      hasDate: false,
      repeat: repeatParsed.repeat,
      hasRepeat: repeatParsed.hasRepeat
    };
  }
  const cleanedTitle = buildCleanedTitle(title, match.matchText, match.matchIndex);
  const { startIso, endIso } = buildParsedIsoDates(match.result);
  let startFrom = null;
  let deadline = null;
  if (startIso && endIso) {
    startFrom = startIso;
    deadline = endIso;
  } else if (startIso) {
    const intent = resolveTitleDateIntent(title, match.matchIndex, match.matchText);
    if (intent === "start") {
      startFrom = startIso;
    } else {
      deadline = startIso;
    }
  }
  return {
    title: cleanedTitle,
    startFrom,
    deadline,
    hasDate: Boolean(startIso || endIso),
    repeat: repeatParsed.repeat,
    hasRepeat: repeatParsed.hasRepeat
  };
}
