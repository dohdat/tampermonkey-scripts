import { saveSettings } from "../../data/db.js";
import { domRefs } from "../constants.js";
import { state } from "../state/page-state.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";

const {
  taskAiButton,
  taskAiStatus,
  taskAiOutput,
  taskTitleInput
} = domRefs;

function getGroqApiKey() {
  return (state.settingsCache?.groqApiKey || "").trim();
}

async function persistGroqApiKey(apiKey) {
  state.settingsCache = { ...state.settingsCache, groqApiKey: apiKey };
  state.pendingSettingsSave = saveSettings(state.settingsCache);
  await state.pendingSettingsSave.catch((error) => {
    console.warn("Failed to save Groq API key.", error);
  });
}

async function ensureGroqApiKey() {
  let apiKey = getGroqApiKey();
  if (apiKey) {return apiKey;}
  const entry = window.prompt("Enter your Groq API key:");
  if (!entry) {return "";}
  apiKey = entry.trim();
  if (!apiKey) {return "";}
  await persistGroqApiKey(apiKey);
  return apiKey;
}

function buildTaskListMessages(title) {
  return [
    {
      role: "system",
      content:
        "You turn a task goal into a concise task list. Respond with JSON only."
    },
    {
      role: "user",
      content: `Create a task list with subtasks for: "${title}".\nReturn JSON with this shape:\n{\n  "tasks": [\n    { "title": "Task", "subtasks": ["Subtask"] }\n  ]\n}\nGuidelines: 4-8 tasks, 0-4 subtasks each, titles under 8 words. No markdown.`
    }
  ];
}

