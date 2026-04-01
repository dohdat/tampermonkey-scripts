import {
  GROQ_BASE_URL,
  GROQ_MODEL,
  HTTP_STATUS_BAD_REQUEST,
  ONE,
  SETTINGS_TASK_ORGANIZATION_ESTIMATED_CHARS_PER_TOKEN,
  SETTINGS_TASK_ORGANIZATION_MAX_COMPLETION_TOKENS,
  SETTINGS_TASK_ORGANIZATION_REQUEST_TOKEN_BUDGET,
} from "./constants.js";
import { requestGroqWithRateLimitFallback } from "./groq-model-fallback.js";

function buildTaskOrganizationMessages(sectionCatalog, taskBatch) {
  return [
    {
      role: "system",
      content:
        "You review task placement across existing sections and subsections. Respond with a single JSON object only."
    },
    {
      role: "user",
      content: [
        "Review these active tasks and suggest only the ones that look misplaced.",
        "Rules:",
        '1. Use an existing section name from the catalog. Do not create new sections.',
        "2. If a section has any subsections, do not place a task directly on that section without a subsection.",
        "3. If a subsection is listed in headerSubsections, treat it like a container title and do not place tasks directly in it.",
        "4. Use an existing leaf subsection name when it fits.",
        '5. If a header subsection fits but none of its existing leaf children fit, set "createSubsection": true, provide a new subsectionName, and set "parentSubsectionName" to that existing header subsection.',
        '6. If no existing leaf subsection fits and no header subsection fits either, set "createSubsection": true and leave "parentSubsectionName" empty.',
        '7. Omit tasks that already look correctly placed.',
        '8. Keep reasons short and specific.',
        '9. If sectionCatalog.sparseLeafSubsections shows a leaf subsection with taskCount between 1 and 2, consider combining those tasks into a better existing leaf subsection (prefer siblings when possible).',
        '10. Only suggest sparse-leaf consolidation for subsection names that appear in sparseLeafSubsections, and use the provided taskCount exactly.',
        '11. When suggesting consolidation from sparse leaf subsections, you may mention a potential subsection rename in reason if it improves clarity.',
        '12. Do not use markdown or code fences.',
        'Return a single JSON object with this shape: {"reasoning":"optional short note","suggestions":[{"taskId":"id","sectionName":"Section","subsectionName":"Subsection or empty","parentSubsectionName":"Existing parent subsection or empty","createSubsection":true,"reason":"Why"}]}',
        `Section catalog: ${JSON.stringify(sectionCatalog)}`,
        `Tasks: ${JSON.stringify(taskBatch)}`
      ].join("\n")
    }
  ];
}

function buildTaskOrganizationRequestBody(sectionCatalog, taskBatch, model = GROQ_MODEL) {
  const messages = buildTaskOrganizationMessages(sectionCatalog, taskBatch);
  const estimatedPromptTokens = Math.ceil(
    JSON.stringify(messages).length / SETTINGS_TASK_ORGANIZATION_ESTIMATED_CHARS_PER_TOKEN
  );
  const availableCompletionTokens = SETTINGS_TASK_ORGANIZATION_REQUEST_TOKEN_BUDGET - estimatedPromptTokens;
  const maxCompletionTokens = Math.max(
    ONE,
    Math.min(SETTINGS_TASK_ORGANIZATION_MAX_COMPLETION_TOKENS, availableCompletionTokens)
  );
  return {
    model,
    messages,
    temperature: 0,
    max_completion_tokens: maxCompletionTokens,
    top_p: 1,
    stream: false,
    response_format: { type: "json_object" }
  };
}

