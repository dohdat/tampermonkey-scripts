import { state } from "../state/page-state.js";

function cleanupTaskMenuListeners() {
  if (typeof state.taskMenuCleanup !== "function") {return;}
  state.taskMenuCleanup();
  state.taskMenuCleanup = null;
  state.taskMenuOpenId = "";
}

function createTaskMenuHandlers(taskId, options = {}) {
  const scopedMenu = options.menu || null;
  const scopedToggle = options.toggleBtn || null;
  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {return false;}
    if (target.isContentEditable) {return true;}
    const tag = target.tagName?.toLowerCase?.();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function getMenuActionButton(menu, key) {
    const keyMap = {
      e: "task-menu-edit",
      b: "task-menu-bulk-edit",
      d: "task-menu-duplicate",
      r: "task-menu-remind",
      a: "task-menu-add-subtask",
      x: "task-menu-delete"
    };
    const testAttr = keyMap[key];
    if (!testAttr) {return null;}
    return menu.querySelector?.(`[data-test-skedpal="${testAttr}"]`) || null;
  }

  function onTaskMenuPointerDown(event) {
    const menu = scopedMenu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
    const toggleBtn =
      scopedToggle || document.querySelector?.(`[data-task-menu-toggle="${taskId}"]`);
    const target = event.target;
    if (!menu || !toggleBtn) {
      closeTaskActionMenus();
      return;
    }
    if (menu.contains(target) || toggleBtn.contains(target)) {return;}
    closeTaskActionMenus();
  }

  function onTaskMenuKeyDown(event) {
    if (isEditableTarget(event.target)) {return;}
    const key = event.key.toLowerCase();
    const menu = scopedMenu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
    if (!menu || menu.classList.contains("hidden")) {return;}
    if (key === "escape") {
      closeTaskActionMenus();
      return;
    }
    const actionButton = getMenuActionButton(menu, key);
    if (!actionButton) {return;}
    event.preventDefault();
    actionButton.click();
  }

  return { onTaskMenuPointerDown, onTaskMenuKeyDown };
}

function setupTaskMenuListeners(taskId, options = {}) {
  if (!taskId) {return;}
  cleanupTaskMenuListeners();
  const { onTaskMenuPointerDown, onTaskMenuKeyDown } = createTaskMenuHandlers(taskId, options);
  document.addEventListener("pointerdown", onTaskMenuPointerDown, true);
  document.addEventListener("keydown", onTaskMenuKeyDown);
  state.taskMenuCleanup = () => {
    document.removeEventListener("pointerdown", onTaskMenuPointerDown, true);
    document.removeEventListener("keydown", onTaskMenuKeyDown);
  };
  state.taskMenuOpenId = taskId;
}

function toggleTaskActionMenu(taskId, options = {}) {
  if (!taskId) {return;}
  const menu = options.menu || document.querySelector?.(`[data-task-menu="${taskId}"]`);
  if (!menu) {return;}
  const actionsWrap = menu.closest?.(".task-actions-wrap");
  const willShow = menu.classList.contains("hidden");
  closeTaskActionMenus(taskId);
  menu.classList.toggle("hidden", !willShow);
  actionsWrap?.classList.toggle("task-actions-menu-open", willShow);
  if (willShow) {
    setupTaskMenuListeners(taskId, options);
  } else {
    cleanupTaskMenuListeners();
  }
}

export function closeTaskActionMenus(exceptTaskId = "") {
  const menus = document.querySelectorAll?.("[data-task-menu]") || [];
  menus.forEach((menu) => {
    if (exceptTaskId && menu.dataset.taskMenu === exceptTaskId) {return;}
    menu.classList.add("hidden");
    menu.closest?.(".task-actions-wrap")?.classList.remove("task-actions-menu-open");
  });
  if (!exceptTaskId || state.taskMenuOpenId !== exceptTaskId) {
    cleanupTaskMenuListeners();
  }
}

function handleMenuToggleAction(action) {
  if (action.taskMenuToggleId === undefined) {return false;}
  toggleTaskActionMenu(action.taskMenuToggleId);
  return true;
}

function handleMenuToggleActionForButton(btn) {
  const taskId = btn?.dataset?.taskMenuToggle || "";
  if (!taskId) {return false;}
  const card = btn.closest?.('[data-test-skedpal="task-card"]');
  const scopedMenu = card?.querySelector?.(`[data-task-menu="${taskId}"]`) || null;
  if (scopedMenu) {
    toggleTaskActionMenu(taskId, { menu: scopedMenu, toggleBtn: btn });
    return true;
  }
  toggleTaskActionMenu(taskId);
  return true;
}

export function handleTaskMenuToggle(action, btn) {
  if (action.taskMenuToggleId === undefined) {return false;}
  if (handleMenuToggleActionForButton(btn)) {return true;}
  return handleMenuToggleAction(action);
}
