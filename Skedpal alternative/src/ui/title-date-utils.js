import { parse as chronoParse } from "../../vendor/chrono-node/locales/en/index.js";
import {
  MS_PER_DAY,
  ONE,
  TITLE_REMINDER_PREFIX_REGEX,
  TITLE_REMINDER_REGEX
} from "./constants.js";
import { mergeReminderEntries } from "./tasks/task-reminders-helpers.js";
import { parseLocalDateInput } from "./utils.js";
import {
  BETWEEN_RANGE_REGEX,
  REPEAT_MONTHLY_RANGE_REGEX,
  REPEAT_YEARLY_RANGE_REGEX,
  TITLE_REPEAT_PATTERNS,
  cleanupParsedTitle,
  formatLocalDateInputValue,
  parseTitleRepeat
} from "./title-repeat-utils.js";

export { formatLocalDateInputValue };

const TITLE_START_KEYWORDS = /\b(from|start|starting|begin|beginning|after)\s*$/i;
const TITLE_DEADLINE_KEYWORDS = /\b(by|due|until|before|deadline)\s*$/i;
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLiteralRanges(title, literals) {
  if (!title || !Array.isArray(literals) || !literals.length) {return [];}
  const ranges = [];
  literals.forEach((literal) => {
    if (!literal) {return;}
    let index = title.indexOf(literal);
    while (index >= 0) {
      ranges.push({ start: index, end: index + literal.length });
      index = title.indexOf(literal, index + literal.length);
    }
  });
  return mergeRanges(ranges);
}

function doesRangeOverlap(range, ranges) {
  return ranges.some((entry) => range.start < entry.end && range.end > entry.start);
}

function appendBetweenRanges(title, ranges) {
  if (!REPEAT_YEARLY_RANGE_REGEX.test(title) && !REPEAT_MONTHLY_RANGE_REGEX.test(title)) {return;}
  const match = title.match(BETWEEN_RANGE_REGEX);
  if (!match?.[0]) {return;}
  const matchIndex = match.index ?? title.indexOf(match[0]);
  if (matchIndex < 0) {return;}
  ranges.push({ start: matchIndex, end: matchIndex + match[0].length });
}

function resolveReminderDayFromChrono(referenceDate, result) {
  const targetDate = result?.start?.date?.();
  if (!targetDate || Number.isNaN(targetDate.getTime())) {return null;}
  const baseDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const baseTime = baseDate.getTime();
  if (!Number.isFinite(baseTime)) {return null;}
  const diffDays = (targetDate.getTime() - baseTime) / MS_PER_DAY;
  if (!Number.isFinite(diffDays) || diffDays <= 0) {return null;}
  return Math.max(1, Math.ceil(diffDays));
}

function collectNumericReminderMatches(title) {
  const matches = [];
  if (!title) {return matches;}
  const matcher = new RegExp(TITLE_REMINDER_REGEX.source, "gi");
  let match = matcher.exec(title);
  while (match) {
    const matchText = match[0] || "";
    const dayValue = Number(match[1]);
    if (matchText && Number.isFinite(dayValue) && dayValue > 0) {
      matches.push({
        range: { start: match.index, end: match.index + matchText.length },
        dayValue
      });
    }
    match = matcher.exec(title);
  }
  return matches;
}

function collectChronoReminderMatches(title, referenceDate) {
  const matches = [];
  if (!title) {return matches;}
  const matcher = new RegExp(TITLE_REMINDER_PREFIX_REGEX.source, "gi");
  let match = matcher.exec(title);
  while (match) {
    const prefixText = match[0] || "";
    const startIndex = match.index ?? 0;
    const tailStart = startIndex + prefixText.length;
    const tail = title.slice(tailStart);
    const results = chronoParse(tail, referenceDate, { forwardDate: true }) || [];
    const [result] = results;
    const matchText = result?.text || "";
    if (!matchText) {
      match = matcher.exec(title);
      continue;
    }
    const reminderDays = resolveReminderDayFromChrono(referenceDate, result);
    if (!reminderDays) {
      match = matcher.exec(title);
      continue;
    }
    const resultIndex = Number.isFinite(result?.index)
      ? result.index
      : tail.indexOf(matchText);
    const endIndex = tailStart + Math.max(0, resultIndex) + matchText.length;
    matches.push({
      range: { start: startIndex, end: endIndex },
      dayValue: reminderDays
    });
    match = matcher.exec(title);
  }
  return matches;
}

