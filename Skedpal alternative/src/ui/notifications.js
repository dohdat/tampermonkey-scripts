import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";

function getNotificationNodes() {
  return {
    banner: document.getElementById("notification-banner") || domRefs.notificationBanner,
    message: document.getElementById("notification-message") || domRefs.notificationMessage,
    undoButton: document.getElementById("notification-undo") || domRefs.notificationUndoButton
  };
}

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
  const { banner, undoButton } = getNotificationNodes();
  banner?.classList?.add("hidden");
  if (undoButton) {
    undoButton.disabled = false;
  }
  state.notificationUndoHandler = null;
}

export function showUndoBanner(message, undoHandler) {
  const { banner, message: messageNode, undoButton } = getNotificationNodes();
  if (!banner || !messageNode || !undoButton) return;
  hideNotificationBanner();
  messageNode.textContent = message;
  state.notificationUndoHandler = undoHandler;
  banner.classList?.remove("hidden");
  undoButton.disabled = false;
  undoButton.onclick = async () => {
    undoButton.disabled = true;
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
