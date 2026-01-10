import { domRefs, homeIconSvg } from "./constants.js";
import { state } from "./state/page-state.js";
import {
  parseCalendarViewFromUrl,
  parseViewFromUrl,
  parseZoomFromUrl,
  updateUrlWithView,
  updateUrlWithZoom
} from "./utils.js";
import { renderTasks } from "./tasks/tasks-render.js";
import { getSectionName, getSubsectionsFor } from "./sections-data.js";
import { isTypingTarget } from "./notifications.js";
import { focusCalendarNow, renderCalendar } from "./calendar.js";
import { getActiveViewId } from "./navigation-helpers.js";

function getViews() {
  return domRefs.views || [];
}

function getNavButtons() {
  return domRefs.navButtons || [];
}

function setSplitFlag(node, isSplit) {
  if (!node) {return;}
  node.dataset.split = isSplit ? "true" : "false";
}

function setHidden(node, hidden) {
  if (!node) {return;}
  node.classList.toggle("hidden", Boolean(hidden));
}

function relocateCalendarSplitToggle(showCalendarSplit) {
  const {
    tasksCalendarToggleBtn,
    calendarSplitToggleSlot,
    floatingActions
  } = domRefs;
  if (!tasksCalendarToggleBtn) {return;}
  if (showCalendarSplit && calendarSplitToggleSlot) {
    if (tasksCalendarToggleBtn.parentElement !== calendarSplitToggleSlot) {
      calendarSplitToggleSlot.appendChild(tasksCalendarToggleBtn);
    }
    return;
  }
  if (floatingActions && tasksCalendarToggleBtn.parentElement !== floatingActions) {
    floatingActions.appendChild(tasksCalendarToggleBtn);
  }
}

function shouldShowCalendarSplit(resolvedTarget) {
  return resolvedTarget === "tasks" && state.tasksCalendarSplit;
}

function applyViewVisibility(views, resolvedTarget, showCalendarSplit) {
  views.forEach((view) => {
    const active = view.id === resolvedTarget || (showCalendarSplit && view.id === "calendar");
    view.classList.toggle("hidden", !active);
  });
}

function updateNavButtonState(navButtons, resolvedTarget) {
  navButtons.forEach((btn) => {
    const active = btn.dataset.view === resolvedTarget;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
  });
}

function updateSplitControls(resolvedTarget, showCalendarSplit) {
  const {
    tasksCalendarSplitWrap,
    tasksCalendarToggleBtn,
    appHeader,
    appMainContent,
    calendarViewDayOnly,
    floatingActions,
    navBreadcrumb
  } = domRefs;
  setSplitFlag(tasksCalendarSplitWrap, showCalendarSplit);
  setHidden(tasksCalendarToggleBtn, resolvedTarget !== "tasks");
  setSplitFlag(appHeader, showCalendarSplit);
  setSplitFlag(appMainContent, showCalendarSplit);
  setHidden(calendarViewDayOnly, !(resolvedTarget === "calendar" && !showCalendarSplit));
  setSplitFlag(floatingActions, showCalendarSplit);
  setHidden(navBreadcrumb, resolvedTarget === "calendar");
  relocateCalendarSplitToggle(showCalendarSplit);
}

function updateSplitToggleLabel() {
  const { tasksCalendarToggleBtn } = domRefs;
  if (!tasksCalendarToggleBtn) {return;}
  tasksCalendarToggleBtn.textContent = state.tasksCalendarSplit ? "x" : "Show 🗓️";
}

function applyCalendarView(resolvedTarget, showCalendarSplit, calendarAnchorDate, focusCalendar) {
  if (!showCalendarSplit && resolvedTarget !== "calendar") {return;}
  if (calendarAnchorDate) {
    state.calendarAnchorDate = new Date(calendarAnchorDate);
  } else if (resolvedTarget === "calendar") {
    state.calendarAnchorDate = new Date();
  }
  const renderPromise = renderCalendar();
  if (focusCalendar) {
    const block = showCalendarSplit ? "start" : "center";
    Promise.resolve(renderPromise).then(() => {
      focusCalendarNow({ behavior: "auto", block });
    });
  }
}


export function pushNavigation(filter) {
  state.navStack = state.navStack.slice(0, state.navIndex + 1);
  const snapshot = filter ? { ...filter } : null;
  state.navStack.push(snapshot);
  state.navIndex = state.navStack.length - 1;
}

export function switchView(target, options = {}) {
  const {
    calendarAnchorDate = null,
    focusCalendar = true,
    updateUrl = true,
    historyMode = "push"
  } = options;
  const navButtons = getNavButtons();
  const views = getViews();
  const allowedViews = navButtons.map((btn) => btn.dataset.view);
  const resolvedTarget = allowedViews.includes(target) ? target : "tasks";
  if (domRefs.appShell) {
    domRefs.appShell.dataset.activeView = resolvedTarget;
  }
  const isCalendarSplit = shouldShowCalendarSplit(resolvedTarget);
  const currentView = getActiveViewId(views);
  if (resolvedTarget !== "tasks" && state.zoomFilter) {
    clearZoomFilter({ record: false, updateUrl, historyMode: "replace" });
  }
  applyViewVisibility(views, resolvedTarget, isCalendarSplit);
  updateNavButtonState(navButtons, resolvedTarget);
  if (updateUrl && currentView !== resolvedTarget) {
    updateUrlWithView(resolvedTarget, { replace: historyMode === "replace" });
  }
  updateSplitControls(resolvedTarget, isCalendarSplit);
  updateSplitToggleLabel();
  applyCalendarView(resolvedTarget, isCalendarSplit, calendarAnchorDate, focusCalendar);
}

