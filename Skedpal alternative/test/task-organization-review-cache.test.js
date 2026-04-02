import assert from "assert";
import { describe, it, beforeEach } from "mocha";

import { state } from "../src/ui/state/page-state.js";
import {
  getTaskOrganizationCachedReview,
  storeTaskOrganizationBatchCache
} from "../src/ui/task-organization-review-cache.js";

describe("task organization review cache", () => {
  beforeEach(() => {
    state.taskOrganizationSuggestionCache = new Map();
  });

  it("returns cached suggestions and uncached items for mixed batches", () => {
    const scope = { sectionId: "section-home", subsectionId: "sub-cleaning" };
    const sectionCatalog = [
      {
        name: "Home",
        subsections: ["Cleaning", "Bathroom"],
        headerSubsections: ["Cleaning"],
        sparseLeafSubsections: [{ name: "Bathroom", taskCount: 2 }],
        subsectionHierarchy: [
          { name: "Cleaning", parentName: "" },
          { name: "Bathroom", parentName: "Cleaning" }
        ]
      }
    ];
    const cachedBatch = [
      {
        id: "task-1",
        title: "Clean sink",
        currentSectionName: "Home",
        currentSubsectionName: "Cleaning"
      },
      {
        id: "task-2",
        title: "Scrub tub",
        currentSectionName: "Home",
        currentSubsectionName: "Bathroom"
      }
    ];
    const suggestions = [
      {
        taskId: "task-1",
        taskTitle: "Clean sink",
        currentSectionName: "Home",
        currentSubsectionName: "Cleaning",
        suggestedSectionName: "Home",
        suggestedSubsectionName: "Bathroom",
        suggestedParentSubsectionName: "",
        createSubsection: false,
        reason: "Bathroom chore."
      }
    ];

    storeTaskOrganizationBatchCache(cachedBatch, suggestions, scope, sectionCatalog);

    const reviewItems = [
      ...cachedBatch,
      {
        id: "task-3",
        title: "Dust shelves",
        currentSectionName: "Home",
        currentSubsectionName: "Cleaning"
      }
    ];

    const result = getTaskOrganizationCachedReview(reviewItems, scope, sectionCatalog);
    assert.strictEqual(result.cacheHits, 2);
    assert.deepStrictEqual(result.uncachedItems.map((item) => item.id), ["task-3"]);
    assert.deepStrictEqual(result.cachedSuggestions.map((suggestion) => suggestion.taskId), ["task-1"]);
  });

  it("uses stable catalog keys that ignore sparse leaf count changes", () => {
    const scope = { sectionId: "section-home", subsectionId: "" };
    const oldCatalog = [
      {
        name: "Home",
        subsections: ["Cleaning", "Bathroom"],
        headerSubsections: ["Cleaning"],
        sparseLeafSubsections: [{ name: "Bathroom", taskCount: 1 }],
        subsectionHierarchy: [
          { name: "Cleaning", parentName: "" },
          { name: "Bathroom", parentName: "Cleaning" }
        ]
      }
    ];
    const newCatalog = [
      {
        name: "Home",
        subsections: ["Cleaning", "Bathroom"],
        headerSubsections: ["Cleaning"],
        sparseLeafSubsections: [{ name: "Bathroom", taskCount: 2 }],
        subsectionHierarchy: [
          { name: "Cleaning", parentName: "" },
          { name: "Bathroom", parentName: "Cleaning" }
        ]
      }
    ];
    const reviewItem = {
      id: "task-1",
      title: "Clean sink",
      currentSectionName: "Home",
      currentSubsectionName: "Cleaning"
    };

    storeTaskOrganizationBatchCache([reviewItem], [], scope, oldCatalog);
    const result = getTaskOrganizationCachedReview([reviewItem], scope, newCatalog);

    assert.strictEqual(result.cacheHits, 1);
    assert.deepStrictEqual(result.uncachedItems, []);
  });

  it("trims cache entries to the configured limit", () => {
    const scope = { sectionId: "section-home", subsectionId: "" };
    const sectionCatalog = [
      {
        name: "Home",
        subsections: ["Cleaning"],
        headerSubsections: [],
        sparseLeafSubsections: [],
        subsectionHierarchy: [{ name: "Cleaning", parentName: "" }]
      }
    ];
    const batch = Array.from({ length: 501 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      currentSectionName: "Home",
      currentSubsectionName: "Cleaning"
    }));

    storeTaskOrganizationBatchCache(batch, [], scope, sectionCatalog);
    assert.strictEqual(state.taskOrganizationSuggestionCache.size <= 500, true);
  });
});

