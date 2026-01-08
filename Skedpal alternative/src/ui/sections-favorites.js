import { saveSettings } from "../data/db.js";
import { buildFavoriteKey, applyFavoriteOrder } from "./favorites.js";
import { getSectionName } from "./sections-data.js";
import { getSectionColorMap, getSubsectionDescendantIds } from "./utils.js";
import { state } from "./state/page-state.js";
import { themeColors } from "./theme.js";
import { domRefs } from "./constants.js";

const { sidebarFavorites } = domRefs;

function normalizeFavoriteOrder(order) {
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function sortFavoriteItems(items = []) {
  return [...items].sort((a, b) => {
    const aOrder = normalizeFavoriteOrder(a.favoriteOrder);
    const bOrder = normalizeFavoriteOrder(b.favoriteOrder);
    if (aOrder !== bOrder) {return aOrder - bOrder;}
    return a.label.localeCompare(b.label);
  });
}

function getFavoriteGroups() {
  const sections = state.settingsCache.sections || [];
  const favoriteSections = sections.filter((s) => s.favorite);
  const subsectionMap = state.settingsCache.subsections || {};
  const favoriteSubsections = Object.entries(subsectionMap).flatMap(([sectionId, list]) =>
    (list || [])
      .filter((s) => s.favorite)
      .map((s) => ({ ...s, sectionId, parentId: s.parentId || "" }))
  );
  if (!favoriteSections.length && !favoriteSubsections.length) {
    return [];
  }
  const sectionColorMap = getSectionColorMap(sections);
  const fallbackColor = {
    dot: themeColors.lime400,
    glow: themeColors.lime400Glow
  };
  const groups = new Map();

  const ensureGroup = (sectionId) => {
    if (groups.has(sectionId)) {return groups.get(sectionId);}
    const label = getSectionName(sectionId) || "No section";
    const colors = (sectionColorMap.get(sectionId) || fallbackColor) ?? fallbackColor;
    const group = {
      sectionId,
      label,
      colors,
      items: []
    };
    groups.set(sectionId, group);
    return group;
  };

  favoriteSections.forEach((section) => {
    const group = ensureGroup(section.id || "");
    group.items.push({
      type: "section",
      label: getSectionName(section.id) || section.name || "Untitled section",
      sectionId: section.id || "",
      favoriteOrder: section.favoriteOrder,
      ...group.colors
    });
  });

  favoriteSubsections.forEach((sub) => {
    const group = ensureGroup(sub.sectionId || "");
    group.items.push({
      type: "subsection",
      label: sub.name || "Untitled subsection",
      sectionId: sub.sectionId || "",
      subsectionId: sub.id,
      parentId: sub.parentId || "",
      favoriteOrder: sub.favoriteOrder,
      ...group.colors
    });
  });

  const sortedGroups = [...groups.values()].map((group) => ({
    ...group,
    items: sortFavoriteItems(group.items)
  }));

  sortedGroups.sort((a, b) => {
    const aMin = Math.min(...a.items.map((item) => normalizeFavoriteOrder(item.favoriteOrder)));
    const bMin = Math.min(...b.items.map((item) => normalizeFavoriteOrder(item.favoriteOrder)));
    if (aMin !== bMin) {return aMin - bMin;}
    return a.label.localeCompare(b.label);
  });

  return sortedGroups;
}

function buildGroupUsageMap(groups) {
  const usageBySection = new Map();
  state.tasksCache.forEach((task) => {
    const sectionId = task.section || "";
    usageBySection.set(sectionId, (usageBySection.get(sectionId) || 0) + 1);
  });
  return new Map(
    groups.map((group) => {
      const usage = usageBySection.get(group.sectionId) || 0;
      return [group.sectionId, usage || group.items.length];
    })
  );
}

function resolveExpandedGroups(groups) {
  const saved = state.settingsCache.favoriteGroupExpanded || {};
  const savedKeys = Object.keys(saved || {});
  if (savedKeys.length) {
    const filtered = {};
    groups.forEach((group) => {
      if (Object.prototype.hasOwnProperty.call(saved, group.sectionId)) {
        filtered[group.sectionId] = Boolean(saved[group.sectionId]);
      }
    });
    return filtered;
  }
  if (!groups.length) {return {};}
  const usageMap = buildGroupUsageMap(groups);
  let topSectionId = groups[0].sectionId;
  let topScore = usageMap.get(topSectionId) || 0;
  groups.forEach((group) => {
    const score = usageMap.get(group.sectionId) || 0;
    if (score > topScore) {
      topScore = score;
      topSectionId = group.sectionId;
    }
  });
  return { [topSectionId]: true };
}

function resolveExpandedSubsections(items) {
  const saved = state.settingsCache.favoriteSubsectionExpanded || {};
  const expanded = {};
  items.forEach((item) => {
    if (Object.prototype.hasOwnProperty.call(saved, item.subsectionId)) {
      expanded[item.subsectionId] = Boolean(saved[item.subsectionId]);
    } else {
      expanded[item.subsectionId] = true;
    }
  });
  return expanded;
}

function getTaskCountForFavorite(item, tasks) {
  if (!item || !Array.isArray(tasks)) {return 0;}
  const visibleTasks = tasks.filter((task) => !task.completed);
  if (item.type === "subsection") {
    const subsectionList = state.settingsCache.subsections?.[item.sectionId] || [];
    const descendantIds = getSubsectionDescendantIds(subsectionList, item.subsectionId);
    if (!descendantIds.size) {return 0;}
    return visibleTasks.filter(
      (task) => task.section === item.sectionId && descendantIds.has(task.subsection)
    ).length;
  }
  return visibleTasks.filter((task) => task.section === item.sectionId).length;
}

function buildFavoriteButton(item, options = {}) {
  const { hasChildren = false, expanded = true, depth = 0 } = options;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sidebar-fav-item";
  if (hasChildren) {
    btn.classList.add("has-children");
    if (!expanded) {
      btn.classList.add("is-collapsed");
    }
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
  btn.setAttribute("data-test-skedpal", "sidebar-fav-button");
  btn.setAttribute("data-fav-button", "true");
  btn.dataset.favKey = buildFavoriteKey(item);
  btn.dataset.favJump = "true";
  btn.dataset.favType = item.type;
  btn.dataset.sectionId = item.sectionId || "";
  if (item.subsectionId) {btn.dataset.subsectionId = item.subsectionId;}
  const count = getTaskCountForFavorite(item, state.tasksCache || []);
  const indent = depth > 0 ? `style="margin-left:${depth * 14}px"` : "";
  const toggle = hasChildren
    ? `
      <span class="sidebar-fav-sub-toggle" data-test-skedpal="sidebar-fav-sub-toggle" data-fav-sub-toggle="${item.subsectionId}">
        <span class="sidebar-fav-sub-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </span>
    `
    : "";
  btn.innerHTML = `
      <span class="sidebar-fav-dot" aria-hidden="true" data-test-skedpal="sidebar-fav-dot" style="background:${item.dot};box-shadow:0 0 0 2px ${item.glow};"></span>
      <span class="sidebar-fav-text" ${indent}>
        <span class="sidebar-fav-label" data-test-skedpal="sidebar-fav-label">${item.label}</span>
      </span>
      <span class="sidebar-fav-count" data-test-skedpal="sidebar-fav-count">${count}</span>
      ${toggle}
    `;
  return btn;
}

function buildFavoriteRow(item, options = {}) {
  const li = document.createElement("li");
  li.setAttribute("data-test-skedpal", "sidebar-fav-row");
  li.setAttribute("data-fav-row", "true");
  li.dataset.favKey = buildFavoriteKey(item);
  li.dataset.favGroup = item.sectionId || "";
  li.draggable = true;
  const btn = buildFavoriteButton(item, options);
  li.appendChild(btn);
  return li;
}

function buildFavoriteSubsectionTree(items) {
  const nodesById = new Map();
  items.forEach((item) => {
    nodesById.set(item.subsectionId, { item, children: [] });
  });
  const roots = [];
  nodesById.forEach((node) => {
    const parentId = node.item.parentId || "";
    const parent = parentId ? nodesById.get(parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      const aOrder = normalizeFavoriteOrder(a.item.favoriteOrder);
      const bOrder = normalizeFavoriteOrder(b.item.favoriteOrder);
      if (aOrder !== bOrder) {return aOrder - bOrder;}
      return a.item.label.localeCompare(b.item.label);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function renderFavoriteSubsectionNode(node, expandedMap, depth = 0) {
  const hasChildren = node.children.length > 0;
  const expanded = Boolean(expandedMap[node.item.subsectionId]);
  const row = buildFavoriteRow(node.item, { hasChildren, expanded, depth });
  if (hasChildren) {
    const list = document.createElement("ul");
    list.className = "sidebar-fav-sub-list";
    list.setAttribute("data-test-skedpal", "sidebar-fav-sub-list");
    list.dataset.favSubList = node.item.subsectionId;
    if (!expanded) {
      list.classList.add("hidden");
    }
    node.children.forEach((child) => {
      list.appendChild(renderFavoriteSubsectionNode(child, expandedMap, depth + 1));
    });
    row.appendChild(list);
  }
  return row;
}

function buildFavoriteGroup(group, expanded, expandedSubsections) {
  const wrapper = document.createElement("li");
  wrapper.className = "sidebar-fav-group";
  wrapper.setAttribute("data-test-skedpal", "sidebar-fav-group");
  wrapper.dataset.favGroup = group.sectionId;
  const header = document.createElement("button");
  header.type = "button";
  header.className = "sidebar-fav-group-header";
  header.dataset.favToggle = group.sectionId;
  header.setAttribute("data-test-skedpal", "sidebar-fav-group-toggle");
  header.innerHTML = `
      <span class="sidebar-fav-group-title" data-test-skedpal="sidebar-fav-group-title">
        ${group.label}
      </span>
      <span class="sidebar-fav-group-meta" data-test-skedpal="sidebar-fav-group-count">
        ${group.items.length}
      </span>
      <span class="sidebar-fav-group-chevron" data-test-skedpal="sidebar-fav-group-chevron" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
    `;
  wrapper.appendChild(header);
  const list = document.createElement("ul");
  list.className = "sidebar-fav-group-list";
  list.setAttribute("data-test-skedpal", "sidebar-fav-group-list");
  list.dataset.favGroupList = group.sectionId;
  if (!expanded) {
    list.classList.add("hidden");
    header.classList.add("is-collapsed");
  }
  const sectionItems = group.items.filter((item) => item.type === "section");
  const subsectionItems = group.items.filter((item) => item.type === "subsection");
  sortFavoriteItems(sectionItems).forEach((item) => list.appendChild(buildFavoriteRow(item)));
  const subsectionTree = buildFavoriteSubsectionTree(subsectionItems);
  subsectionTree.forEach((node) => {
    list.appendChild(renderFavoriteSubsectionNode(node, expandedSubsections));
  });
  wrapper.appendChild(list);
  return wrapper;
}

export function renderFavoriteShortcuts() {
  if (!sidebarFavorites) {return;}
  sidebarFavorites.innerHTML = "";
  sidebarFavorites.classList.remove("hidden");
  const groups = getFavoriteGroups();

  if (!groups.length) {
    const empty = document.createElement("li");
    empty.className = "sidebar-fav-empty";
    empty.setAttribute("data-test-skedpal", "sidebar-fav-empty");
    empty.textContent = "No favorites yet";
    sidebarFavorites.appendChild(empty);
    return;
  }

  const expandedGroups = resolveExpandedGroups(groups);
  const favoriteSubsections = groups.flatMap((group) =>
    group.items.filter((item) => item.type === "subsection")
  );
  const expandedSubsections = resolveExpandedSubsections(favoriteSubsections);
  groups.forEach((group) => {
    const expanded = Boolean(expandedGroups[group.sectionId]);
    sidebarFavorites.appendChild(buildFavoriteGroup(group, expanded, expandedSubsections));
  });
}

export async function updateFavoriteOrder(orderedKeys = []) {
  const updatedSettings = applyFavoriteOrder(state.settingsCache, orderedKeys);
  state.settingsCache = updatedSettings;
  await saveSettings(state.settingsCache);
  renderFavoriteShortcuts();
}

export async function toggleFavoriteGroup(sectionId) {
  if (!sectionId) {return;}
  const expanded = { ...(state.settingsCache.favoriteGroupExpanded || {}) };
  expanded[sectionId] = !expanded[sectionId];
  state.settingsCache = { ...state.settingsCache, favoriteGroupExpanded: expanded };
  await saveSettings(state.settingsCache);
  renderFavoriteShortcuts();
}

export async function toggleFavoriteSubsection(subsectionId) {
  if (!subsectionId) {return;}
  const expanded = { ...(state.settingsCache.favoriteSubsectionExpanded || {}) };
  expanded[subsectionId] = !expanded[subsectionId];
  state.settingsCache = { ...state.settingsCache, favoriteSubsectionExpanded: expanded };
  await saveSettings(state.settingsCache);
  renderFavoriteShortcuts();
}
