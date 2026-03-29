import {
  GROQ_MODEL,
  GROQ_RATE_LIMIT_FALLBACK_MODELS,
  HTTP_STATUS_TOO_MANY_REQUESTS
} from "./constants.js";

function normalizeGroqErrorDetail(error) {
  return typeof error?.detail === "string" ? error.detail.toLowerCase() : "";
}

export function isGroqRateLimitError(error) {
  if (error?.status === HTTP_STATUS_TOO_MANY_REQUESTS) {return true;}
  const detail = normalizeGroqErrorDetail(error);
  return detail.includes("rate limit") || detail.includes("too many requests");
}

export function buildGroqModelFallbackSequence(primaryModel = GROQ_MODEL) {
  return [primaryModel, ...GROQ_RATE_LIMIT_FALLBACK_MODELS].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index
  );
}

export async function requestGroqWithRateLimitFallback(execute, primaryModel = GROQ_MODEL) {
  const models = buildGroqModelFallbackSequence(primaryModel);
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      return await execute(model);
    } catch (error) {
      lastError = error;
      if (!isGroqRateLimitError(error) || index === models.length - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}
