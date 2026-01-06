async function loadPartial(targetId, url) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  target.innerHTML = await response.text();
}

(async () => {
  try {
    await Promise.all([
      loadPartial("app-shell-root", "./partials/app-shell.html"),
      loadPartial("modals-root", "./partials/modals.html")
    ]);
    await import("../src/ui/page.js");
  } catch (error) {
    console.error("Failed to bootstrap SkedPal page", error);
  }
})();
