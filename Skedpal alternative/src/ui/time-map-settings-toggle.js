import { domRefs } from "./constants.js";

export function initTimeMapSectionToggle() {
  const { timeMapSectionToggleBtn, timeMapSectionContent } = domRefs;
  if (!timeMapSectionToggleBtn || !timeMapSectionContent) {return () => {};}
  const setCollapsed = (collapsed) => {
    timeMapSectionContent.classList.toggle("hidden", collapsed);
    timeMapSectionToggleBtn.textContent = collapsed ? "Expand" : "Collapse";
    timeMapSectionToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    timeMapSectionToggleBtn.dataset.collapsed = collapsed ? "true" : "false";
  };
  const handleToggleClick = () => {
    const collapsed = timeMapSectionContent.classList.contains("hidden");
    setCollapsed(!collapsed);
  };
  setCollapsed(timeMapSectionContent.classList.contains("hidden"));
  timeMapSectionToggleBtn.addEventListener("click", handleToggleClick);
  return () => {
    timeMapSectionToggleBtn.removeEventListener("click", handleToggleClick);
  };
}
