import { domRefs } from "./constants.js";
import { state } from "./page-state.js";

const { notificationBanner, notificationMessage, notificationUndoButton } = domRefs;

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (!tag) return false;
  const name = tag.toLowerCase();
  return (
    target.isContentEditable ||
    name === "input" ||
    name === "textarea" ||
    name === "select" ||
    name === "option"
  );
}

export function hideNotificationBanner() {
  if (state.notificationHideTimeout) {
    clearTimeout(state.notificationHideTimeout);
    state.notificationHideTimeout = null;
  }
  notificationBanner?.classList.add("hidden");
  if (notificationUndoButton) {
    notificationUndoButton.disabled = false;
  }
  state.notificationUndoHandler = null;
}

export function showUndoBanner(message, undoHandler) {
  if (!notificationBanner || !notificationMessage || !notificationUndoButton) return;
  hideNotificationBanner();
  notificationMessage.textContent = message;
  state.notificationUndoHandler = undoHandler;
  notificationBanner.classList.remove("hidden");
  notificationUndoButton.disabled = false;
  notificationUndoButton.onclick = async () => {
    notificationUndoButton.disabled = true;
    try {
      await state.notificationUndoHandler?.();
    } catch (error) {
      console.error("Undo failed", error);
    }
    hideNotificationBanner();
  };
  state.notificationHideTimeout = window.setTimeout(() => {
    hideNotificationBanner();
  }, 6500);
}
