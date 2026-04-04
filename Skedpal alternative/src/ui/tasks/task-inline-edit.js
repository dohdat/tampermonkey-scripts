import { saveTask } from "../../data/db.js";
import {
  GRAMMAR_FIX_SUCCESS_FEEDBACK_MS,
  INDEX_NOT_FOUND,
  TASK_TITLE_MAX_LENGTH,
  grammarSuccessIconSvg,
  sparklesIconSvg
} from "../constants.js";
import {
  buildTitleConversionHighlightsHtml,
  buildTitleUpdateFromInput,
  parseTitleLiteralList,
  pruneTitleLiteralList,
  serializeTitleLiteralList
} from "../title-date-utils.js";
import { state } from "../state/page-state.js";
import { fixTaskTitleGrammar } from "./task-ai.js";

const inlineTitleGrammarSuccessTimers = new WeakMap();
const INLINE_GRAMMAR_DEFAULT_LABEL = "Fix grammar";
const INLINE_GRAMMAR_SUCCESS_LABEL = "Grammar fixed";

export async function applyInlineTitleUpdate(task, update, options = {}) {
  const {
    saveTaskFn = saveTask,
    updateDescendantsFn = null,
    loadTasksFn = null,
    tasksCache = state.tasksCache
  } = options;
  if (!task || !update?.shouldSave) {return null;}
  const updatedTask = {
    ...task,
    title: update.nextTitle,
    deadline: update.nextDeadline,
    startFrom: update.nextStartFrom,
    repeat: update.nextRepeat,
    reminders: Array.isArray(update.nextReminders) ? update.nextReminders : task.reminders
  };
  await saveTaskFn(updatedTask);
  const hasChildren = Array.isArray(tasksCache) &&
    tasksCache.some((entry) => entry?.subtaskParentId === task.id);
  if (hasChildren && typeof updateDescendantsFn === "function") {
    await updateDescendantsFn(task.id, updatedTask);
  }
  if (typeof loadTasksFn === "function") {
    await loadTasksFn();
  }
  return updatedTask;
}

function cleanupInlineTitleEdit() {
  if (typeof state.taskTitleEditCleanup !== "function") {return;}
  state.taskTitleEditCleanup();
  state.taskTitleEditCleanup = null;
}

