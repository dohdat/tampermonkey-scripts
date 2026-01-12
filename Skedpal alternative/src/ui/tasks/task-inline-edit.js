import { saveTask } from "../../data/db.js";
import { INDEX_NOT_FOUND, TASK_TITLE_MAX_LENGTH } from "../constants.js";
import { state } from "../state/page-state.js";
import { loadTasks } from "./tasks-actions.js";

function cleanupInlineTitleEdit() {
  if (typeof state.taskTitleEditCleanup !== "function") {return;}
  state.taskTitleEditCleanup();
  state.taskTitleEditCleanup = null;
}

function restoreInlineTitle(titleEl, originalTitle) {
  if (!titleEl) {return;}
  const prevDisplay = titleEl.dataset.inlineEditingDisplay;
  const prevOverflow = titleEl.dataset.inlineEditingOverflow;
  const prevMaxHeight = titleEl.dataset.inlineEditingMaxHeight;
  const prevLineClamp = titleEl.dataset.inlineEditingLineClamp;
  const prevBoxOrient = titleEl.dataset.inlineEditingBoxOrient;
  titleEl.style.display = prevDisplay || "";
  titleEl.style.overflow = prevOverflow || "";
  titleEl.style.maxHeight = prevMaxHeight || "";
  titleEl.style.webkitLineClamp = prevLineClamp || "";
  titleEl.style.webkitBoxOrient = prevBoxOrient || "";
  delete titleEl.dataset.inlineEditingDisplay;
  delete titleEl.dataset.inlineEditingOverflow;
  delete titleEl.dataset.inlineEditingMaxHeight;
  delete titleEl.dataset.inlineEditingLineClamp;
  delete titleEl.dataset.inlineEditingBoxOrient;
  titleEl.textContent = originalTitle;
  delete titleEl.dataset.inlineEditing;
  delete titleEl.dataset.inlineEditingTaskId;
}

function getInputClickX(input, clientX) {
  if (!input || !Number.isFinite(clientX)) {return null;}
  const rect = input.getBoundingClientRect();
  const styles = window.getComputedStyle(input);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const scrollLeft = input.scrollLeft || 0;
  return clientX - rect.left - paddingLeft + scrollLeft;
}

function getTextMeasureContext(input) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {return null;}
  const styles = window.getComputedStyle(input);
  ctx.font =
    styles.font ||
    `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  return ctx;
}

function resolveCaretIndexFromPoint(input, clientX) {
  const clickX = getInputClickX(input, clientX);
  if (clickX === null) {return INDEX_NOT_FOUND;}
  if (clickX <= 0) {return 0;}
  const ctx = getTextMeasureContext(input);
  if (!ctx) {return INDEX_NOT_FOUND;}
  const text = input.value || "";
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (width >= clickX) {
      return i;
    }
  }
  return text.length;
}

function applyInlineTitleCaret(input, clientX) {
  if (!input) {return;}
  const fallbackIndex = input.value.length;
  const caretIndex = resolveCaretIndexFromPoint(input, clientX);
  const safeIndex = caretIndex === INDEX_NOT_FOUND ? fallbackIndex : caretIndex;
  input.setSelectionRange(safeIndex, safeIndex);
}

function applyInlineTitleEditingStyles(titleEl) {
  if (!titleEl) {return;}
  titleEl.dataset.inlineEditingDisplay = titleEl.style.display || "";
  titleEl.dataset.inlineEditingOverflow = titleEl.style.overflow || "";
  titleEl.dataset.inlineEditingMaxHeight = titleEl.style.maxHeight || "";
  titleEl.dataset.inlineEditingLineClamp = titleEl.style.webkitLineClamp || "";
  titleEl.dataset.inlineEditingBoxOrient = titleEl.style.webkitBoxOrient || "";
  titleEl.style.display = "block";
  titleEl.style.overflow = "visible";
  titleEl.style.maxHeight = "none";
  titleEl.style.webkitLineClamp = "unset";
  titleEl.style.webkitBoxOrient = "unset";
}

function startInlineTitleEdit(titleEl, task, options = {}) {
  if (!titleEl || !task) {return;}
  cleanupInlineTitleEdit();
  const originalTitle = task.title || "";
  applyInlineTitleEditingStyles(titleEl);
  const input = document.createElement("input");
  input.type = "text";
  input.value = originalTitle;
  input.className =
    "w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 focus:border-lime-400 focus:outline-none";
  input.maxLength = TASK_TITLE_MAX_LENGTH;
  input.setAttribute("data-test-skedpal", "task-title-inline-input");
  titleEl.dataset.inlineEditing = "true";
  titleEl.dataset.inlineEditingTaskId = task.id;
  titleEl.textContent = "";
  titleEl.appendChild(input);

  let isDone = false;

  async function finishInlineEdit(shouldSave) {
    if (isDone) {return;}
    isDone = true;
    input.removeEventListener("keydown", handleInlineTitleKeydown);
    input.removeEventListener("blur", handleInlineTitleBlur);
    input.removeEventListener("pointerdown", handleInlineTitlePointerDown);
    cleanupInlineTitleEdit();
    if (!shouldSave) {
      restoreInlineTitle(titleEl, originalTitle);
      return;
    }
    const nextTitle = input.value.trim().slice(0, TASK_TITLE_MAX_LENGTH);
    if (!nextTitle || nextTitle === originalTitle) {
      restoreInlineTitle(titleEl, originalTitle);
      return;
    }
    await saveTask({ ...task, title: nextTitle });
    await loadTasks();
  }

  function handleInlineTitleKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      finishInlineEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishInlineEdit(false);
    }
  }

  function handleInlineTitleBlur() {
    finishInlineEdit(true);
  }

  function handleInlineTitlePointerDown(event) {
    if (event.target !== input) {return;}
    applyInlineTitleCaret(input, event.clientX);
  }

  input.addEventListener("keydown", handleInlineTitleKeydown);
  input.addEventListener("blur", handleInlineTitleBlur);
  input.addEventListener("pointerdown", handleInlineTitlePointerDown);

  state.taskTitleEditCleanup = () => {
    if (!isDone) {
      finishInlineEdit(false);
    }
  };

  input.focus();
  applyInlineTitleCaret(input, options.clientX);
}

export function handleTaskTitleDoubleClick(event) {
  const titleEl = event.target.closest?.('[data-test-skedpal="task-title"]');
  if (!titleEl) {return;}
  if (event.target.closest?.("a")) {return;}
  const card = titleEl.closest?.("[data-task-id]");
  const taskId = card?.dataset?.taskId || "";
  if (!taskId) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task || task.link) {return;}
  if (titleEl.dataset.inlineEditing === "true") {return;}
  startInlineTitleEdit(titleEl, task, { clientX: event.clientX });
}
