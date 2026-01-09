export function requestCreateTaskOverlayClose() {
  if (typeof window === "undefined") {return false;}
  if (!window.parent || window.parent === window) {return false;}
  try {
    window.parent.postMessage({ type: "skedpal:create-task-close" }, "*");
    return true;
  } catch (error) {
    console.warn("Failed to request overlay close.", error);
    return false;
  }
}
