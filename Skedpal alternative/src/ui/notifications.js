import { SIX_THOUSAND_FIVE_HUNDRED, domRefs } from "./constants.js";
import { state } from "./state/page-state.js";

function getNotificationNodes() {
  return {
    banner: document.getElementById("notification-banner") || domRefs.notificationBanner,
    message: document.getElementById("notification-message") || domRefs.notificationMessage,
    undoButton: document.getElementById("notification-undo") || domRefs.notificationUndoButton,
    closeButton: document.getElementById("notification-close") || domRefs.notificationCloseButton
  };
}

export function isTypingTarget(target) {
  if (!target) {return false;}
  const tag = target.tagName;
  if (!tag) {return false;}
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
  const { banner, undoButton, closeButton } = getNotificationNodes();
  banner?.classList?.add("hidden");
  if (undoButton) {
    undoButton.disabled = false;
    undoButton.classList?.remove("hidden");
    undoButton.onclick = null;
  }
  if (closeButton) {
    closeButton.classList?.add("hidden");
    closeButton.onclick = null;
  }
  state.notificationUndoHandler = null;
}

export function showUndoBanner(message, undoHandler) {
  const { banner, message: messageNode, undoButton, closeButton } = getNotificationNodes();
  if (!banner || !messageNode || !undoButton) {return;}
  hideNotificationBanner();
  messageNode.textContent = message;
  state.notificationUndoHandler = undoHandler;
  banner.classList?.remove("hidden");
  undoButton.classList?.remove("hidden");
  undoButton.disabled = false;
  if (closeButton) {
    closeButton.classList?.remove("hidden");
    closeButton.onclick = () => {
      hideNotificationBanner();
    };
  }
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
  }, SIX_THOUSAND_FIVE_HUNDRED);
}

export function showNotificationBanner(message, options = {}) {
  const { autoHideMs = 0 } = options;
  const { banner, message: messageNode, undoButton, closeButton } = getNotificationNodes();
  if (!banner || !messageNode) {return;}
  hideNotificationBanner();
  messageNode.textContent = message;
  if (undoButton) {
    undoButton.classList?.add("hidden");
    undoButton.disabled = true;
    undoButton.onclick = null;
  }
  if (closeButton) {
    closeButton.classList?.remove("hidden");
    closeButton.onclick = () => {
      hideNotificationBanner();
    };
  }
  banner.classList?.remove("hidden");
  if (autoHideMs > 0) {
    state.notificationHideTimeout = window.setTimeout(() => {
      hideNotificationBanner();
    }, autoHideMs);
  }
}
