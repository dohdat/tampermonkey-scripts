import { domRefs, homeIconSvg } from "./constants.js";
import { state } from "./page-state.js";
import { updateUrlWithView, updateUrlWithZoom } from "./utils.js";
import { renderTasks } from "./tasks-render.js";
import { getSectionName, getSubsectionsFor } from "./sections.js";
import { isTypingTarget } from "./notifications.js";

const { views, navButtons, navBreadcrumb, sidebarFavorites, sidebarFavToggle } = domRefs;

export function pushNavigation(filter) {
  state.navStack = state.navStack.slice(0, state.navIndex + 1);
  const snapshot = filter ? { ...filter } : null;
  state.navStack.push(snapshot);
  state.navIndex = state.navStack.length - 1;
}

export function switchView(target) {
  const allowedViews = navButtons.map((btn) => btn.dataset.view);
  const resolvedTarget = allowedViews.includes(target) ? target : "tasks";
  views.forEach((view) => {
    const active = view.id === resolvedTarget;
    view.classList.toggle("hidden", !active);
  });
  navButtons.forEach((btn) => {
    const active = btn.dataset.view === resolvedTarget;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
  });
  updateUrlWithView(resolvedTarget);
}

export function getZoomLabel() {
  if (!state.zoomFilter) return "";
  if (state.zoomFilter.type === "section") {
    const name = state.zoomFilter.sectionId ? getSectionName(state.zoomFilter.sectionId) : "No section";
    return `section "${name || "Untitled section"}"`;
  }
  if (state.zoomFilter.type === "subsection") {
    const subName = getSubsectionsFor(state.zoomFilter.sectionId).find(
      (s) => s.id === state.zoomFilter.subsectionId
    )?.name;
    return `subsection "${subName || "Untitled subsection"}"`;
  }
  if (state.zoomFilter.type === "task") {
    const task = state.tasksCache.find((t) => t.id === state.zoomFilter.taskId);
    return task ? `task "${task.title}"` : "task";
  }
  return "";
}

export function setZoomFilter(filter, options = {}) {
  const { record = true } = options;
  state.zoomFilter = filter;
  updateUrlWithZoom(filter);
  renderTasks(state.tasksCache, state.tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) pushNavigation(filter);
}

export function clearZoomFilter(options = {}) {
  const { record = true } = options;
  state.zoomFilter = null;
  updateUrlWithZoom(null);
  renderTasks(state.tasksCache, state.tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) pushNavigation(null);
}

export function goHome() {
  clearZoomFilter();
  switchView("tasks");
}

export function applyNavEntry(entry) {
  if (!entry) {
    clearZoomFilter({ record: false });
    return;
  }
  setZoomFilter(entry, { record: false });
}

export function goBackInNavigation() {
  if (state.navIndex <= 0) return false;
  state.navIndex -= 1;
  applyNavEntry(state.navStack[state.navIndex]);
  return true;
}

export function goForwardInNavigation() {
  if (state.navIndex < 0 || state.navIndex >= state.navStack.length - 1) return false;
  state.navIndex += 1;
  applyNavEntry(state.navStack[state.navIndex]);
  return true;
}

export function zoomOutOneLevel() {
  if (!state.zoomFilter) return;
  if (state.zoomFilter.type === "task") {
    if (state.zoomFilter.subsectionId) {
      setZoomFilter(
        {
          type: "subsection",
          sectionId: state.zoomFilter.sectionId || "",
          subsectionId: state.zoomFilter.subsectionId
        },
        { record: true }
      );
      return;
    }
    if (state.zoomFilter.sectionId !== undefined) {
      setZoomFilter({ type: "section", sectionId: state.zoomFilter.sectionId || "" }, { record: true });
      return;
    }
    clearZoomFilter();
    return;
  }
  if (state.zoomFilter.type === "subsection") {
    setZoomFilter({ type: "section", sectionId: state.zoomFilter.sectionId || "" }, { record: true });
    return;
  }
  if (state.zoomFilter.type === "section") {
    clearZoomFilter();
  }
}

