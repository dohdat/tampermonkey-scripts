import { getAllTasks, saveSettings } from "../data/db.js";
import {
  GROQ_BASE_URL,
  GROQ_MODEL,
  HTTP_STATUS_BAD_REQUEST,
  SETTINGS_TASK_ORGANIZATION_BATCH_SIZE,
  SETTINGS_TASK_ORGANIZATION_LOADING_LABEL,
  SETTINGS_TASK_ORGANIZATION_MAX_COMPLETION_TOKENS,
  TWO
} from "./constants.js";
import { formatGroqErrorStatus } from "./groq-error-status.js";
import {
  getTaskOrganizationCachedReview,
  storeTaskOrganizationBatchCache
} from "./task-organization-review-cache.js";
import { state } from "./state/page-state.js";
import { getSubsectionDescendantIds } from "./utils.js";
import {
  clearOutput,
  clearTaskOrganizationState,
  closeTaskOrganizationModal,
  getUiTargets,
  handleTaskOrganizationModalClick,
  openTaskOrganizationModal,
  renderRawResponse,
  renderSuggestions,
  renderTaskOrganizationModalState,
  resetTaskOrganizationScopePanel,
  setStatus,
  storeTaskOrganizationSuggestions
} from "./task-organization-modal.js";

function getGroqApiKey() {
  return (state.settingsCache?.groqApiKey || "").trim();
}

async function persistGroqApiKey(apiKey) {
  state.settingsCache = { ...state.settingsCache, groqApiKey: apiKey };
  state.pendingSettingsSave = saveSettings(state.settingsCache);
  await Promise.allSettled([state.pendingSettingsSave]);
}

async function ensureGroqApiKey() {
  let apiKey = getGroqApiKey();
  if (apiKey) {return apiKey;}
  const entry = window.prompt("Enter your Groq API key:");
  if (!entry) {return "";}
  apiKey = entry.trim();
  if (!apiKey) {return "";}
  await persistGroqApiKey(apiKey);
  return apiKey;
}

function isDeletedTask(task) {
  return ["deleted", "isDeleted", "deletedAt", "deletedOn"].some((key) => Boolean(task?.[key]));
}

function resolveSectionName(sectionId, settings) {
  const section = (settings?.sections || []).find((entry) => entry.id === sectionId);
  if (section?.name) {return section.name;}
  return "";
}

function resolveSubsectionName(sectionId, subsectionId, settings) {
  if (!sectionId || !subsectionId) {return "";}
  const list = settings?.subsections?.[sectionId] || [];
  const match = list.find((entry) => entry.id === subsectionId);
  return match?.name || "";
}

export function buildTaskOrganizationReviewItems(tasks = [], settings = state.settingsCache) {
  return (tasks || [])
    .filter((task) => Boolean(task?.id && task?.title?.trim()))
    .filter((task) => ![task.completed, isDeletedTask(task), task.subtaskParentId].some(Boolean))
    .map((task) => ({
      id: task.id,
      title: task.title.trim(),
      currentSectionName: resolveSectionName(task.section, settings),
      currentSubsectionName: resolveSubsectionName(task.section, task.subsection, settings)
    }));
}

function buildSectionCatalog(settings = state.settingsCache) {
  return (settings?.sections || [])
    .map((section) => {
      const subsectionList = settings?.subsections?.[section.id] || [];
      const subsectionNameById = new Map(
        subsectionList.map((subsection) => [subsection.id, subsection?.name?.trim() || ""])
      );
      const headerSubsections = new Set(
        subsectionList
          .map((subsection) => subsection?.parentId || "")
          .filter(Boolean)
          .map((parentId) => subsectionNameById.get(parentId) || "")
          .filter(Boolean)
      );
      return {
        name: section?.name?.trim() || "",
        subsections: subsectionList
          .map((subsection) => subsection?.name?.trim() || "")
          .filter(Boolean),
        headerSubsections: [...headerSubsections],
        subsectionHierarchy: subsectionList
          .map((subsection) => ({
            name: subsection?.name?.trim() || "",
            parentName: subsection?.parentId ? subsectionNameById.get(subsection.parentId) || "" : ""
          }))
          .filter((subsection) => subsection.name)
      };
    })
    .filter((section) => section.name);
}

