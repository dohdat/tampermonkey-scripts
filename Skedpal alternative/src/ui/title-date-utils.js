import { parse as chronoParse } from "../../vendor/chrono-node/locales/en/index.js";
import { TWO } from "./constants.js";
import { parseLocalDateInput } from "./utils.js";

const TITLE_START_KEYWORDS = /\b(from|start|starting|begin|beginning|after)\s*$/i;
const TITLE_DEADLINE_KEYWORDS = /\b(by|due|until|before|deadline)\s*$/i;
const TITLE_KEYWORD_CLEANUP =
  /^(from|starting|start|beginning|begin|by|due|until|before|deadline)\b\s*/i;
const TITLE_KEYWORD_TRAIL_CLEANUP =
  /\s*\b(from|starting|start|beginning|begin|by|due|until|before|deadline)\b$/i;

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

function getChronoMatch(title, referenceDate) {
  const results = chronoParse(title, referenceDate, { forwardDate: true }) || [];
  if (!results.length) {return null;}
  const [result] = results;
  const matchText = result?.text || "";
  const matchIndex = Number.isFinite(result?.index)
    ? result.index
    : title.indexOf(matchText);
  return { result, matchText, matchIndex };
}

function buildCleanedTitle(title, matchText, matchIndex) {
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
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return { title: "", startFrom: null, deadline: null, hasDate: false };
  }
  const referenceDate = resolveReferenceDate(options);
  const match = getChronoMatch(title, referenceDate);
  if (!match) {
    return { title, startFrom: null, deadline: null, hasDate: false };
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
    hasDate: Boolean(startIso || endIso)
  };
}
