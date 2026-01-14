import { MINUTES_PER_HOUR, PRIORITY_MAX, PRIORITY_MIN } from "../constants.js";

const durationOptions = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "45m", value: 45 },
  { label: "1h", value: 60 },
  { label: "1h30", value: 90 },
  { label: "2h", value: 120 },
  { label: "2h30", value: 150 },
  { label: "3h", value: 180 }
];

function formatDurationLabel(minutes) {
  const total = Number(minutes) || 0;
  if (total <= 0) {return "0m";}
  if (total < MINUTES_PER_HOUR) {return `${total}m`;}
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;
  if (mins === 0) {return `${hours}h`;}
  return `${hours}h${mins}`;
}

function buildSafeTestToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

export function buildDurationDetailItem({
  task,
  buildDetailItemElement,
  iconSvg,
  onUpdate
}) {
  const { item, valueEl } = buildDetailItemElement({
    key: "duration",
    label: "Duration",
    iconSvg,
    valueTestId: "task-duration-detail"
  });
  const select = document.createElement("select");
  select.className = "task-detail-select task-duration-select";
  select.setAttribute("data-test-skedpal", "task-detail-duration-select");
  durationOptions.forEach((optionDef) => {
    const option = document.createElement("option");
    option.value = String(optionDef.value);
    option.textContent = optionDef.label;
    option.setAttribute(
      "data-test-skedpal",
      `task-detail-duration-option-${optionDef.value}`
    );
    select.appendChild(option);
  });
  const currentDuration = Number(task.durationMin) || 0;
  if (!durationOptions.some((optionDef) => optionDef.value === currentDuration)) {
    const option = document.createElement("option");
    option.value = String(currentDuration);
    option.textContent = formatDurationLabel(currentDuration);
    option.setAttribute(
      "data-test-skedpal",
      `task-detail-duration-option-${currentDuration}`
    );
    select.appendChild(option);
  }
  select.value = String(currentDuration || durationOptions[1].value);
  valueEl.textContent = "";
  valueEl.appendChild(select);

  function handleDurationChange() {
    const nextDuration = Number(select.value);
    if (!Number.isFinite(nextDuration)) {return;}
    if (nextDuration === Number(task.durationMin)) {return;}
    onUpdate({ durationMin: nextDuration });
  }

  select.addEventListener("change", handleDurationChange);

  return {
    item,
    cleanup: () => {
      select.removeEventListener("change", handleDurationChange);
    }
  };
}

export function buildTimeMapDetailItem({
  task,
  buildDetailItemElement,
  iconSvg,
  timeMapOptions,
  onUpdate
}) {
  const { item, valueEl } = buildDetailItemElement({
    key: "timemaps",
    label: "TimeMaps",
    iconSvg,
    valueTestId: "task-timemaps"
  });
  const select = document.createElement("select");
  select.className = "task-detail-select task-timemap-select";
  select.setAttribute("data-test-skedpal", "task-detail-timemap-select");
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "None";
  noneOption.setAttribute("data-test-skedpal", "task-detail-timemap-option-none");
  select.appendChild(noneOption);

  const timeMapList = Array.isArray(timeMapOptions) ? timeMapOptions : [];
  timeMapList.forEach((timeMap) => {
    const option = document.createElement("option");
    option.value = timeMap.id;
    option.textContent = timeMap.label;
    option.setAttribute(
      "data-test-skedpal",
      `task-detail-timemap-option-${buildSafeTestToken(timeMap.id)}`
    );
    select.appendChild(option);
  });

  const timeMapIds = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
  if (timeMapIds.length > 1) {
    const multiOption = document.createElement("option");
    multiOption.value = "__multiple__";
    multiOption.textContent = "Multiple";
    multiOption.disabled = true;
    multiOption.selected = true;
    multiOption.setAttribute("data-test-skedpal", "task-detail-timemap-option-multiple");
    select.appendChild(multiOption);
    select.value = "__multiple__";
  } else {
    const selected = timeMapIds[0] || "";
    select.value = String(selected);
  }

  valueEl.textContent = "";
  valueEl.appendChild(select);

  function handleTimeMapChange() {
    const nextValue = select.value;
    if (nextValue === "__multiple__") {return;}
    const nextIds = nextValue ? [nextValue] : [];
    const currentIds = Array.isArray(task.timeMapIds) ? task.timeMapIds : [];
    if (
      currentIds.length === nextIds.length &&
      currentIds[0] === nextIds[0]
    ) {
      return;
    }
    onUpdate({ timeMapIds: nextIds });
  }

  select.addEventListener("change", handleTimeMapChange);

  return {
    item,
    cleanup: () => {
      select.removeEventListener("change", handleTimeMapChange);
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
