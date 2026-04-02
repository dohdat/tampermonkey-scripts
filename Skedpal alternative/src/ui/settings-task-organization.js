import { getAllTasks, saveSettings } from "../data/db.js";
import {
  SETTINGS_TASK_ORGANIZATION_BATCH_SIZE,
  SETTINGS_TASK_ORGANIZATION_LOADING_LABEL,
  SETTINGS_TASK_ORGANIZATION_SPARSE_LEAF_MAX_TASKS,
  TWO
} from "./constants.js";
import { formatGroqErrorStatus } from "./groq-error-status.js";
import {
  getTaskOrganizationCachedReview,
  storeTaskOrganizationBatchCache
} from "./task-organization-review-cache.js";
import {
  isGroqJsonValidationError,
  isGroqRequestTooLargeError,
  parseTaskOrganizationResponse,
  requestTaskOrganizationBatch
} from "./task-organization-review-helpers.js";
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

function buildSparseLeafSubsections(
  section,
  subsectionList,
  subsectionNameById,
  scopedTasks = []
) {
  const sectionId = section?.id || "";
  if (!sectionId) {return [];}
  const taskCountBySubsection = new Map();

  (scopedTasks || []).forEach((task) => {
    if (task?.section !== sectionId) {return;}
    const subsectionId = task?.subsection || "";
    if (!subsectionId) {return;}
    taskCountBySubsection.set(subsectionId, (taskCountBySubsection.get(subsectionId) || 0) + 1);
  });

  const parentIds = new Set(
    (subsectionList || []).map((subsection) => subsection?.parentId || "").filter(Boolean)
  );
  const leafSubsections = (subsectionList || []).filter(
    (subsection) => subsection?.id && !parentIds.has(subsection.id)
  );

  return leafSubsections
    .map((subsection) => {
      const name = subsection?.name?.trim() || "";
      if (!name) {return null;}
      const taskCount = taskCountBySubsection.get(subsection.id) || 0;
      if (taskCount < 1 || taskCount > SETTINGS_TASK_ORGANIZATION_SPARSE_LEAF_MAX_TASKS) {
        return null;
      }
      const parentId = subsection?.parentId || "";
      const siblingLeafSubsections = leafSubsections
        .filter((candidate) => candidate?.id !== subsection?.id && (candidate?.parentId || "") === parentId)
        .map((candidate) => candidate?.name?.trim() || "")
        .filter(Boolean);
      return {
        name,
        parentName: parentId ? subsectionNameById.get(parentId) || "" : "",
        taskCount,
        siblingLeafSubsections
      };
    })
    .filter(Boolean);
}

function isSubsectionScoped(scope = {}) {
  return Boolean(scope?.sectionId) && Boolean(scope?.subsectionId);
}

function resolveSubsectionById(sectionId, subsectionId, settings = state.settingsCache) {
  if (!sectionId || !subsectionId) {return null;}
  return (settings?.subsections?.[sectionId] || []).find(
    (subsection) => subsection?.id === subsectionId
  ) || null;
}

function resolveCatalogRootSubsectionId(sectionId, subsectionId, settings = state.settingsCache) {
  const subsection = resolveSubsectionById(sectionId, subsectionId, settings);
  if (!subsection?.id) {return subsectionId || "";}
  return subsection.parentId || subsection.id;
}

function filterCatalogSectionsByScope(sections = [], scope = {}) {
  if (!isSubsectionScoped(scope)) {return sections;}
  return (sections || []).filter((section) => section?.id === scope.sectionId);
}

function filterCatalogSubsectionsByScope(sectionId, subsectionList = [], scope = {}, settings = state.settingsCache) {
  if (!isSubsectionScoped(scope) || sectionId !== scope.sectionId) {return subsectionList || [];}
  const catalogRootSubsectionId = resolveCatalogRootSubsectionId(
    sectionId,
    scope.subsectionId,
    settings
  );
  const allowedSubsectionIds = buildAllowedSubsectionIds(
    sectionId,
    catalogRootSubsectionId,
    settings
  );
  if (!allowedSubsectionIds.size) {return subsectionList || [];}
  return (subsectionList || []).filter((subsection) => allowedSubsectionIds.has(subsection?.id || ""));
}

function buildSectionCatalog(settings = state.settingsCache, scopedTasks = [], scope = {}) {
  const filteredSections = filterCatalogSectionsByScope(settings?.sections || [], scope);
  return (settings?.sections || [])
    .filter((section) => filteredSections.some((entry) => entry.id === section.id))
    .map((section) => {
      const subsectionList = filterCatalogSubsectionsByScope(
        section.id,
        settings?.subsections?.[section.id] || [],
        scope,
        settings
      );
      const subsectionNameById = new Map(
        subsectionList.map((subsection) => [subsection.id, subsection?.name?.trim() || ""])
      );
      const sparseLeafSubsections = buildSparseLeafSubsections(
        section,
        subsectionList,
        subsectionNameById,
        scopedTasks
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
        sparseLeafSubsections,
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
  let recoverableError = null;
  try {
    content = await requestTaskOrganizationBatch(apiKey, sectionCatalog, taskBatch);
    const parsed = parseBatchSuggestions(content, taskBatch);
    if (parsed !== null) {
      storeTaskOrganizationBatchCache(taskBatch, parsed, scope, sectionCatalog);
      return { suggestions: parsed, skippedCount: 0, invalidContent: "" };
    }
  } catch (error) {
    if (isGroqJsonValidationError(error)) {
      hadJsonValidationError = true;
      recoverableError = error;
    } else if (isGroqRequestTooLargeError(error)) {
      recoverableError = error;
    } else {
      throw error;
    }
  }

  if (taskBatch.length <= 1) {
    if (hadJsonValidationError) {
      return { suggestions: [], skippedCount: taskBatch.length, invalidContent: "" };
    }
    if (recoverableError) {throw recoverableError;}
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
  return {};
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
  const scopedTasks = filterTasksForScope(tasks, scope, state.settingsCache);
  const reviewItems = buildTaskOrganizationReviewItems(scopedTasks, state.settingsCache);
  if (!reviewItems.length) {
    clearTaskOrganizationState();
    clearOutput(uiTargets);
    renderTaskOrganizationModalState();
    setStatus(uiTargets, `No active root tasks in ${describeScope(scope)}.`, "info");
    return null;
  }
  const activeScopedTasksForLeafCounts = scopedTasks.filter(
    (task) => Boolean(task?.id) && ![task.completed, isDeletedTask(task)].some(Boolean)
  );
  return { apiKey, reviewItems, activeScopedTasksForLeafCounts };
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
  if (!resolveReviewContext(uiTargets)) {return true;}
  setButtonLoading(button, true);
  setStatus(uiTargets, `${SETTINGS_TASK_ORGANIZATION_LOADING_LABEL} ${scopeLabel}`, "loading");
  clearOutput(uiTargets);
  try {
    const reviewItemsContext = await resolveReviewItems(uiTargets, scope);
    if (!reviewItemsContext) {return true;}
    const sectionCatalog = buildSectionCatalog(
      state.settingsCache,
      reviewItemsContext.activeScopedTasksForLeafCounts,
      scope
    );
    await reviewTaskOrganizationBatches(
      uiTargets,
      reviewItemsContext.apiKey,
      sectionCatalog,
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
  parseTaskOrganizationResponse,
  resetTaskOrganizationScopePanel
};
