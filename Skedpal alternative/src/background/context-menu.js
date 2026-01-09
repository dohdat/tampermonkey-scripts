const URL_PATTERN = /https?:\/\/[^\s]+/i;

export function extractUrlFromText(text) {
  const match = String(text || "").match(URL_PATTERN);
  return match ? match[0] : "";
}

function buildTitleFromUrl(rawUrl) {
  if (!rawUrl) {return "";}
  try {
    const url = new URL(rawUrl);
    const trimmedPath = url.pathname.replace(/\/$/, "");
    const base = trimmedPath ? trimmedPath.split("/").pop() : "";
    const title = decodeURIComponent(base || url.hostname || rawUrl);
    return title || rawUrl;
  } catch {
    return rawUrl;
  }
}

function resolveCreateTaskLink(info) {
  return (
    info.linkUrl ||
    extractUrlFromText(info.selectionText) ||
    info.pageUrl ||
    ""
  );
}

function resolveCreateTaskTitle(info, pageTitle) {
  if (info.selectionText) {return info.selectionText;}
  if (pageTitle) {return pageTitle;}
  if (info.linkText) {return info.linkText;}
  return buildTitleFromUrl(info.linkUrl || info.pageUrl || "");
}

export function buildCreateTaskUrl(info = {}, baseUrl = "", pageTitle = "") {
  const url = new URL(baseUrl);
  url.searchParams.set("newTask", "1");
  const title = resolveCreateTaskTitle(info, pageTitle);
  const link = resolveCreateTaskLink(info);
  if (title) {
    url.searchParams.set("title", title);
  }
  if (link) {
    url.searchParams.set("url", link);
  }
  return url.toString();
}
