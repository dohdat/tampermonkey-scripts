import { ENTER_KEY, ESC_KEY, SPACE_KEY } from "../constants.js";
import { domRefs } from "./constants.js";

function setSidebarExpanded(appShell, toggleBtn, isExpanded) {
  if (!appShell || !toggleBtn) {return;}
  if (isExpanded) {
    appShell.dataset.sidebarExpanded = "true";
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.setAttribute("aria-label", "Collapse sidebar");
  } else {
    delete appShell.dataset.sidebarExpanded;
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-label", "Expand sidebar");
  }
}

function handleSidebarToggleClick(appShell, toggleBtn, nextExpanded) {
  const isExpanded = appShell?.dataset?.sidebarExpanded === "true";
  const shouldExpand = typeof nextExpanded === "boolean" ? nextExpanded : !isExpanded;
  setSidebarExpanded(appShell, toggleBtn, shouldExpand);
}

export function initSidebarToggle({
  appShell = domRefs.appShell,
  sidebarToggleBtn = domRefs.sidebarToggleBtn,
  sidebarBackdrop = domRefs.sidebarBackdrop,
  sidebar = domRefs.sidebar
} = {}) {
  if (!appShell || !sidebarToggleBtn) {return () => {};}
  function onToggleClick() {
    handleSidebarToggleClick(appShell, sidebarToggleBtn);
  }
  function onBackdropClick() {
    handleSidebarToggleClick(appShell, sidebarToggleBtn, false);
  }
  function onBackdropKeydown(event) {
    if (event.key !== ENTER_KEY && event.key !== SPACE_KEY && event.key !== ESC_KEY) {return;}
    event.preventDefault();
    handleSidebarToggleClick(appShell, sidebarToggleBtn, false);
  }
  function onSidebarClick() {
    handleSidebarToggleClick(appShell, sidebarToggleBtn, false);
  }
  sidebarToggleBtn.addEventListener("click", onToggleClick);
  sidebarBackdrop?.addEventListener("click", onBackdropClick);
  sidebarBackdrop?.addEventListener("keydown", onBackdropKeydown);
  sidebar?.addEventListener("click", onSidebarClick);
  setSidebarExpanded(appShell, sidebarToggleBtn, appShell.dataset.sidebarExpanded === "true");
  return () => {
    sidebarToggleBtn.removeEventListener("click", onToggleClick);
    sidebarBackdrop?.removeEventListener("click", onBackdropClick);
    sidebarBackdrop?.removeEventListener("keydown", onBackdropKeydown);
    sidebar?.removeEventListener("click", onSidebarClick);
  };
}