export function getZoomLabel() {
  if (!state.zoomFilter) {return "";}
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
  const { record = true, updateUrl = true, historyMode = "push" } = options;
  if (getActiveViewId(getViews()) !== "tasks") {
    switchView("tasks", { focusCalendar: false, updateUrl, historyMode });
  }
  state.zoomFilter = filter;
  if (updateUrl) {
    updateUrlWithZoom(filter, { replace: historyMode === "replace" });
  }
  renderTasks(state.tasksCache, state.tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) {pushNavigation(filter);}
}

export function clearZoomFilter(options = {}) {
  const { record = true, updateUrl = true, historyMode = "push" } = options;
  state.zoomFilter = null;
  if (updateUrl) {
    updateUrlWithZoom(null, { replace: historyMode === "replace" });
  }
  renderTasks(state.tasksCache, state.tasksTimeMapsCache);
  renderBreadcrumb();
  if (record) {pushNavigation(null);}
}

export function goHome() {
  clearZoomFilter();
  switchView("tasks");
}

export function applyNavEntry(entry) {
  if (!entry) {
    clearZoomFilter({ record: false, historyMode: "replace" });
    return;
  }
  setZoomFilter(entry, { record: false, historyMode: "replace" });
}

export function goBackInNavigation() {
  if (state.navIndex <= 0) {return false;}
  state.navIndex -= 1;
  applyNavEntry(state.navStack[state.navIndex]);
  return true;
}

export function goForwardInNavigation() {
  if (state.navIndex < 0 || state.navIndex >= state.navStack.length - 1) {return false;}
  state.navIndex += 1;
  applyNavEntry(state.navStack[state.navIndex]);
  return true;
}

export function zoomOutOneLevel() {
  if (!state.zoomFilter) {return;}
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

function buildBreadcrumbCrumbs() {
  const crumbs = [];
  const addSectionCrumb = (sectionId) => {
    if (sectionId === undefined || sectionId === null) {return;}
    const label = sectionId ? getSectionName(sectionId) || "Untitled section" : "No section";
    crumbs.push({
      label,
      onClick: () => setZoomFilter({ type: "section", sectionId: sectionId || "" })
    });
  };
  const addSubsectionCrumb = (sectionId, subsectionId) => {
    if (!subsectionId) {return;}
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
    if (!taskId) {return;}
    const task = state.tasksCache.find((t) => t.id === taskId);
    if (!task) {return;}
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
      addTaskCrumb(
        state.zoomFilter.taskId,
        state.zoomFilter.sectionId,
        state.zoomFilter.subsectionId
      );
    }
  }
  return crumbs;
}

export function renderBreadcrumb() {
  const navBreadcrumb = domRefs.navBreadcrumb;
  if (!navBreadcrumb) {return;}
  navBreadcrumb.innerHTML = "";
  const crumbs = buildBreadcrumbCrumbs();
  navBreadcrumb.__crumbs = crumbs;
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
    btn.dataset.crumbIndex = String(idx);
    btn.setAttribute("data-test-skedpal", "breadcrumb-link");
    btn.addEventListener("click", handleBreadcrumbClick);
    wrapper.appendChild(btn);
  });
  navBreadcrumb.appendChild(wrapper);
}

function handleBreadcrumbClick(event) {
  event.preventDefault();
  const btn = event.currentTarget;
  const navBreadcrumb = domRefs.navBreadcrumb;
  const index = Number(btn?.dataset?.crumbIndex);
  const crumb = navBreadcrumb?.__crumbs?.[index];
  crumb?.onClick?.();
}

export function applyNavigationFromUrl() {
  const view = parseViewFromUrl("tasks");
  const calendarView = parseCalendarViewFromUrl(state.calendarViewMode || "day");
  if (view === "calendar" && calendarView !== state.calendarViewMode) {
    state.calendarViewMode = calendarView;
  }
  switchView(view, { focusCalendar: false, updateUrl: false, historyMode: "replace" });
  if (view === "tasks") {
    const zoom = parseZoomFromUrl();
    if (zoom) {
      setZoomFilter(zoom, { record: false, updateUrl: false, historyMode: "replace" });
    } else {
      clearZoomFilter({ record: false, updateUrl: false, historyMode: "replace" });
    }
  } else if (state.zoomFilter) {
    clearZoomFilter({ record: false, updateUrl: false, historyMode: "replace" });
  }
}

export function handleNavigationShortcuts(event) {
  if (isTypingTarget(event.target)) {return;}
  const key = event.key;
  const isBack = key === "BrowserBack";
  const isForward = key === "BrowserForward";
  if (!isBack && !isForward) {return;}
  if (isBack) {
    if (goBackInNavigation()) {event.preventDefault();}
  } else if (isForward) {
    if (goForwardInNavigation()) {event.preventDefault();}
  }
}

export function handleNavigationMouseButtons(event) {
  if (isTypingTarget(event.target)) {return;}
  if (event.button === 3) {
    if (goBackInNavigation()) {event.preventDefault();}
  } else if (event.button === 4) {
    if (goForwardInNavigation()) {event.preventDefault();}
  }
}

export function initViewFromUrl(parseViewFromUrl) {
  const initialView = parseViewFromUrl("tasks");
  switchView(initialView, { historyMode: "replace" });
}
