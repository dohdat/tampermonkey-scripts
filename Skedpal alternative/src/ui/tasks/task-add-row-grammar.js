function setElementHidden(element, isHidden) {
  if (!element) {return;}
  if (isHidden) {
    element.classList.add("hidden");
    if (element.style) {
      element.style.display = "none";
    }
    return;
  }
  element.classList.remove("hidden");
  if (element.style) {
    element.style.display = "";
  }
}

export function syncAddTaskGrammarButtonState({ input, row, grammarButton }) {
  if (!input || !grammarButton) {return;}
  const shouldShow = row?.dataset?.addTaskActive === "true";
  setElementHidden(grammarButton, !shouldShow);
}

export function resolveAddTaskInputFromEventTarget(target) {
  if (!(target instanceof HTMLElement)) {return null;}
  if (target.matches("[data-add-task-input]")) {return target;}
  return target.closest?.("[data-add-task-row]")?.querySelector?.("[data-add-task-input]") || null;
}

export function resolveAddTaskGrammarSelectionContext(input) {
  const fullTitle = String(input.value || "");
  const selectionStart = Number.isInteger(input.selectionStart) ? input.selectionStart : 0;
  const selectionEnd = Number.isInteger(input.selectionEnd) ? input.selectionEnd : 0;
  const hasSelection = selectionEnd > selectionStart;
  const sourceTitle = hasSelection
    ? fullTitle.slice(selectionStart, selectionEnd)
    : fullTitle;
  return {
    fullTitle,
    selectionStart,
    selectionEnd,
    hasSelection,
    sourceTitle
  };
}

export function applyAddTaskGrammarReplacement({
  input,
  context,
  nextTitleSegment,
  maxTitleLength
}) {
  if (!input || !context) {return;}
  if (context.hasSelection) {
    const replaced =
      `${context.fullTitle.slice(0, context.selectionStart)}` +
      `${nextTitleSegment}` +
      `${context.fullTitle.slice(context.selectionEnd)}`;
    input.value = replaced.slice(0, maxTitleLength);
    const nextCaret = Math.min(context.selectionStart + nextTitleSegment.length, input.value.length);
    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(nextCaret, nextCaret);
      return;
    }
    input.selectionStart = nextCaret;
    input.selectionEnd = nextCaret;
    return;
  }
  input.value = nextTitleSegment.slice(0, maxTitleLength);
}
