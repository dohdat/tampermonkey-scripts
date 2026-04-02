import { SETTINGS_TASK_ORGANIZATION_CACHE_LIMIT } from "./constants.js";
import { state } from "./state/page-state.js";

function buildCatalogCacheKey(sectionCatalog = []) {
  const stableCatalog = sectionCatalog.map(
    ({ name, subsections, headerSubsections, subsectionHierarchy }) => ({
      name,
      subsections,
      headerSubsections,
      subsectionHierarchy
    })
  );
  return JSON.stringify(stableCatalog);
}

function buildScopeCacheKey(scope = {}) {
  return JSON.stringify({
    sectionId: scope?.sectionId || "",
    subsectionId: scope?.subsectionId || ""
  });
}

function buildTaskOrganizationCacheKey(item, scope, sectionCatalog) {
  return JSON.stringify({
    scope: buildScopeCacheKey(scope),
    catalog: buildCatalogCacheKey(sectionCatalog),
    taskId: item?.id || "",
    title: item?.title || "",
    section: item?.currentSectionName || "",
    subsection: item?.currentSubsectionName || ""
  });
}

function touchTaskOrganizationCacheEntry(cacheKey, entry) {
  state.taskOrganizationSuggestionCache.delete(cacheKey);
  state.taskOrganizationSuggestionCache.set(cacheKey, entry);
}

function trimTaskOrganizationCache() {
  while (state.taskOrganizationSuggestionCache.size > SETTINGS_TASK_ORGANIZATION_CACHE_LIMIT) {
    const oldestKey = state.taskOrganizationSuggestionCache.keys().next().value;
    if (!oldestKey) {break;}
    state.taskOrganizationSuggestionCache.delete(oldestKey);
  }
}

export function getTaskOrganizationCachedReview(reviewItems = [], scope = {}, sectionCatalog = []) {
  const cachedSuggestions = [];
  const uncachedItems = [];
  let cacheHits = 0;

  reviewItems.forEach((item) => {
    const cacheKey = buildTaskOrganizationCacheKey(item, scope, sectionCatalog);
    const cached = state.taskOrganizationSuggestionCache.get(cacheKey);
    if (!cached) {
      uncachedItems.push(item);
      return;
    }
    cacheHits += 1;
    touchTaskOrganizationCacheEntry(cacheKey, cached);
    if (cached.hasSuggestion && cached.suggestion) {
      cachedSuggestions.push({ ...cached.suggestion });
    }
  });

  return { cachedSuggestions, uncachedItems, cacheHits };
}

export function storeTaskOrganizationBatchCache(
  taskBatch = [],
  suggestions = [],
  scope = {},
  sectionCatalog = []
) {
  const suggestionByTaskId = new Map(
    (suggestions || []).map((suggestion) => [suggestion.taskId, suggestion])
  );

  taskBatch.forEach((item) => {
    const suggestion = suggestionByTaskId.get(item.id) || null;
    const cacheKey = buildTaskOrganizationCacheKey(item, scope, sectionCatalog);
    touchTaskOrganizationCacheEntry(cacheKey, {
      hasSuggestion: Boolean(suggestion),
      suggestion: suggestion ? { ...suggestion } : null
    });
  });

  trimTaskOrganizationCache();
}
