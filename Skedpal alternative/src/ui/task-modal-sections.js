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

function toggleSectionCollapsed(section) {
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

function handleSectionToggleClick(event) {
  const btn = event?.currentTarget;
  const section = btn?.closest?.('[data-collapsible="true"]');
  toggleSectionCollapsed(section);
}

function handleSectionHeaderClick(event) {
  const header = event?.currentTarget;
  const target = event?.target;
  if (!header) {return;}
  if (target?.closest?.(".task-modal__section-toggle")) {return;}
  if (target?.closest?.("button, a, input, textarea, select")) {return;}
  const section = header.closest?.('[data-collapsible="true"]');
  toggleSectionCollapsed(section);
}

function setupTaskModalSectionToggles(form) {
  const cleanupFns = [];
  const sections = [...form.querySelectorAll('[data-collapsible="true"]')];
  sections.forEach((section) => {
    syncSectionState(section);
    const toggle = section.querySelector(".task-modal__section-toggle");
    const header = section.querySelector(".task-modal__section-header");
    if (!toggle) {return;}
    toggle.addEventListener("click", handleSectionToggleClick);
    cleanupFns.push(() => toggle.removeEventListener("click", handleSectionToggleClick));
    if (header) {
      header.addEventListener("click", handleSectionHeaderClick);
      cleanupFns.push(() => header.removeEventListener("click", handleSectionHeaderClick));
    }
  });
  return cleanupFns;
}

export function resetTaskModalSections() {
  const form = resolveTaskModalForm();
  if (!form) {return;}
  const sections = [...form.querySelectorAll('[data-collapsible="true"]')];
  const defaultSection = form.querySelector('[data-test-skedpal="task-modal-section-time"]');
  sections.forEach((section) => {
    setSectionCollapsed(section, section !== defaultSection);
  });
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
