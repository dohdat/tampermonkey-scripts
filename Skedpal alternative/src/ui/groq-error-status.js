import {
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_UNAUTHORIZED
} from "./constants.js";

function normalizeGroqErrorDetail(error) {
  const detail = typeof error?.detail === "string" ? error.detail.trim() : "";
  return detail.replace(/\s+/g, " ").trim();
}

export function formatGroqErrorStatus(error, scopeLabel = "") {
  const scopeSuffix = scopeLabel ? ` for ${scopeLabel}` : "";
  const detail = normalizeGroqErrorDetail(error);
  const detailLower = detail.toLowerCase();
  const isRateLimit = error?.status === HTTP_STATUS_TOO_MANY_REQUESTS ||
    detailLower.includes("rate limit") ||
    detailLower.includes("too many requests");

  if (isRateLimit) {
    return `Groq request failed${scopeSuffix}: rate limit hit. Wait a moment and retry.`;
  }
  if (error?.status === HTTP_STATUS_UNAUTHORIZED) {
    return `Groq request failed${scopeSuffix}: API key rejected. Check your Groq key.`;
  }
  if (error?.status === HTTP_STATUS_FORBIDDEN) {
    return `Groq request failed${scopeSuffix}: access denied by Groq.`;
  }
  if (detail) {
    return `Groq request failed${scopeSuffix}: ${detail}`;
  }
  return `Groq request failed${scopeSuffix}. Check console for details.`;
}