async function requestTaskOrganizationCompletion(apiKey, requestBody) {
  const response = await fetch(GROQ_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let detail = "";
    let failedGeneration = "";
    let code = "";
    try {
      const errJson = await response.json();
      const errPayload = errJson?.error || errJson;
      detail = errPayload?.message || JSON.stringify(errJson);
      code = typeof errPayload?.code === "string" ? errPayload.code : "";
      failedGeneration = typeof errPayload?.failed_generation === "string"
        ? errPayload.failed_generation
        : "";
    } catch (_error) {
      detail = response.statusText;
    }
    const requestError = new Error(`HTTP ${response.status} ${detail}`);
    requestError.status = response.status;
    requestError.detail = detail;
    requestError.code = code;
    requestError.failedGeneration = failedGeneration;
    throw requestError;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

export async function requestTaskOrganizationBatch(apiKey, sectionCatalog, taskBatch) {
  return requestGroqWithRateLimitFallback(
    (model) => requestTaskOrganizationCompletion(
      apiKey,
      buildTaskOrganizationRequestBody(sectionCatalog, taskBatch, model)
    )
  );
}

export function isGroqJsonValidationError(error) {
  if (error?.status !== HTTP_STATUS_BAD_REQUEST) {return false;}
  const detail = typeof error?.detail === "string" ? error.detail.toLowerCase() : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  return code === "json_validate_failed" || detail.includes("failed to validate json");
}

export function isGroqRequestTooLargeError(error) {
  const detail = typeof error?.detail === "string" ? error.detail.toLowerCase() : "";
  return detail.includes("request too large") && detail.includes("tokens per minute");
}

function extractJsonCandidate(text) {
  if (!text) {return "";}
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {return "";}
  return candidate.slice(start, end + 1);
}

function buildSectionLookup(settings) {
  const lookup = new Map();
  const subsectionLookup = new Map();
  const subsectionCanonicalLookup = new Map();
  const headerSubsectionLookup = new Map();
  (settings?.sections || []).forEach((section) => {
    const name = section?.name?.trim() || "";
    if (!name) {return;}
    lookup.set(name.toLowerCase(), name);
    const subsectionList = settings?.subsections?.[section.id] || [];
    const canonicalSubsections = new Map();
    subsectionList.forEach((subsection) => {
      const subsectionName = subsection?.name?.trim() || "";
      if (!subsectionName) {return;}
      canonicalSubsections.set(subsectionName.toLowerCase(), subsectionName);
    });
    subsectionLookup.set(
      name.toLowerCase(),
      new Set(
        subsectionList
          .map((subsection) => subsection?.name?.trim()?.toLowerCase() || "")
          .filter(Boolean)
      )
    );
    subsectionCanonicalLookup.set(name.toLowerCase(), canonicalSubsections);
    headerSubsectionLookup.set(
      name.toLowerCase(),
      new Set(
        subsectionList
          .map((subsection) => subsection?.parentId || "")
          .filter(Boolean)
          .map((parentId) => subsectionList.find((subsection) => subsection.id === parentId)?.name?.trim()?.toLowerCase() || "")
          .filter(Boolean)
      )
    );
  });
  return { lookup, subsectionLookup, subsectionCanonicalLookup, headerSubsectionLookup };
}

function getSuggestedSectionName(entry, sectionLookup) {
  const nextSectionInput = typeof entry?.sectionName === "string" ? entry.sectionName.trim() : "";
  if (!nextSectionInput) {return "";}
  return sectionLookup.lookup.get(nextSectionInput.toLowerCase()) || "";
}

function getSuggestedSubsectionName(entry) {
  return typeof entry?.subsectionName === "string" ? entry.subsectionName.trim() : "";
}

function getSuggestedParentSubsectionName(entry, sectionLookup, nextSectionName) {
  const nextParentInput = typeof entry?.parentSubsectionName === "string"
    ? entry.parentSubsectionName.trim()
    : "";
  if (!nextParentInput) {return "";}
  const canonicalLookup = sectionLookup.subsectionCanonicalLookup.get(nextSectionName.toLowerCase());
  return canonicalLookup?.get(nextParentInput.toLowerCase()) || "";
}

function shouldCreateSuggestedSubsection(entry, sectionLookup, nextSectionName, nextSubsectionName) {
  const existingSubsections = sectionLookup.subsectionLookup.get(nextSectionName.toLowerCase());
  if (!nextSubsectionName) {return false;}
  if (entry?.createSubsection) {
    return !existingSubsections?.has(nextSubsectionName.toLowerCase());
  }
  if (!existingSubsections) {return false;}
  return !existingSubsections.has(nextSubsectionName.toLowerCase());
}

function sectionRequiresSubsection(sectionLookup, nextSectionName) {
  const existingSubsections = sectionLookup.subsectionLookup.get(nextSectionName.toLowerCase());
  return Boolean(existingSubsections?.size);
}

function subsectionIsHeader(sectionLookup, nextSectionName, nextSubsectionName) {
  if (!nextSubsectionName) {return false;}
  const headerSubsections = sectionLookup.headerSubsectionLookup.get(nextSectionName.toLowerCase());
  return Boolean(headerSubsections?.has(nextSubsectionName.toLowerCase()));
}

function isPlacementUnchanged(task, nextSectionName, nextSubsectionName, createSubsection) {
  return (
    task.currentSectionName === nextSectionName &&
    (task.currentSubsectionName || "") === (nextSubsectionName || "") &&
    !createSubsection
  );
}

function buildNormalizedSuggestion(task, taskId, nextSectionName, nextSubsectionName, createSubsection, reason) {
  return {
    taskId,
    taskTitle: task.title,
    currentSectionName: task.currentSectionName,
    currentSubsectionName: task.currentSubsectionName,
    suggestedSectionName: nextSectionName,
    suggestedSubsectionName: nextSubsectionName,
    suggestedParentSubsectionName: "",
    createSubsection,
    reason
  };
}

function normalizeTaskOrganizationSuggestion(entry, tasksById, sectionLookup) {
  const taskId = typeof entry?.taskId === "string" ? entry.taskId.trim() : "";
  const task = taskId ? tasksById.get(taskId) : null;
  if (!task) {return null;}
  const nextSectionName = getSuggestedSectionName(entry, sectionLookup);
  if (!nextSectionName) {return null;}
  const nextSubsectionName = getSuggestedSubsectionName(entry);
  const nextParentSubsectionName = getSuggestedParentSubsectionName(
    entry,
    sectionLookup,
    nextSectionName
  );
  const createSubsection = shouldCreateSuggestedSubsection(
    entry,
    sectionLookup,
    nextSectionName,
    nextSubsectionName
  );
  if (!nextSubsectionName && sectionRequiresSubsection(sectionLookup, nextSectionName)) {return null;}
  if (subsectionIsHeader(sectionLookup, nextSectionName, nextSubsectionName)) {return null;}
  if (isPlacementUnchanged(task, nextSectionName, nextSubsectionName, createSubsection)) {return null;}
  const reason = typeof entry?.reason === "string" ? entry.reason.trim() : "";
  const normalized = buildNormalizedSuggestion(
    task,
    taskId,
    nextSectionName,
    nextSubsectionName,
    createSubsection,
    reason
  );
  normalized.suggestedParentSubsectionName = nextParentSubsectionName;
  return normalized;
}

export function parseTaskOrganizationResponse(text, taskBatch, settings) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {return null;}
  const payload = JSON.parse(candidate);
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const tasksById = new Map((taskBatch || []).map((task) => [task.id, task]));
  const sectionLookup = buildSectionLookup(settings);
  const seen = new Set();
  return suggestions.reduce((list, entry) => {
    const normalized = normalizeTaskOrganizationSuggestion(entry, tasksById, sectionLookup);
    if (!normalized || seen.has(normalized.taskId)) {return list;}
    seen.add(normalized.taskId);
    list.push(normalized);
    return list;
  }, []);
}
