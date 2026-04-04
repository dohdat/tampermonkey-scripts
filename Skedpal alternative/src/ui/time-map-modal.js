function isModalOpen(modal) {
  return Boolean(modal && !modal.classList.contains("hidden"));
}

function dismissOnOverlayClick(event, getModal, onDismiss) {
  const modal = getModal?.();
  if (!modal || event.target !== modal) {return;}
  onDismiss?.();
}

function dismissOnEscape(event, getModal, onDismiss) {
  if (event.key !== "Escape") {return;}
  const modal = getModal?.();
  if (!isModalOpen(modal)) {return;}
  onDismiss?.();
}

export function showTimeMapModal(modal, panel) {
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
  if (panel) {
    panel.classList.remove("hidden");
  }
  document.body?.classList?.add("modal-open");
}

export function hideTimeMapModal(modal, panel) {
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
  if (panel) {
    panel.classList.add("hidden");
  }
  document.body?.classList?.remove("modal-open");
}

export function initTimeMapModalInteractions({ getModal, onDismiss }) {
  if (typeof document?.addEventListener !== "function") {
    return () => {};
  }
  function handleOverlayClick(event) {
    dismissOnOverlayClick(event, getModal, onDismiss);
  }
  function handleEscapeKeydown(event) {
    dismissOnEscape(event, getModal, onDismiss);
  }
  const modal = getModal?.();
  if (modal) {
    modal.addEventListener("click", handleOverlayClick);
  }
  document.addEventListener("keydown", handleEscapeKeydown);
  return () => {
    if (modal) {
      modal.removeEventListener("click", handleOverlayClick);
    }
    document.removeEventListener("keydown", handleEscapeKeydown);
  };
}
