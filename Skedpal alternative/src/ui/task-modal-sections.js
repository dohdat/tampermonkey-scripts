let taskModalSectionsCleanup = null;

function resolveTaskModalForm() {
  return document.getElementById("task-form");
}

function setSectionCollapsed(section, collapsed) {
  if (!section) {return;}
  section.dataset.collapsed = collapsed ? "true" : "false";
  const toggle = section.querySelector(".task-modal__section-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  const content = section.querySelector(".task-modal__section-content");
  if (content) {
    content.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }
}

function syncSectionState(section) {
  const collapsed = section?.dataset?.collapsed === "true";
  setSectionCollapsed(section, collapsed);
}

function handleSectionToggleClick(event) {
  const btn = event?.currentTarget;
  const section = btn?.closest?.('[data-collapsible="true"]');
  if (!section) {return;}
  const collapsed = section.dataset.collapsed === "true";
  const container = section.closest("form") || section.parentElement;
  const siblings = container
    ? [...container.querySelectorAll('[data-collapsible="true"]')]
    : [];
  if (collapsed) {
    siblings.forEach((candidate) => {
      if (candidate !== section) {
        setSectionCollapsed(candidate, true);
      }
    });
  }
  setSectionCollapsed(section, !collapsed);
}

function setupTaskModalSectionToggles(form) {
  const cleanupFns = [];
  const sections = [...form.querySelectorAll('[data-collapsible="true"]')];
  sections.forEach((section) => {
    syncSectionState(section);
    const toggle = section.querySelector(".task-modal__section-toggle");
    if (!toggle) {return;}
    toggle.addEventListener("click", handleSectionToggleClick);
    cleanupFns.push(() => toggle.removeEventListener("click", handleSectionToggleClick));
  });
  return cleanupFns;
}

export function initTaskModalSections() {
  if (taskModalSectionsCleanup) {return taskModalSectionsCleanup;}
  const form = resolveTaskModalForm();
  if (!form) {return () => {};}
  const cleanupFns = setupTaskModalSectionToggles(form);

  function handlePageHide() {
    cleanupTaskModalSections();
  }

  window.addEventListener("pagehide", handlePageHide);
  cleanupFns.push(() => window.removeEventListener("pagehide", handlePageHide));

  taskModalSectionsCleanup = () => {
    cleanupFns.forEach((cleanup) => cleanup());
    cleanupFns.length = 0;
    taskModalSectionsCleanup = null;
  };
  return taskModalSectionsCleanup;
}

export function cleanupTaskModalSections() {
  if (!taskModalSectionsCleanup) {return;}
  taskModalSectionsCleanup();
}
