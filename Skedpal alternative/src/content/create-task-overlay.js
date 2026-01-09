(() => {
  if (typeof window === "undefined") {return;}
  if (window.__skedpalCreateTaskOverlayLoaded) {return;}
  window.__skedpalCreateTaskOverlayLoaded = true;

  const OVERLAY_ID = "skedpal-create-task-overlay";
  const PANEL_ID = "skedpal-create-task-panel";
  const IFRAME_ID = "skedpal-create-task-iframe";
  const CLOSE_ID = "skedpal-create-task-close";
  const STATE_KEY = "__skedpalCreateTaskOverlayState__";

  function setDataTestAttr(node, value) {
    if (!node) {return;}
    node.setAttribute("data-test-skedpal", value);
  }

  function applyOverlayLayout(overlay) {
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "stretch";
    overlay.style.justifyContent = "flex-end";
    overlay.style.pointerEvents = "auto";
  }

  function applyPanelLayout(panel) {
    panel.style.position = "relative";
    panel.style.height = "100%";
    panel.style.width = "min(480px, 100%)";
    panel.style.maxWidth = "100%";
    panel.style.boxSizing = "border-box";
  }

  function applyIframeLayout(iframe) {
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
  }

  function applyCloseButtonLayout(button) {
    button.style.position = "absolute";
    button.style.top = "8px";
    button.style.right = "8px";
    button.style.zIndex = "1";
  }

  function clearOverlayState() {
    delete window[STATE_KEY];
  }

  function getOverlayState() {
    return window[STATE_KEY] || null;
  }

  function setOverlayState(state) {
    window[STATE_KEY] = state;
  }

  function createOverlayElements(createTaskUrl) {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    setDataTestAttr(overlay, "create-task-overlay");
    applyOverlayLayout(overlay);

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    setDataTestAttr(panel, "create-task-panel");
    applyPanelLayout(panel);

    const closeButton = document.createElement("button");
    closeButton.id = CLOSE_ID;
    closeButton.type = "button";
    closeButton.textContent = "Close";
    setDataTestAttr(closeButton, "create-task-close");
    applyCloseButtonLayout(closeButton);

    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.title = "Skedpal create task";
    iframe.loading = "eager";
    iframe.src = createTaskUrl;
    setDataTestAttr(iframe, "create-task-iframe");
    applyIframeLayout(iframe);

    panel.appendChild(closeButton);
    panel.appendChild(iframe);
    overlay.appendChild(panel);

    return { overlay, closeButton, iframe };
  }

  function setupOverlayHandlers({ overlay, closeButton, iframe, onCleanup }) {
    let closed = false;
    let focusRestoreTimer = null;

    function cleanup() {
      if (closed) {return;}
      closed = true;
      overlay.removeEventListener("click", handleOverlayClick);
      closeButton.removeEventListener("click", handleCloseClick);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focusin", handleFocusIn, true);
      window.removeEventListener("focus", handleFocusIn, true);
      if (focusRestoreTimer) {
        clearTimeout(focusRestoreTimer);
        focusRestoreTimer = null;
      }
      iframe.src = "about:blank";
      overlay.remove();
      onCleanup();
    }

    function handleCloseClick() {
      cleanup();
    }

    function handleOverlayClick(event) {
      if (event?.target !== overlay) {return;}
      cleanup();
    }

    function handleKeydown(event) {
      if (event.key !== "Escape") {return;}
      cleanup();
    }

    function handleMessage(event) {
      if (!event || !event.data || event.data.type !== "skedpal:create-task-close") {return;}
      if (iframe.contentWindow && event.source && event.source !== iframe.contentWindow) {return;}
      cleanup();
    }

    function handleFocusIn(event) {
      if (event?.target !== iframe) {return;}
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
      if (focusRestoreTimer) {
        clearTimeout(focusRestoreTimer);
      }
      focusRestoreTimer = setTimeout(() => {
        focusRestoreTimer = null;
        if (closed) {return;}
        if (document.activeElement === iframe) {return;}
        iframe.focus?.();
      }, 0);
    }

    overlay.addEventListener("click", handleOverlayClick);
    closeButton.addEventListener("click", handleCloseClick);
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("message", handleMessage);
    window.addEventListener("focusin", handleFocusIn, true);
    window.addEventListener("focus", handleFocusIn, true);

    return {
      cleanup,
      updateUrl: (url) => {
        iframe.src = url;
      }
    };
  }

  function createOverlay(createTaskUrl) {
    const { overlay, closeButton, iframe } = createOverlayElements(createTaskUrl);
    const { cleanup, updateUrl } = setupOverlayHandlers({
      overlay,
      closeButton,
      iframe,
      onCleanup: clearOverlayState
    });
    return { overlay, iframe, cleanup, updateUrl };
  }

  function openCreateTaskOverlay(createTaskUrl) {
    if (!createTaskUrl) {return false;}
    const existing = document.getElementById(OVERLAY_ID);
    const state = getOverlayState();
    if (existing && state?.updateUrl) {
      state.updateUrl(createTaskUrl);
      return true;
    }
    if (!document.body) {return false;}
    if (state?.cleanup) {
      state.cleanup();
    }
    const { overlay, cleanup, updateUrl } = createOverlay(createTaskUrl);
    document.body.appendChild(overlay);
    setOverlayState({ cleanup, updateUrl });
    return true;
  }

  function closeCreateTaskOverlay() {
    const state = getOverlayState();
    if (!state?.cleanup) {return false;}
    state.cleanup();
    return true;
  }

  window.skedpalCreateTaskOverlayOpen = openCreateTaskOverlay;
  window.skedpalCreateTaskOverlayClose = closeCreateTaskOverlay;
})();