function collectReminderMatches(title, referenceDate) {
  const numeric = collectNumericReminderMatches(title);
  if (!title) {return numeric;}
  const ranges = numeric.map((entry) => entry.range);
  const chronoMatches = collectChronoReminderMatches(title, referenceDate).filter(
    (entry) => !doesRangeOverlap(entry.range, ranges)
  );
  return [...numeric, ...chronoMatches];
}

function removeRangesFromTitle(title, ranges) {
  if (!title || !ranges.length) {return title;}
  const merged = mergeRanges(ranges);
  let cleaned = title;
  for (let i = merged.length - ONE; i >= 0; i -= 1) {
    const range = merged[i];
    cleaned = `${cleaned.slice(0, range.start)} ${cleaned.slice(range.end)}`;
  }
  const normalized = cleanupParsedTitle(cleaned);
  return normalized || title;
}

function parseTitleReminders(title, referenceDate) {
  if (!title) {return { title, reminderDays: [], hasReminder: false };}
  const matches = collectReminderMatches(title, referenceDate);
  if (!matches.length) {
    return { title, reminderDays: [], hasReminder: false };
  }
  const ranges = matches.map((entry) => entry.range);
  const reminderDays = [...new Set(matches.map((entry) => entry.dayValue))];
  return {
    title: removeRangesFromTitle(title, ranges),
    reminderDays,
    hasReminder: true
  };
}

export function getTitleConversionRanges(rawTitle, options = {}) {
  const title = typeof rawTitle === "string" ? rawTitle : "";
  if (!title) {return [];}
  const referenceDate = resolveReferenceDate(options);
  const literalRanges = findLiteralRanges(title, options.literals);
  const ranges = [];
  TITLE_REPEAT_PATTERNS.forEach((pattern) => {
    ranges.push(...collectRegexRanges(title, pattern));
  });
  collectReminderMatches(title, referenceDate).forEach((entry) => {
    ranges.push(entry.range);
  });
  appendBetweenRanges(title, ranges);
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
  const merged = mergeRanges(ranges);
  if (!literalRanges.length) {return merged;}
  return merged.filter((range) => !doesRangeOverlap(range, literalRanges));
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
    const rawMatchText = title.slice(range.start, range.end);
    const matchText = escapeHtml(rawMatchText);
    const attrText = escapeHtml(rawMatchText);
    parts.push(
      `<span class="rounded bg-lime-400/10 px-1 text-lime-300" data-test-skedpal="task-title-conversion-highlight" data-title-literal="${attrText}">${matchText}</span>`
    );
    cursor = range.end;
  });
  if (cursor < title.length) {
    parts.push(escapeHtml(title.slice(cursor)));
  }
  return { html: parts.join(""), hasRanges: true };
}

export function buildTitleConversionHighlightsHtml(rawTitle, options = {}) {
  const title = typeof rawTitle === "string" ? rawTitle : "";
  const ranges = getTitleConversionRanges(title, options);
  if (!ranges.length) {
    return { html: "", hasRanges: false };
  }
  const highlights = ranges.map((range) => {
    const rawMatchText = title.slice(range.start, range.end);
    const matchText = escapeHtml(rawMatchText);
    const attrText = escapeHtml(rawMatchText);
    return `<span class="rounded bg-lime-400/10 px-1 text-lime-300" data-test-skedpal="task-title-conversion-highlight" data-title-literal="${attrText}">${matchText}</span>`;
  });
  return { html: highlights.join(" "), hasRanges: true };
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

function applyLiteralTokens(title, literals) {
  if (!title || !Array.isArray(literals) || !literals.length) {
    return { tokenizedTitle: title, tokenMap: [] };
  }
  let tokenizedTitle = title;
  const tokenMap = [];
  literals.forEach((literal, index) => {
    if (!literal) {return;}
    const token = `__literal_${index}__`;
    const regex = new RegExp(escapeRegex(literal), "g");
    if (!regex.test(tokenizedTitle)) {return;}
    tokenizedTitle = tokenizedTitle.replace(regex, token);
    tokenMap.push({ token, literal });
  });
  return { tokenizedTitle, tokenMap };
}

function restoreLiteralTokens(title, tokenMap) {
  if (!title || !Array.isArray(tokenMap) || !tokenMap.length) {return title;}
  let restored = title;
  tokenMap.forEach(({ token, literal }) => {
    if (!token || !literal) {return;}
    const regex = new RegExp(escapeRegex(token), "g");
    restored = restored.replace(regex, literal);
  });
  return restored;
}

function normalizeParsedDateRange(startFrom, deadline) {
  if (!startFrom || !deadline) {
    return { startFrom, deadline };
  }
  const startDate = new Date(startFrom);
  const deadlineDate = new Date(deadline);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(deadlineDate.getTime())) {
    return { startFrom, deadline };
  }
  /* c8 ignore next 3 */
  if (startDate > deadlineDate) {
    return { startFrom: null, deadline };
  }
  return { startFrom, deadline };
}

