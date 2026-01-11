export function getActiveViewId(views = []) {
  const activeView = views.find((view) => !view?.classList?.contains?.("hidden"));
  return activeView?.id || "";
}

export function shouldResetScroll(previousView, nextView) {
  return previousView === "calendar" && nextView === "tasks";
}
