export function getActiveViewId(views = []) {
  const activeView = views.find((view) => !view?.classList?.contains?.("hidden"));
  return activeView?.id || "";
}

export function shouldResetScroll(previousView, nextView) {
  return previousView === "calendar" && nextView === "tasks";
}

export function resolveCalendarAnchorDate(
  calendarAnchorDate,
  resolvedTarget,
  isCalendarSplit,
  currentView
) {
  if (calendarAnchorDate !== null && calendarAnchorDate !== undefined) {
    return calendarAnchorDate;
  }
  if (
    resolvedTarget === "tasks" &&
    isCalendarSplit &&
    currentView &&
    currentView !== "tasks"
  ) {
    return new Date();
  }
  return null;
}