export function renderBreadcrumb() {
  if (!navBreadcrumb) return;
  navBreadcrumb.innerHTML = "";
  const crumbs = [];
  const addSectionCrumb = (sectionId) => {
    if (sectionId === undefined || sectionId === null) return;
    const label = sectionId ? getSectionName(sectionId) || "Untitled section" : "No section";
    crumbs.push({
      label,
      onClick: () => setZoomFilter({ type: "section", sectionId: sectionId || "" })
    });
  };
  const addSubsectionCrumb = (sectionId, subsectionId) => {
    if (!subsectionId) return;
    const name =
      getSubsectionsFor(sectionId).find((s) => s.id === subsectionId)?.name || "Untitled subsection";
    crumbs.push({
      label: name,
      onClick: () =>
        setZoomFilter({
          type: "subsection",
          sectionId: sectionId || "",
          subsectionId
        })
    });
  };
  const addTaskCrumb = (taskId, sectionId, subsectionId) => {
    if (!taskId) return;
    const task = state.tasksCache.find((t) => t.id === taskId);
    if (!task) return;
    crumbs.push({
      label: task.title || "Task",
      onClick: () =>
        setZoomFilter({
          type: "task",
          taskId,
          sectionId: sectionId || "",
          subsectionId: subsectionId || ""
        })
    });
  };

  crumbs.push({
    label: "Home",
    icon: homeIconSvg,
    onClick: () => goHome()
  });

  if (state.zoomFilter) {
    if (state.zoomFilter.type === "section") {
      addSectionCrumb(state.zoomFilter.sectionId);
    } else if (state.zoomFilter.type === "subsection") {
      addSectionCrumb(state.zoomFilter.sectionId);
      addSubsectionCrumb(state.zoomFilter.sectionId, state.zoomFilter.subsectionId);
    } else if (state.zoomFilter.type === "task") {
      addSectionCrumb(state.zoomFilter.sectionId);
      addSubsectionCrumb(state.zoomFilter.sectionId, state.zoomFilter.subsectionId);
      addTaskCrumb(state.zoomFilter.taskId, state.zoomFilter.sectionId, state.zoomFilter.subsectionId);
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center gap-2 text-xs text-slate-300";
  crumbs.forEach((crumb, idx) => {
    if (idx > 0) {
      const sep = document.createElement("span");
      sep.className = "text-slate-500";
      sep.textContent = ">";
      wrapper.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-lime-300";
    btn.innerHTML = crumb.icon ? `${crumb.icon}<span>${crumb.label}</span>` : crumb.label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      crumb.onClick?.();
    });
    wrapper.appendChild(btn);
  });
  navBreadcrumb.appendChild(wrapper);
}

export function handleNavigationShortcuts(event) {
  if (isTypingTarget(event.target)) return;
  const key = event.key;
  const isBack = key === "BrowserBack";
  const isForward = key === "BrowserForward";
  if (!isBack && !isForward) return;
  if (isBack) {
    if (goBackInNavigation()) event.preventDefault();
  } else if (isForward) {
    if (goForwardInNavigation()) event.preventDefault();
  }
}

export function handleNavigationMouseButtons(event) {
  if (isTypingTarget(event.target)) return;
  if (event.button === 3) {
    if (goBackInNavigation()) event.preventDefault();
  } else if (event.button === 4) {
    if (goForwardInNavigation()) event.preventDefault();
  }
}

export function toggleFavoritesAccordion(forceOpen) {
  if (!sidebarFavorites || !sidebarFavToggle) return;
  const favContainer = sidebarFavToggle.closest("[data-fav-accordion]");
  const shouldOpen =
    typeof forceOpen === "boolean" ? forceOpen : sidebarFavorites.classList.contains("hidden");
  sidebarFavorites.classList.toggle("hidden", !shouldOpen);
  favContainer?.classList.toggle("hidden", false);
  favContainer?.classList.toggle("is-open", shouldOpen);
  sidebarFavToggle.classList.toggle("is-open", shouldOpen);
  sidebarFavToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

export function initViewFromUrl(parseViewFromUrl) {
  const initialView = parseViewFromUrl("tasks");
  switchView(initialView);
}
