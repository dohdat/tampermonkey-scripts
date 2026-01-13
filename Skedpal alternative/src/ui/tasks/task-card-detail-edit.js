const PRIORITY_MIN = 1;
const PRIORITY_MAX = 5;

export function buildPriorityDetailItem({
  task,
  buildDetailItemElement,
  iconSvg,
  applyPrioritySelectColor,
  onUpdate
}) {
  const { item, valueEl } = buildDetailItemElement({
    key: "priority",
    label: "Priority",
    iconSvg,
    valueTestId: "task-priority"
  });
  const select = document.createElement("select");
  select.className = "task-detail-select priority-select";
  select.setAttribute("data-test-skedpal", "task-detail-priority-select");
  for (let priority = PRIORITY_MIN; priority <= PRIORITY_MAX; priority += 1) {
    const option = document.createElement("option");
    option.value = String(priority);
    option.textContent = String(priority);
    option.setAttribute("data-test-skedpal", `task-detail-priority-option-${priority}`);
    select.appendChild(option);
  }
  select.value = Number.isFinite(Number(task.priority))
    ? String(task.priority)
    : String(PRIORITY_MIN);
  applyPrioritySelectColor(select);
  valueEl.textContent = "";
  valueEl.appendChild(select);

  function handlePriorityChange() {
    const nextPriority = Number(select.value);
    if (!Number.isFinite(nextPriority)) {return;}
    if (nextPriority === Number(task.priority)) {return;}
    onUpdate({ priority: nextPriority });
    applyPrioritySelectColor(select);
  }

  select.addEventListener("change", handlePriorityChange);

  return {
    item,
    cleanup: () => {
      select.removeEventListener("change", handlePriorityChange);
    }
  };
}

export function buildStartFromDetailItem({
  task,
  buildDetailItemElement,
  iconSvg,
  formatDateTime,
  onClear
}) {
  if (!task.startFrom) {return { item: null, cleanup: () => {} };}
  const { item, valueEl } = buildDetailItemElement({
    key: "start-from",
    label: "Start from",
    iconSvg,
    valueTestId: "task-start-from"
  });
  valueEl.textContent = "";
  const valueWrap = document.createElement("span");
  valueWrap.className = "task-detail-value-wrap";
  valueWrap.setAttribute("data-test-skedpal", "task-start-from-value");
  valueWrap.textContent = formatDateTime(task.startFrom);
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "task-detail-clear-btn";
  clearBtn.setAttribute("aria-label", "Clear start from");
  clearBtn.setAttribute("data-test-skedpal", "task-start-from-clear");
  clearBtn.textContent = "x";
  valueEl.appendChild(valueWrap);
  valueEl.appendChild(clearBtn);

  function handleClearClick(event) {
    event.preventDefault();
    onClear();
  }

  clearBtn.addEventListener("click", handleClearClick);

  return {
    item,
    cleanup: () => {
      clearBtn.removeEventListener("click", handleClearClick);
    }
  };
}

export function buildDeadlineDetailItem({
  task,
  buildDetailItemElement,
  iconSvg,
  formatDateTime,
  onClear
}) {
  if (!task.deadline) {return { item: null, cleanup: () => {} };}
  const { item, valueEl } = buildDetailItemElement({
    key: "deadline",
    label: "Deadline",
    iconSvg,
    valueTestId: "task-deadline"
  });
  valueEl.textContent = "";
  const valueWrap = document.createElement("span");
  valueWrap.className = "task-detail-value-wrap";
  valueWrap.setAttribute("data-test-skedpal", "task-deadline-value");
  valueWrap.textContent = formatDateTime(task.deadline);
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "task-detail-clear-btn";
  clearBtn.setAttribute("aria-label", "Clear deadline");
  clearBtn.setAttribute("data-test-skedpal", "task-deadline-clear");
  clearBtn.textContent = "x";
  valueEl.appendChild(valueWrap);
  valueEl.appendChild(clearBtn);

  function handleClearClick(event) {
    event.preventDefault();
    onClear();
  }

  clearBtn.addEventListener("click", handleClearClick);

  return {
    item,
    cleanup: () => {
      clearBtn.removeEventListener("click", handleClearClick);
    }
  };
}

export function buildRepeatDetailItem({
  buildDetailItemElement,
  iconSvg,
  repeatSummary,
  isRepeating,
  onClear
}) {
  const { item, valueEl } = buildDetailItemElement({
    key: "repeat",
    label: "Repeat",
    iconSvg,
    valueTestId: "task-repeat"
  });
  valueEl.textContent = "";
  const valueWrap = document.createElement("span");
  valueWrap.className = "task-detail-value-wrap";
  valueWrap.setAttribute("data-test-skedpal", "task-repeat-value");
  valueWrap.textContent = repeatSummary;
  valueEl.appendChild(valueWrap);
  if (!isRepeating) {
    return { item, cleanup: () => {} };
  }
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "task-detail-clear-btn";
  clearBtn.setAttribute("aria-label", "Clear repeat");
  clearBtn.setAttribute("data-test-skedpal", "task-repeat-clear");
  clearBtn.textContent = "x";
  valueEl.appendChild(clearBtn);

  function handleClearClick(event) {
    event.preventDefault();
    onClear();
  }

  clearBtn.addEventListener("click", handleClearClick);

  return {
    item,
    cleanup: () => {
      clearBtn.removeEventListener("click", handleClearClick);
    }
  };
}
