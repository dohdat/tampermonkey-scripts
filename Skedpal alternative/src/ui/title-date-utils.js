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
  /\b(?:repeat\s+)?every\s+((?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*(?:,|and)\s*(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))*)\b/i;
const REPEAT_WEEKDAY_REGEX = /\b(?:repeat\s+)?every\s+(\d+)?\s*(weekday|weekend)s?\b/i;
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

function parseRepeatFromDayList(title, referenceDate) {
  const listMatch = title.match(REPEAT_DAYLIST_REGEX);
  if (!listMatch) {return null;}
  const days = parseWeekdayList(listMatch[1]);
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

function findKeywordPrefixRange(title, matchIndex) {
  if (!title || !Number.isFinite(matchIndex) || matchIndex <= 0) {return null;}
  const before = title.slice(0, matchIndex);
  const regex =
    /(?:^|\s)(from|starting|start|beginning|begin|after|by|due|until|before|deadline)\s*$/gi;
  let match = regex.exec(before);
  let lastMatch = null;
  while (match) {
    lastMatch = match;
    match = regex.exec(before);
  }
  if (!lastMatch) {return null;}
  const matchText = lastMatch[0] || "";
  if (!matchText.trim()) {return null;}
  const start = before.length - matchText.length;
  return { start, end: matchIndex };
}

function collectRegexRanges(text, regex) {
  if (!text) {return [];}
  const matcher = new RegExp(regex.source, "gi");
  const ranges = [];
  let match = matcher.exec(text);
  while (match) {
    const matchText = match[0] || "";
    if (matchText) {
      ranges.push({ start: match.index, end: match.index + matchText.length });
    }
    match = matcher.exec(text);
  }
  return ranges;
}

function mergeRanges(ranges) {
  if (!ranges.length) {return [];}
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = ONE; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - ONE];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function getTitleConversionRanges(rawTitle, options = {}) {
  const title = typeof rawTitle === "string" ? rawTitle : "";
  if (!title) {return [];}
  const referenceDate = resolveReferenceDate(options);
  const ranges = [];
  [
    REPEAT_DAYLIST_REGEX,
    REPEAT_WEEKDAY_REGEX,
    REPEAT_INTERVAL_REGEX,
    REPEAT_INTERVAL_WEEK_REGEX,
    REPEAT_DAYLIST_ON_REGEX,
    REPEAT_ALL_DAYS_REGEX,
    REPEAT_SIMPLE_REGEX
  ].forEach((pattern) => {
    ranges.push(...collectRegexRanges(title, pattern));
  });
  const chronoMatch = getChronoMatch(title, referenceDate);
  if (chronoMatch?.matchText) {
    const index = chronoMatch.matchIndex;
    if (Number.isFinite(index) && index >= 0) {
      ranges.push({ start: index, end: index + chronoMatch.matchText.length });
      const prefixRange = findKeywordPrefixRange(title, index);
      if (prefixRange) {
        ranges.push(prefixRange);
      }
    }
  }
  return mergeRanges(ranges);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildTitleConversionPreviewHtml(rawTitle, options = {}) {
  const title = typeof rawTitle === "string" ? rawTitle : "";
  const ranges = getTitleConversionRanges(title, options);
  if (!ranges.length) {
    return { html: "", hasRanges: false };
  }
  const parts = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (cursor < range.start) {
      parts.push(escapeHtml(title.slice(cursor, range.start)));
    }
    const matchText = escapeHtml(title.slice(range.start, range.end));
    parts.push(
      `<span class="rounded bg-lime-400/10 px-1 text-lime-300" data-test-skedpal="task-title-conversion-highlight">${matchText}</span>`
    );
    cursor = range.end;
  });
  if (cursor < title.length) {
    parts.push(escapeHtml(title.slice(cursor)));
  }
  return { html: parts.join(""), hasRanges: true };
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