async function requestGroqTaskList(apiKey, title) {
  const response = await fetch(GROQ_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: buildTaskListMessages(title),
      temperature: 0.4,
      max_completion_tokens: 700,
      top_p: 1,
      stream: false
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch (error) {
      detail = response.statusText;
    }
    throw new Error(`HTTP ${response.status} ${detail}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

function extractJsonCandidate(text) {
  if (!text) {return "";}
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return candidate.slice(start, end + 1);
}

function normalizeTaskList(payload) {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return tasks
    .map((task) => ({
      title: typeof task?.title === "string" ? task.title.trim() : "",
      subtasks: Array.isArray(task?.subtasks)
        ? task.subtasks.map((sub) => (typeof sub === "string" ? sub.trim() : "")).filter(Boolean)
        : []
    }))
    .filter((task) => task.title);
}

function extractSubtasksFromBlock(block) {
  const match = block.match(/"subtasks"\s*:\s*\[/);
  if (!match) {return [];}
  const listStart = (match.index ?? 0) + match[0].length;
  const listSlice = block.slice(listStart);
  const listEnd = listSlice.indexOf("]");
  const segment = listEnd === -1 ? listSlice : listSlice.slice(0, listEnd);
  const items = segment.match(/"([^"]+)"/g) || [];
  return items
    .map((item) => item.replace(/"/g, "").trim())
    .filter(Boolean);
}

function parseLooseTaskList(text) {
  if (!text) {return [];}
  const tasks = [];
  let index = 0;
  while (index < text.length) {
    const titleMatch = text.slice(index).match(/"title"\s*:\s*"/);
    if (!titleMatch || titleMatch.index === undefined) {break;}
    const titleStart = index + titleMatch.index + titleMatch[0].length;
    const titleEnd = text.indexOf("\"", titleStart);
    if (titleEnd === -1) {break;}
    const title = text.slice(titleStart, titleEnd).trim();
    const nextTitleIndex = text.indexOf("\"title\"", titleEnd);
    const blockEnd = nextTitleIndex === -1 ? text.length : nextTitleIndex;
    const block = text.slice(titleEnd, blockEnd);
    const subtasks = extractSubtasksFromBlock(block);
    if (title) {
      tasks.push({ title, subtasks });
    }
    if (nextTitleIndex === -1 || nextTitleIndex <= titleEnd) {break;}
    index = nextTitleIndex;
  }
  return tasks;
}

function parseTaskListResponseDetailed(text) {
  const candidate = extractJsonCandidate(text);
  if (candidate) {
    try {
      const payload = JSON.parse(candidate);
      return { tasks: normalizeTaskList(payload), usedLooseParse: false };
    } catch (error) {
      // Fall through to loose parsing.
    }
  }
  return { tasks: parseLooseTaskList(text), usedLooseParse: true };
}

export function parseTaskListResponse(text) {
  return parseTaskListResponseDetailed(text).tasks;
}

function setStatus(message, variant = "info") {
  if (!taskAiStatus) {return;}
  if (!message) {
    taskAiStatus.textContent = "";
    taskAiStatus.classList.add("hidden");
    delete taskAiStatus.dataset.variant;
    return;
  }
  taskAiStatus.textContent = message;
  taskAiStatus.dataset.variant = variant;
  taskAiStatus.classList.remove("hidden");
}

function clearOutput() {
  if (!taskAiOutput) {return;}
  taskAiOutput.innerHTML = "";
  taskAiOutput.classList.add("hidden");
}

function renderTaskList(tasks) {
  if (!taskAiOutput) {return;}
  taskAiOutput.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "task-ai-list";
  list.setAttribute("data-test-skedpal", "task-ai-list");
  tasks.forEach((task, index) => {
    const item = document.createElement("li");
    item.className = "task-ai-list-item";
    item.setAttribute("data-test-skedpal", `task-ai-task-${index}`);

    const title = document.createElement("div");
    title.className = "task-ai-list-title";
    title.textContent = task.title;
    title.setAttribute("data-test-skedpal", `task-ai-task-title-${index}`);

    item.appendChild(title);

    if (task.subtasks.length) {
      const sublist = document.createElement("ul");
      sublist.className = "task-ai-sublist";
      sublist.setAttribute("data-test-skedpal", `task-ai-sublist-${index}`);
      task.subtasks.forEach((subtask, subIndex) => {
        const subitem = document.createElement("li");
        subitem.textContent = subtask;
        subitem.setAttribute("data-test-skedpal", `task-ai-subtask-${index}-${subIndex}`);
        sublist.appendChild(subitem);
      });
      item.appendChild(sublist);
    }

    list.appendChild(item);
  });

  taskAiOutput.appendChild(list);
  taskAiOutput.classList.remove("hidden");
}

function renderRawResponse(text) {
  if (!taskAiOutput) {return;}
  taskAiOutput.innerHTML = "";
  const pre = document.createElement("pre");
  pre.className = "task-ai-raw";
  pre.textContent = text || "No response";
  pre.setAttribute("data-test-skedpal", "task-ai-raw");
  taskAiOutput.appendChild(pre);
  taskAiOutput.classList.remove("hidden");
}

function setButtonLoading(isLoading) {
  if (!taskAiButton) {return;}
  taskAiButton.disabled = isLoading;
  if (isLoading) {
    taskAiButton.dataset.loading = "true";
    taskAiButton.textContent = "Building list...";
  } else {
    delete taskAiButton.dataset.loading;
    taskAiButton.textContent = "Help me create a list";
  }
}

async function handleTaskAiButtonClick() {
  if (!taskTitleInput || !taskAiOutput) {return;}
  const title = taskTitleInput.value.trim();
  if (!title) {
    clearOutput();
    setStatus("Add a task title first.", "error");
    return;
  }
  const apiKey = await ensureGroqApiKey();
  if (!apiKey) {
    clearOutput();
    setStatus("Groq API key required to generate a list.", "error");
    return;
  }
  clearOutput();
  setStatus("Creating your task list...", "loading");
  setButtonLoading(true);
  try {
    const content = await requestGroqTaskList(apiKey, title);
    const parsed = parseTaskListResponseDetailed(content);
    if (parsed.tasks.length) {
      state.taskAiList = parsed.tasks;
      if (parsed.usedLooseParse) {
        setStatus("Groq response was truncated. Showing best-effort list.", "error");
      } else {
        setStatus("Suggested task list ready.", "info");
      }
      renderTaskList(parsed.tasks);
    } else {
      state.taskAiList = [];
      setStatus("Groq responded without JSON. Showing raw output.", "error");
      renderRawResponse(content);
    }
  } catch (error) {
    console.error("Groq API failed.", error);
    state.taskAiList = [];
    setStatus("Groq request failed. Check console for details.", "error");
  } finally {
    setButtonLoading(false);
  }
}

export function resetTaskListAssistant() {
  state.taskAiList = [];
  clearOutput();
  setStatus("");
  setButtonLoading(false);
}

export function initTaskListAssistant() {
  if (!taskAiButton) {return () => {};}
  taskAiButton.addEventListener("click", handleTaskAiButtonClick);
  return () => {
    taskAiButton.removeEventListener("click", handleTaskAiButtonClick);
  };
}