export function resolveMergedDateRange({
  startFrom = null,
  deadline = null,
  startFromSource = "existing",
  deadlineSource = "existing"
} = {}) {
  if (!startFrom || !deadline) {
    return { startFrom, deadline };
  }
  const startDate = new Date(startFrom);
  const deadlineDate = new Date(deadline);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(deadlineDate.getTime())) {
    return { startFrom, deadline };
  }
  if (startDate <= deadlineDate) {
    return { startFrom, deadline };
  }
  if (startFromSource === "parsed" && deadlineSource !== "parsed") {
    return { startFrom, deadline: null };
  }
  if (deadlineSource === "parsed" && startFromSource !== "parsed") {
    return { startFrom: null, deadline };
  }
  return { startFrom: null, deadline };
}

function clampTitleLength(value, maxLength) {
  const lengthLimit = Number.isFinite(maxLength) ? maxLength : Infinity;
  return (value || "").trim().slice(0, lengthLimit);
}

function buildTitleUpdateWithoutParsing(task, nextTitle, originalTitle) {
  const shouldSave = nextTitle !== originalTitle;
  return {
    shouldSave,
    nextTitle,
    nextDeadline: task.deadline,
    nextStartFrom: task.startFrom,
    nextRepeat: task.repeat,
    nextReminders: Array.isArray(task.reminders) ? task.reminders : []
  };
}

function resolveParsedDateUpdate(task, parsed, originalTitle, literals) {
  const originalParsed = parseTitleDates(originalTitle, { literals });
  if (originalParsed.hasDate && !parsed.hasDate) {
    return { startFrom: null, deadline: null };
  }
  return resolveMergedDateRange({
    startFrom: parsed.startFrom ?? task.startFrom,
    deadline: parsed.deadline ?? task.deadline,
    startFromSource: parsed.startFrom ? "parsed" : "existing",
    deadlineSource: parsed.deadline ? "parsed" : "existing"
  });
}

function resolveParsedReminderUpdate(task, parsed) {
  const reminderDays = parsed.reminderDays || [];
  if (!reminderDays.length) {
    return {
      reminders: Array.isArray(task.reminders) ? task.reminders : [],
      added: false
    };
  }
  return mergeReminderEntries(task.reminders || [], reminderDays);
}

function shouldSaveTitleUpdate({
  safeTitle,
  originalTitle,
  nextDeadline,
  nextStartFrom,
  nextRepeat,
  task,
  remindersAdded
}) {
  return (
    safeTitle !== originalTitle ||
    nextDeadline !== task.deadline ||
    nextStartFrom !== task.startFrom ||
    nextRepeat !== task.repeat ||
    remindersAdded
  );
}