export function buildTaskOrganizationBatches(
  items = [],
  batchSize = SETTINGS_TASK_ORGANIZATION_BATCH_SIZE
) {
  const size = Math.max(1, Number(batchSize) || SETTINGS_TASK_ORGANIZATION_BATCH_SIZE);
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

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
        '9. Do not use markdown or code fences.',
        'Return a single JSON object with this shape: {"reasoning":"optional short note","suggestions":[{"taskId":"id","sectionName":"Section","subsectionName":"Subsection or empty","parentSubsectionName":"Existing parent subsection or empty","createSubsection":true,"reason":"Why"}]}',
        `Section catalog: ${JSON.stringify(sectionCatalog)}`,
        `Tasks: ${JSON.stringify(taskBatch)}`
      ].join("\n")
    }
  ];
}

function buildTaskOrganizationRequestBody(sectionCatalog, taskBatch) {
  return {
    model: GROQ_MODEL,
    messages: buildTaskOrganizationMessages(sectionCatalog, taskBatch),
    temperature: 0,
    max_completion_tokens: SETTINGS_TASK_ORGANIZATION_MAX_COMPLETION_TOKENS,
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

async function requestTaskOrganizationBatch(apiKey, sectionCatalog, taskBatch) {
  return requestTaskOrganizationCompletion(
    apiKey,
    buildTaskOrganizationRequestBody(sectionCatalog, taskBatch)
  );
}

function isGroqJsonValidationError(error) {
  if (error?.status !== HTTP_STATUS_BAD_REQUEST) {return false;}
  const detail = typeof error?.detail === "string" ? error.detail.toLowerCase() : "";
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  return code === "json_validate_failed" || detail.includes("failed to validate json");
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
    const subsectionNames = new Set(
      subsectionList
        .map((subsection) => subsection?.name?.trim()?.toLowerCase() || "")
        .filter(Boolean)
    );
    const headerSubsectionNames = new Set(
      subsectionList
        .map((subsection) => subsection?.parentId || "")
        .filter(Boolean)
        .map((parentId) => subsectionList.find((subsection) => subsection.id === parentId)?.name?.trim()?.toLowerCase() || "")
        .filter(Boolean)
    );
    subsectionLookup.set(name.toLowerCase(), subsectionNames);
    subsectionCanonicalLookup.set(name.toLowerCase(), canonicalSubsections);
    headerSubsectionLookup.set(name.toLowerCase(), headerSubsectionNames);
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

export function parseTaskOrganizationResponse(
  text,
  taskBatch,
  settings = state.settingsCache
) {
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

function describeScope(scope, settings = state.settingsCache) {
  const sectionName = resolveSectionName(scope?.sectionId || "", settings);
  const subsectionName = resolveSubsectionName(
    scope?.sectionId || "",
    scope?.subsectionId || "",
    settings
  );
  if (sectionName && subsectionName) {
    return `${sectionName} / ${subsectionName}`;
  }
  return sectionName || "selected tasks";
}

function buildAllowedSubsectionIds(sectionId, subsectionId, settings = state.settingsCache) {
  if (!sectionId || !subsectionId) {return new Set();}
  const subsections = settings?.subsections?.[sectionId] || [];
  return getSubsectionDescendantIds(subsections, subsectionId);
}

function isTaskInSection(task, sectionId) {
  return task?.section === sectionId;
}

function isTaskInSubsectionScope(task, sectionId, allowedSubsectionIds) {
  if (!isTaskInSection(task, sectionId)) {return false;}
  if (!task?.subsection) {return false;}
  return allowedSubsectionIds.has(task.subsection);
}

function filterTasksForScope(tasks = [], scope = {}, settings = state.settingsCache) {
  const sectionId = scope?.sectionId || "";
  const subsectionId = scope?.subsectionId || "";
  if (!sectionId && !subsectionId) {return tasks || [];}
  if (!subsectionId) {
    return (tasks || []).filter((task) => isTaskInSection(task, sectionId));
  }
  const allowedSubsectionIds = buildAllowedSubsectionIds(sectionId, subsectionId, settings);
  return (tasks || []).filter((task) => isTaskInSubsectionScope(task, sectionId, allowedSubsectionIds));
}

export function buildTaskOrganizationScopeItems(
  tasks = [],
  scope = {},
  settings = state.settingsCache
) {
  return buildTaskOrganizationReviewItems(filterTasksForScope(tasks, scope, settings), settings);
}

function parseBatchSuggestions(content, batch) {
  try {
    return parseTaskOrganizationResponse(content, batch, state.settingsCache);
  } catch (_error) {
    return null;
  }
}

function handleInvalidBatchResponse(uiTargets, content, scopeLabel) {
  state.taskOrganizationRawOutput = content || "No response";
  state.taskOrganizationSuggestions = [];
  renderRawResponse(uiTargets, content);
  setStatus(uiTargets, `Groq responded without valid JSON for ${scopeLabel}. Showing raw output.`, "error");
}

function buildTaskOrganizationSummarySuffix(skippedCount = 0, cacheHits = 0) {
  const skippedSuffix = skippedCount
    ? ` Skipped ${skippedCount} task${skippedCount === 1 ? "" : "s"} due to Groq JSON errors.`
    : "";
  const cachedSuffix = cacheHits
    ? ` Reused ${cacheHits} cached result${cacheHits === 1 ? "" : "s"}.`
    : "";
  return `${skippedSuffix}${cachedSuffix}`;
}

function finalizeSuggestions(uiTargets, allSuggestions, reviewItems, scopeLabel, skippedCount = 0, cacheHits = 0) {
  const summarySuffix = buildTaskOrganizationSummarySuffix(skippedCount, cacheHits);
  storeTaskOrganizationSuggestions(allSuggestions, scopeLabel);
  if (!allSuggestions.length) {
    renderTaskOrganizationModalState();
    setStatus(
      uiTargets,
      `Reviewed ${reviewItems.length} tasks in ${scopeLabel}. No moves suggested.${summarySuffix}`,
      "info"
    );
    return;
  }
  renderSuggestions(uiTargets, allSuggestions);
  renderTaskOrganizationModalState();
  setStatus(
    uiTargets,
    `Suggested ${allSuggestions.length} move${allSuggestions.length === 1 ? "" : "s"} across ${reviewItems.length} tasks in ${scopeLabel}.${summarySuffix}`,
    "info"
  );
}

async function reviewTaskOrganizationChunk(apiKey, sectionCatalog, taskBatch, scope = {}) {
  let content = "";
  let hadJsonValidationError = false;
  try {
    content = await requestTaskOrganizationBatch(apiKey, sectionCatalog, taskBatch);
    const parsed = parseBatchSuggestions(content, taskBatch);
    if (parsed !== null) {
      storeTaskOrganizationBatchCache(taskBatch, parsed, scope, sectionCatalog);
      return { suggestions: parsed, skippedCount: 0, invalidContent: "" };
    }
  } catch (error) {
    if (!isGroqJsonValidationError(error)) {throw error;}
    hadJsonValidationError = true;
  }

  if (taskBatch.length <= 1) {
    if (hadJsonValidationError) {
      return { suggestions: [], skippedCount: taskBatch.length, invalidContent: "" };
    }
    return {
      suggestions: [],
      skippedCount: 0,
      invalidContent: content || "No response"
    };
  }

  const midpoint = Math.ceil(taskBatch.length / TWO);
  const left = await reviewTaskOrganizationChunk(
    apiKey,
    sectionCatalog,
    taskBatch.slice(0, midpoint),
    scope
  );
  const right = await reviewTaskOrganizationChunk(
    apiKey,
    sectionCatalog,
    taskBatch.slice(midpoint),
    scope
  );
  return {
    suggestions: [...left.suggestions, ...right.suggestions],
    skippedCount: left.skippedCount + right.skippedCount,
    invalidContent: left.invalidContent || right.invalidContent
  };
}

async function reviewTaskOrganizationBatches(
  uiTargets,
  apiKey,
  sectionCatalog,
  reviewItems,
  scopeLabel,
  scope = {}
) {
  const { cachedSuggestions, uncachedItems, cacheHits } = getTaskOrganizationCachedReview(
    reviewItems,
    scope,
    sectionCatalog
  );
  const batches = buildTaskOrganizationBatches(uncachedItems);
  const allSuggestions = [...cachedSuggestions];
  let skippedCount = 0;
  if (!batches.length) {
    finalizeSuggestions(uiTargets, allSuggestions, reviewItems, scopeLabel, 0, cacheHits);
    return;
  }
  for (let index = 0; index < batches.length; index += 1) {
    setStatus(
      uiTargets,
      `${SETTINGS_TASK_ORGANIZATION_LOADING_LABEL} ${scopeLabel} (${index + 1}/${batches.length})`,
      "loading"
    );
    const result = await reviewTaskOrganizationChunk(apiKey, sectionCatalog, batches[index], scope);
    if (result.invalidContent) {
      handleInvalidBatchResponse(uiTargets, result.invalidContent, scopeLabel);
      return;
    }
    allSuggestions.push(...result.suggestions);
    skippedCount += result.skippedCount;
  }
  finalizeSuggestions(uiTargets, allSuggestions, reviewItems, scopeLabel, skippedCount, cacheHits);
}

function resolveReviewContext(uiTargets) {
  const sectionCatalog = buildSectionCatalog(state.settingsCache);
  if (!sectionCatalog.length) {
    clearTaskOrganizationState();
    clearOutput(uiTargets);
    renderTaskOrganizationModalState();
    setStatus(uiTargets, "Add at least one section before reviewing task placement.", "error");
    return null;
  }
  return { sectionCatalog };
}

async function resolveReviewItems(uiTargets, scope) {
  const apiKey = await ensureGroqApiKey();
  if (!apiKey) {
    clearTaskOrganizationState();
    clearOutput(uiTargets);
    renderTaskOrganizationModalState();
    setStatus(uiTargets, "Groq API key required to review task placement.", "error");
    return null;
  }
  const tasks = await getAllTasks();
  const reviewItems = buildTaskOrganizationScopeItems(tasks, scope, state.settingsCache);
  if (!reviewItems.length) {
    clearTaskOrganizationState();
    clearOutput(uiTargets);
    renderTaskOrganizationModalState();
    setStatus(uiTargets, `No active root tasks in ${describeScope(scope)}.`, "info");
    return null;
  }
  return { apiKey, reviewItems };
}

function setButtonLoading(button, isLoading) {
  if (!button) {return;}
  button.disabled = isLoading;
  button.dataset.loading = isLoading ? "true" : "false";
  if (isLoading) {
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.removeAttribute?.("aria-busy");
}

export async function reviewTaskOrganizationScope({
  sectionId = "",
  subsectionId = "",
  panel = null,
  button = null
} = {}) {
  const scope = { sectionId, subsectionId };
  const scopeLabel = describeScope(scope);
  const uiTargets = getUiTargets(scopeLabel, panel);
  if (!uiTargets.length) {return false;}
  openTaskOrganizationModal(scopeLabel);
  clearTaskOrganizationState();
  renderTaskOrganizationModalState();
  const reviewContext = resolveReviewContext(uiTargets);
  if (!reviewContext) {return true;}
  setButtonLoading(button, true);
  setStatus(uiTargets, `${SETTINGS_TASK_ORGANIZATION_LOADING_LABEL} ${scopeLabel}`, "loading");
  clearOutput(uiTargets);
  try {
    const reviewItemsContext = await resolveReviewItems(uiTargets, scope);
    if (!reviewItemsContext) {return true;}
    await reviewTaskOrganizationBatches(
      uiTargets,
      reviewItemsContext.apiKey,
      reviewContext.sectionCatalog,
      reviewItemsContext.reviewItems,
      scopeLabel,
      scope
    );
  } catch (error) {
    console.error("Groq task organization review failed.", error);
    clearTaskOrganizationState();
    clearOutput(uiTargets);
    renderTaskOrganizationModalState();
    setStatus(uiTargets, formatGroqErrorStatus(error, scopeLabel), "error");
  } finally {
    setButtonLoading(button, false);
  }
  return true;
}

export {
  closeTaskOrganizationModal,
  handleTaskOrganizationModalClick,
  resetTaskOrganizationScopePanel
};
