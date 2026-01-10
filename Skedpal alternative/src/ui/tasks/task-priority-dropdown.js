const PRIORITY_META = {
  "5": { label: "Critical", meta: "(Urgent)" },
  "4": { label: "High", meta: "(Important)" },
  "3": { label: "Medium", meta: "(Normal)" },
  "2": { label: "Low", meta: "(Can wait)" },
  "1": { label: "Very Low", meta: "(Minimal)" }
};

let taskPriorityDropdownCleanup = null;

function resolvePriorityDropdown() {
  const wrap = document.querySelector('[data-test-skedpal="task-priority-dropdown"]');
  if (!wrap) {return null;}
  const trigger = wrap.querySelector('[data-test-skedpal="task-priority-trigger"]');
  const menu = wrap.querySelector('[data-test-skedpal="task-priority-menu"]');
  const select = wrap.querySelector("#task-priority");
  if (!trigger || !menu || !select) {return null;}
  return { wrap, trigger, menu, select };
}

function setMenuOpen(nodes, open) {
  nodes.menu.classList.toggle("hidden", !open);
  nodes.trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function setOptionSelected(option, selected) {
  option.setAttribute("aria-selected", selected ? "true" : "false");
  option.classList.toggle("priority-dropdown__option--active", selected);
}

function updateTriggerFromValue(nodes, value) {
  const option = nodes.menu.querySelector(`[data-value="${value}"]`);
  if (!option) {return;}
  const fallback = PRIORITY_META[value] || PRIORITY_META["3"];
  const label = option.querySelector(".priority-dropdown__label")?.textContent || fallback.label;
  const meta = option.querySelector(".priority-dropdown__meta")?.textContent || fallback.meta;
  const iconMarkup = option.querySelector(".priority-dropdown__icon")?.innerHTML || "";
  const triggerIcon = nodes.trigger.querySelector('[data-test-skedpal="task-priority-trigger-icon"]');
  const triggerLabel = nodes.trigger.querySelector('[data-test-skedpal="task-priority-trigger-label"]');
  const triggerMeta = nodes.trigger.querySelector('[data-test-skedpal="task-priority-trigger-meta"]');
  const triggerValue = nodes.trigger.querySelector('[data-test-skedpal="task-priority-trigger-value"]');
  if (triggerIcon) {triggerIcon.innerHTML = iconMarkup;}
  if (triggerLabel) {triggerLabel.textContent = label;}
  if (triggerMeta) {triggerMeta.textContent = meta;}
  if (triggerValue) {triggerValue.textContent = value;}
  nodes.wrap.dataset.priority = value;
  const options = [...nodes.menu.querySelectorAll(".priority-dropdown__option")];
  options.forEach((opt) => {
    setOptionSelected(opt, opt.dataset.value === value);
  });
}

function handleTriggerClick(event) {
  const btn = event?.currentTarget;
  const wrap = btn?.closest?.('[data-test-skedpal="task-priority-dropdown"]');
  if (!wrap) {return;}
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return;}
  const open = nodes.trigger.getAttribute("aria-expanded") === "true";
  setMenuOpen(nodes, !open);
}

function handleOptionClick(event) {
  const option = event?.currentTarget;
  const wrap = option?.closest?.('[data-test-skedpal="task-priority-dropdown"]');
  if (!wrap) {return;}
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return;}
  const value = option.dataset.value || "";
  if (!value) {return;}
  nodes.select.value = value;
  nodes.select.dispatchEvent(new Event("change", { bubbles: true }));
  updateTriggerFromValue(nodes, value);
  setMenuOpen(nodes, false);
}

function handleSelectChange(event) {
  const select = event?.currentTarget;
  const wrap = select?.closest?.('[data-test-skedpal="task-priority-dropdown"]');
  if (!wrap) {return;}
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return;}
  updateTriggerFromValue(nodes, select.value);
}

function handleDocumentClick(event) {
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return;}
  if (nodes.wrap.contains(event.target)) {return;}
  setMenuOpen(nodes, false);
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape") {return;}
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return;}
  setMenuOpen(nodes, false);
}

function setupPriorityDropdown(nodes) {
  const cleanupFns = [];
  nodes.wrap.dataset.priority = nodes.select.value || "3";
  updateTriggerFromValue(nodes, nodes.select.value || "3");
  const options = [...nodes.menu.querySelectorAll(".priority-dropdown__option")];

  nodes.trigger.addEventListener("click", handleTriggerClick);
  cleanupFns.push(() => nodes.trigger.removeEventListener("click", handleTriggerClick));
  options.forEach((option) => {
    option.addEventListener("click", handleOptionClick);
    cleanupFns.push(() => option.removeEventListener("click", handleOptionClick));
  });
  nodes.select.addEventListener("change", handleSelectChange);
  cleanupFns.push(() => nodes.select.removeEventListener("change", handleSelectChange));
  document.addEventListener("click", handleDocumentClick);
  cleanupFns.push(() => document.removeEventListener("click", handleDocumentClick));
  document.addEventListener("keydown", handleDocumentKeydown);
  cleanupFns.push(() => document.removeEventListener("keydown", handleDocumentKeydown));

  function handlePageHide() {
    cleanupTaskPriorityDropdown();
  }
  window.addEventListener("pagehide", handlePageHide);
  cleanupFns.push(() => window.removeEventListener("pagehide", handlePageHide));

  return cleanupFns;
}

export function initTaskPriorityDropdown() {
  if (taskPriorityDropdownCleanup) {return taskPriorityDropdownCleanup;}
  const nodes = resolvePriorityDropdown();
  if (!nodes) {return () => {};}
  const cleanupFns = setupPriorityDropdown(nodes);
  taskPriorityDropdownCleanup = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
    taskPriorityDropdownCleanup = null;
  };
  return taskPriorityDropdownCleanup;
}

export function cleanupTaskPriorityDropdown() {
  if (!taskPriorityDropdownCleanup) {return;}
  taskPriorityDropdownCleanup();
}

export function getPriorityMeta(value) {
  return PRIORITY_META[value] || PRIORITY_META["3"];
}