function renderInlineTitleDisplay(titleEl, task, titleText) {
  if (!titleEl) {return;}
  titleEl.textContent = "";
  if (!task?.link) {
    titleEl.textContent = titleText;
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = task.link;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.className =
    "inline-flex items-center gap-2 text-lime-300 hover:text-lime-200 underline decoration-lime-400";
  anchor.setAttribute("data-test-skedpal", "task-title-link");
  const textSpan = document.createElement("span");
  textSpan.textContent = titleText;
  textSpan.setAttribute("data-test-skedpal", "task-title-link-text");
  anchor.appendChild(textSpan);
  titleEl.appendChild(anchor);
}

function restoreInlineTitle(titleEl, task, originalTitle) {
  if (!titleEl) {return;}
  setInlineTitleRowEditing(titleEl, false);
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
  renderInlineTitleDisplay(titleEl, task, originalTitle);
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
  setInlineTitleRowEditing(titleEl, true);
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

function setInlineTitleRowEditing(titleEl, isEditing) {
  const row = titleEl?.closest?.(".task-title-row");
  if (!row) {return;}
  row.classList.toggle("task-title-row--editing", Boolean(isEditing));
}

function updateInlineTitleConversionPreview(input, preview) {
  if (!input || !preview) {return;}
  const value = input.value || "";
  const stored = parseTitleLiteralList(input.dataset.titleLiterals);
  const literals = pruneTitleLiteralList(value, stored);
  if (literals.length) {
    input.dataset.titleLiterals = serializeTitleLiteralList(literals);
  } else {
    delete input.dataset.titleLiterals;
  }
  const result = buildTitleConversionHighlightsHtml(value, { literals });
  if (!result.hasRanges) {
    preview.textContent = "";
    preview.classList.add("opacity-0", "pointer-events-none");
    return;
  }
  preview.innerHTML = result.html;
  preview.classList.remove("opacity-0", "pointer-events-none");
}

function createInlineTitleConversionPreview(titleEl, input) {
  const preview = document.createElement("div");
  preview.className =
    "mt-1 h-3 w-full min-w-0 truncate text-left text-[10px] text-slate-400 opacity-0 pointer-events-none pl-2";
  preview.setAttribute("data-test-skedpal", "task-title-inline-conversion-preview");
  titleEl.appendChild(preview);

  function handleInlineTitleInput() {
    ensureInlineTitleParsingState(input, true);
    updateInlineTitleConversionPreview(input, preview);
  }

  function handleInlineTitleLiteralClick(event) {
    const chip = event.target?.closest?.("[data-title-literal]");
    if (!chip) {return;}
    const literal = chip.dataset?.titleLiteral || "";
    if (!literal) {return;}
    const value = input.value || "";
    const stored = parseTitleLiteralList(input.dataset.titleLiterals);
    const literals = pruneTitleLiteralList(value, stored);
    if (!literals.includes(literal)) {
      input.dataset.titleLiterals = serializeTitleLiteralList([...literals, literal]);
      updateInlineTitleConversionPreview(input, preview);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleInlineTitlePreviewPointerDown(event) {
    event.preventDefault();
    input.focus();
  }

  input.addEventListener("input", handleInlineTitleInput);
  preview.addEventListener("click", handleInlineTitleLiteralClick);
  preview.addEventListener("pointerdown", handleInlineTitlePreviewPointerDown);
  updateInlineTitleConversionPreview(input, preview);

  return {
    preview,
    cleanup: () => {
      input.removeEventListener("input", handleInlineTitleInput);
      preview.removeEventListener("click", handleInlineTitleLiteralClick);
      preview.removeEventListener("pointerdown", handleInlineTitlePreviewPointerDown);
      preview.remove();
    }
  };
}

function resolveInlineLiteralList(inputValue, input) {
  const stored = parseTitleLiteralList(input?.dataset?.titleLiterals);
  return pruneTitleLiteralList(inputValue, stored);
}

function resolveInlineTitleUpdate(task, input, originalTitle) {
  const inputValue = input?.value || "";
  const parsingActive = input?.dataset?.titleParsingActive === "true";
  const literals = resolveInlineLiteralList(inputValue, input);
  return buildTitleUpdateFromInput({
    task,
    inputValue,
    originalTitle,
    parsingActive,
    literals,
    maxLength: TASK_TITLE_MAX_LENGTH
  });
}

function ensureInlineTitleParsingState(input, isActive) {
  if (!input) {return;}
  input.dataset.titleParsingActive = isActive ? "true" : "false";
}

function clearInlineTitleParsingState(input) {
  if (!input) {return;}
  delete input.dataset.titleParsingActive;
}

function createInlineTitleEditingNodes(titleEl, taskId, originalTitle) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = originalTitle;
  input.className =
    "w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 focus:border-lime-400 focus:outline-none";
  input.maxLength = TASK_TITLE_MAX_LENGTH;
  input.setAttribute("data-test-skedpal", "task-title-inline-input");
  ensureInlineTitleParsingState(input, false);

  const grammarBtn = buildInlineTitleGrammarButton();
  const editRow = document.createElement("div");
  editRow.className = "flex items-center gap-1";
  editRow.setAttribute("data-test-skedpal", "task-title-inline-edit-row");
  editRow.appendChild(input);
  editRow.appendChild(grammarBtn);

  titleEl.dataset.inlineEditing = "true";
  titleEl.dataset.inlineEditingTaskId = taskId;
  titleEl.textContent = "";
  titleEl.appendChild(editRow);

  const inlinePreview = createInlineTitleConversionPreview(titleEl, input);
  return {
    input,
    grammarBtn,
    preview: inlinePreview.preview,
    cleanupPreview: inlinePreview.cleanup
  };
}

function buildInlineTitleGrammarButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "title-icon-btn shrink-0";
  button.title = INLINE_GRAMMAR_DEFAULT_LABEL;
  button.setAttribute("aria-label", INLINE_GRAMMAR_DEFAULT_LABEL);
  button.setAttribute("data-test-skedpal", "task-title-inline-grammar-btn");
  button.innerHTML = sparklesIconSvg;
  button.dataset.success = "false";
  return button;
}

function clearInlineTitleGrammarSuccessFeedback(button) {
  if (!button) {return;}
  const timerId = inlineTitleGrammarSuccessTimers.get(button);
  if (timerId) {
    clearTimeout(timerId);
    inlineTitleGrammarSuccessTimers.delete(button);
  }
  button.dataset.success = "false";
  button.classList.remove("text-lime-300", "border-lime-400");
  button.innerHTML = sparklesIconSvg;
  button.title = INLINE_GRAMMAR_DEFAULT_LABEL;
  button.setAttribute("aria-label", INLINE_GRAMMAR_DEFAULT_LABEL);
}

function showInlineTitleGrammarSuccessFeedback(button) {
  if (!button) {return;}
  clearInlineTitleGrammarSuccessFeedback(button);
  button.dataset.success = "true";
  button.classList.add("text-lime-300", "border-lime-400");
  button.innerHTML = grammarSuccessIconSvg;
  button.title = INLINE_GRAMMAR_SUCCESS_LABEL;
  button.setAttribute("aria-label", INLINE_GRAMMAR_SUCCESS_LABEL);
  const timerId = setTimeout(() => {
    inlineTitleGrammarSuccessTimers.delete(button);
    clearInlineTitleGrammarSuccessFeedback(button);
  }, GRAMMAR_FIX_SUCCESS_FEEDBACK_MS);
  inlineTitleGrammarSuccessTimers.set(button, timerId);
}

function setInlineTitleGrammarButtonLoading(button, isLoading) {
  if (!button) {return;}
  if (isLoading) {
    clearInlineTitleGrammarSuccessFeedback(button);
  }
  button.disabled = isLoading;
  button.dataset.loading = isLoading ? "true" : "false";
  button.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function applyInlineGrammarFixToInput(input, preview, fixedTitle) {
  const nextTitle = String(fixedTitle || "").trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!nextTitle) {return false;}
  input.value = nextTitle;
  ensureInlineTitleParsingState(input, true);
  updateInlineTitleConversionPreview(input, preview);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

async function runInlineTitleGrammarRequest({
  sourceTitle,
  input,
  preview,
  grammarBtn
}) {
  setInlineTitleGrammarButtonLoading(grammarBtn, true);
  try {
    const fixedTitle = await fixTaskTitleGrammar(sourceTitle);
    const didApply = applyInlineGrammarFixToInput(input, preview, fixedTitle);
    if (didApply) {
      showInlineTitleGrammarSuccessFeedback(grammarBtn);
    }
  } catch (error) {
    console.error("Failed to fix inline task title grammar.", error);
  } finally {
    setInlineTitleGrammarButtonLoading(grammarBtn, false);
  }
}

async function applyInlineTitleEditResult({
  shouldSave,
  titleEl,
  task,
  originalTitle,
  input
}) {
  setInlineTitleRowEditing(titleEl, false);
  if (!shouldSave) {
    clearInlineTitleParsingState(input);
    restoreInlineTitle(titleEl, task, originalTitle);
    return;
  }
  const update = resolveInlineTitleUpdate(task, input, originalTitle);
  clearInlineTitleParsingState(input);
  if (!update.shouldSave) {
    restoreInlineTitle(titleEl, task, originalTitle);
    return;
  }
  /* c8 ignore next 10 */
  const inlineEditHandlers = state.inlineTitleEditHandlers || await import("./tasks-actions.js");
  const {
    loadTasks,
    updateParentTaskDescendants,
    saveTask: saveTaskOverride
  } = inlineEditHandlers;
  await applyInlineTitleUpdate(task, update, {
    saveTaskFn: saveTaskOverride,
    loadTasksFn: loadTasks,
    updateDescendantsFn: updateParentTaskDescendants
  });
}

function createInlineTitleGrammarClickHandler({
  input,
  preview,
  grammarBtn
}) {
  return async function handleInlineTitleGrammarClick(event) {
    event.preventDefault();
    const sourceTitle = input.value || "";
    if (!sourceTitle.trim()) {
      input.focus();
      return;
    }
    await runInlineTitleGrammarRequest({
      sourceTitle,
      input,
      preview,
      grammarBtn
    });
  };
}

function handleInlineTitleGrammarPointerDown(event) {
  event.preventDefault();
}

function startInlineTitleEdit(titleEl, task, options = {}) {
  if (!titleEl || !task) {return;}
  cleanupInlineTitleEdit();
  const originalTitle = task.title || "";
  applyInlineTitleEditingStyles(titleEl);
  const { input, grammarBtn, preview, cleanupPreview } = createInlineTitleEditingNodes(
    titleEl,
    task.id,
    originalTitle
  );
  let isDone = false;

  const handleInlineTitleGrammarClick = createInlineTitleGrammarClickHandler({
    input,
    preview,
    grammarBtn
  });

  async function finishInlineEdit(shouldSave) {
    if (isDone) {return;}
    isDone = true;
    input.removeEventListener("keydown", handleInlineTitleKeydown);
    input.removeEventListener("blur", handleInlineTitleBlur);
    input.removeEventListener("pointerdown", handleInlineTitlePointerDown);
    grammarBtn.removeEventListener("pointerdown", handleInlineTitleGrammarPointerDown);
    grammarBtn.removeEventListener("click", handleInlineTitleGrammarClick);
    clearInlineTitleGrammarSuccessFeedback(grammarBtn);
    cleanupInlineTitleEdit();
    cleanupPreview();
    await applyInlineTitleEditResult({
      shouldSave,
      titleEl,
      task,
      originalTitle,
      input
    });
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
  grammarBtn.addEventListener("pointerdown", handleInlineTitleGrammarPointerDown);
  grammarBtn.addEventListener("click", handleInlineTitleGrammarClick);

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
  if (event.target.closest?.("a")) {
    event.preventDefault();
    event.stopPropagation();
  }
  const card = titleEl.closest?.("[data-task-id]");
  const taskId = card?.dataset?.taskId || "";
  if (!taskId) {return;}
  const task = state.tasksCache.find((entry) => entry.id === taskId);
  if (!task) {return;}
  if (titleEl.dataset.inlineEditing === "true") {return;}
  startInlineTitleEdit(titleEl, task, { clientX: event.clientX });
}

export function handleTaskTitleClick(event) {
  const anchor = event.target?.closest?.("a");
  if (!anchor) {return false;}
  const titleEl = anchor.closest?.('[data-test-skedpal="task-title"]');
  if (!titleEl) {return false;}
  if (event.metaKey || event.ctrlKey) {return false;}
  event.preventDefault();
  event.stopPropagation();
  return true;
}
