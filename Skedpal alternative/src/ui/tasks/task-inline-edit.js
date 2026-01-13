import { saveTask } from "../../data/db.js";
import { INDEX_NOT_FOUND, TASK_TITLE_MAX_LENGTH } from "../constants.js";
import {
  buildTitleConversionPreviewHtml,
  buildTitleUpdateFromInput,
  parseTitleLiteralList,
  pruneTitleLiteralList,
  serializeTitleLiteralList
} from "../title-date-utils.js";
import { state } from "../state/page-state.js";
import { loadTasks } from "./tasks-actions.js";

function cleanupInlineTitleEdit() {
  if (typeof state.taskTitleEditCleanup !== "function") {return;}
  state.taskTitleEditCleanup();
  state.taskTitleEditCleanup = null;
}

function restoreInlineTitle(titleEl, originalTitle) {
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
  const result = buildTitleConversionPreviewHtml(value, { literals });
  if (!result.hasRanges) {
    preview.textContent = "";
    preview.classList.add("opacity-0", "pointer-events-none");
    return;
  }
  const prefix =
    '<span class="text-slate-500" data-test-skedpal="task-title-inline-conversion-prefix">Will convert: </span>';
  preview.innerHTML = `${prefix}${result.html}`;
  preview.classList.remove("opacity-0", "pointer-events-none");
}

function createInlineTitleConversionPreview(titleEl, input) {
  const preview = document.createElement("div");
  preview.className =
    "mt-1 h-3 truncate text-left text-[10px] text-slate-400 opacity-0 pointer-events-none pl-2";
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

  return () => {
    input.removeEventListener("input", handleInlineTitleInput);
    preview.removeEventListener("click", handleInlineTitleLiteralClick);
    preview.removeEventListener("pointerdown", handleInlineTitlePreviewPointerDown);
    preview.remove();
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
  ensureInlineTitleParsingState(input, false);
  input.setAttribute("data-test-skedpal", "task-title-inline-input");
  titleEl.dataset.inlineEditing = "true";
  titleEl.dataset.inlineEditingTaskId = task.id;
  titleEl.textContent = "";
  titleEl.appendChild(input);
  const cleanupPreview = createInlineTitleConversionPreview(titleEl, input);

  let isDone = false;

  async function finishInlineEdit(shouldSave) {
    if (isDone) {return;}
    isDone = true;
    input.removeEventListener("keydown", handleInlineTitleKeydown);
    input.removeEventListener("blur", handleInlineTitleBlur);
    input.removeEventListener("pointerdown", handleInlineTitlePointerDown);
    cleanupInlineTitleEdit();
    cleanupPreview();
    setInlineTitleRowEditing(titleEl, false);
    if (!shouldSave) {
      clearInlineTitleParsingState(input);
      restoreInlineTitle(titleEl, originalTitle);
      return;
    }
    const update = resolveInlineTitleUpdate(task, input, originalTitle);
    clearInlineTitleParsingState(input);
    if (!update.shouldSave) {
      restoreInlineTitle(titleEl, originalTitle);
      return;
    }
    await saveTask({
      ...task,
      title: update.nextTitle,
      deadline: update.nextDeadline,
      startFrom: update.nextStartFrom,
      repeat: update.nextRepeat
    });
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