function buildTitleUpdateWithParsing({
  task,
  inputValue,
  originalTitle,
  literals,
  maxLength,
  fallbackTitle
}) {
  const parsed = parseTitleDates(inputValue, { literals });
  const parsedTitle = clampTitleLength(parsed.title, maxLength);
  const safeTitle = parsedTitle || fallbackTitle;
  const resolvedDates = resolveParsedDateUpdate(task, parsed, originalTitle, literals);
  const nextDeadline = resolvedDates.deadline;
  const nextStartFrom = resolvedDates.startFrom;
  const nextRepeat = parsed.repeat ?? task.repeat;
  const remindersResult = resolveParsedReminderUpdate(task, parsed);
  const nextReminders = remindersResult.reminders;
  const shouldSave = shouldSaveTitleUpdate({
    safeTitle,
    originalTitle,
    nextDeadline,
    nextStartFrom,
    nextRepeat,
    task,
    remindersAdded: remindersResult.added
  });
  return {
    shouldSave,
    nextTitle: safeTitle,
    nextDeadline,
    nextStartFrom,
    nextRepeat,
    nextReminders
  };
}

export function buildTitleUpdateFromInput({
  task,
  inputValue,
  originalTitle,
  parsingActive,
  literals,
  maxLength
}) {
  const nextTitle = clampTitleLength(inputValue, maxLength);
  if (!nextTitle) {
    return { shouldSave: false, nextTitle: originalTitle };
  }
  if (!parsingActive) {
    return buildTitleUpdateWithoutParsing(task, nextTitle, originalTitle);
  }
  return buildTitleUpdateWithParsing({
    task,
    inputValue,
    originalTitle,
    literals,
    maxLength,
    fallbackTitle: nextTitle
  });
}

export function parseTitleLiteralList(value) {
  if (!value) {return [];}
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function serializeTitleLiteralList(list) {
  return JSON.stringify(Array.isArray(list) ? list.filter(Boolean) : []);
}

export function pruneTitleLiteralList(title, list) {
  if (!title || !Array.isArray(list)) {return [];}
  return list.filter((literal) => literal && title.includes(literal));
}

function buildTitleParseResult({
  title,
  tokenMap,
  repeatParsed,
  startFrom,
  deadline,
  hasDate,
  reminderDays,
  hasReminder
}) {
  return {
    title: restoreLiteralTokens(title, tokenMap),
    startFrom: startFrom ?? null,
    deadline: deadline ?? null,
    hasDate: Boolean(hasDate),
    reminderDays: Array.isArray(reminderDays) ? reminderDays : [],
    hasReminder: Boolean(hasReminder),
    repeat: repeatParsed.repeat,
    hasRepeat: repeatParsed.hasRepeat
  };
}

function resolveChronoMatchDates(title, match) {
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
  const normalized = normalizeParsedDateRange(startFrom, deadline);
  return {
    startFrom: normalized.startFrom,
    deadline: normalized.deadline,
    hasDate: Boolean(startIso || endIso)
  };
}

export function parseTitleDates(rawTitle, options = {}) {
  const baseTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const literals = Array.isArray(options.literals) ? options.literals : [];
  const referenceDate = resolveReferenceDate(options);
  const { tokenizedTitle, tokenMap } = applyLiteralTokens(baseTitle, literals);
  const repeatParsed = parseTitleRepeat(tokenizedTitle, referenceDate);
  const reminderParsed = parseTitleReminders(repeatParsed.title || "", referenceDate);
  const title = reminderParsed.title || "";
  if (!title) {
    return buildTitleParseResult({
      title: "",
      tokenMap,
      repeatParsed,
      startFrom: null,
      deadline: null,
      hasDate: false,
      reminderDays: reminderParsed.reminderDays,
      hasReminder: reminderParsed.hasReminder
    });
  }
  const match = getChronoMatch(title, referenceDate);
  if (!match) {
    return buildTitleParseResult({
      title,
      tokenMap,
      repeatParsed,
      startFrom: null,
      deadline: null,
      hasDate: false,
      reminderDays: reminderParsed.reminderDays,
      hasReminder: reminderParsed.hasReminder
    });
  }
  const cleanedTitle = buildCleanedTitle(title, match.matchText, match.matchIndex);
  const resolved = resolveChronoMatchDates(title, match);
  return buildTitleParseResult({
    title: cleanedTitle,
    tokenMap,
    repeatParsed,
    startFrom: resolved.startFrom,
    deadline: resolved.deadline,
    hasDate: resolved.hasDate,
    reminderDays: reminderParsed.reminderDays,
    hasReminder: reminderParsed.hasReminder
  });
}
