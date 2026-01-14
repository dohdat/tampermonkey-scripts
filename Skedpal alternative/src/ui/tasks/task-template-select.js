import { SORT_AFTER, domRefs } from "../constants.js";
import { state } from "../state/page-state.js";

function getTemplateTitle(template) {
  return template?.title || "Untitled template";
}

const SORT_BEFORE = -1;

function getTemplateOrder(template) {
  const order = Number(template?.order);
  return Number.isFinite(order) ? order : null;
}

function sortTemplates(list) {
  return [...list].sort((a, b) => {
    const orderA = getTemplateOrder(a);
    const orderB = getTemplateOrder(b);
    if (orderA !== null && orderB !== null && orderA !== orderB) {
      return orderA - orderB;
    }
    if (orderA !== null && orderB === null) {return SORT_BEFORE;}
    if (orderA === null && orderB !== null) {return SORT_AFTER;}
    return getTemplateTitle(a).localeCompare(getTemplateTitle(b));
  });
}

function buildPlaceholderOption() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a template...";
  placeholder.selected = true;
  placeholder.disabled = true;
  placeholder.setAttribute("data-test-skedpal", "task-template-select-placeholder");
  return placeholder;
}

function buildEmptyOption() {
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No templates available";
  empty.disabled = true;
  empty.setAttribute("data-test-skedpal", "task-template-select-empty");
  return empty;
}

function buildTemplateOption(template) {
  const option = document.createElement("option");
  option.value = template.id || "";
  option.textContent = getTemplateTitle(template);
  option.setAttribute("data-test-skedpal", "task-template-select-option");
  return option;
}

function renderTemplateSelect(select, templates) {
  select.innerHTML = "";
  select.appendChild(buildPlaceholderOption());
  if (!templates.length) {
    select.appendChild(buildEmptyOption());
    return;
  }
  sortTemplates(templates).forEach((template) => {
    select.appendChild(buildTemplateOption(template));
  });
  select.value = "";
}

export function initTaskTemplateSelect() {
  const select = domRefs.taskTemplateSelect;
  if (!select) {return () => {};}

  const handleTemplatesUpdated = () => {
    renderTemplateSelect(select, state.taskTemplatesCache || []);
  };
  const handleTemplatesLoaded = () => {
    renderTemplateSelect(select, state.taskTemplatesCache || []);
  };

  const handleChange = () => {
    if (state.taskFormMode?.type) {
      select.value = "";
    }
  };

  renderTemplateSelect(select, state.taskTemplatesCache || []);
  select.addEventListener("change", handleChange);
  window.addEventListener("skedpal:templates-updated", handleTemplatesUpdated);
  window.addEventListener("skedpal:templates-loaded", handleTemplatesLoaded);

  return () => {
    select.removeEventListener("change", handleChange);
    window.removeEventListener("skedpal:templates-updated", handleTemplatesUpdated);
    window.removeEventListener("skedpal:templates-loaded", handleTemplatesLoaded);
  };
}
