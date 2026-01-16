import assert from "assert";
import { describe, it } from "mocha";

import {
  buildReminderEntry,
  mergeReminderEntries,
  normalizeReminders,
  removeReminderEntry
} from "../src/ui/tasks/task-reminders-helpers.js";
import { state } from "../src/ui/state/page-state.js";
import { domRefs } from "../src/ui/constants.js";

describe("task reminders", () => {
  it("shows a notification banner when overdue reminders exist", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { renderTaskReminderBadge } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    class FakeElement {
      constructor() {
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
        this.textContent = "";
        this.onclick = null;
        this._listeners = new Map();
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }
    }

    const badge = new FakeElement();
    const banner = new FakeElement();
    const message = new FakeElement();
    const zoomButton = new FakeElement();
    const undoButton = new FakeElement();
    const closeButton = new FakeElement();
    domRefs.taskReminderBadge = badge;
    domRefs.notificationBanner = banner;
    domRefs.notificationMessage = message;
    domRefs.notificationZoomButton = zoomButton;
    domRefs.notificationUndoButton = undoButton;
    domRefs.notificationCloseButton = closeButton;
    const past = new Date(Date.now() - 86400000).toISOString();
    state.reminderBannerActive = false;
    state.reminderBannerDismissedCount = 0;
    renderTaskReminderBadge([
      {
        id: "task-zoom",
        section: "section-1",
        subsection: "sub-1",
        reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }]
      }
    ]);
    assert.strictEqual(badge.classList.contains("hidden"), true);
    assert.strictEqual(badge.textContent, "");
    assert.strictEqual(banner.classList.contains("hidden"), false);
    assert.strictEqual(message.textContent, "You have 1 overdue reminder.");
    assert.strictEqual(zoomButton.classList.contains("hidden"), false);
    assert.strictEqual(zoomButton._listeners.get("click")?.size, 1);

    renderTaskReminderBadge([
      {
        id: "task-zoom",
        section: "section-1",
        subsection: "sub-1",
        reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: past }]
      }
    ]);
    assert.strictEqual(banner.classList.contains("hidden"), true);
    assert.strictEqual(message.textContent, "You have 1 overdue reminder.");
    assert.strictEqual(zoomButton.classList.contains("hidden"), true);
    assert.strictEqual(zoomButton._listeners.get("click")?.size || 0, 0);

    renderTaskReminderBadge([
      {
        id: "task-zoom",
        completed: true,
        reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }]
      }
    ]);
    assert.strictEqual(banner.classList.contains("hidden"), true);
    assert.strictEqual(message.textContent, "You have 1 overdue reminder.");
    assert.strictEqual(zoomButton.classList.contains("hidden"), true);
  });

  it("respects existing notification banners and dismissal state", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { renderTaskReminderBadge } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    class FakeElement {
      constructor() {
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
        this.textContent = "";
        this.onclick = null;
      }
    }

    const banner = new FakeElement();
    const message = new FakeElement();
    const undoButton = new FakeElement();
    const closeButton = new FakeElement();
    domRefs.notificationBanner = banner;
    domRefs.notificationMessage = message;
    domRefs.notificationUndoButton = undoButton;
    domRefs.notificationCloseButton = closeButton;

    const past = new Date(Date.now() - 86400000).toISOString();
    state.reminderBannerActive = false;
    state.reminderBannerDismissedCount = 0;
    banner.classList.remove("hidden");
    message.textContent = "Existing notice";

    renderTaskReminderBadge([{ reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }] }]);
    assert.strictEqual(message.textContent, "Existing notice");

    banner.classList.add("hidden");
    state.reminderBannerDismissedCount = 1;
    renderTaskReminderBadge([{ reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }] }]);
    assert.strictEqual(banner.classList.contains("hidden"), true);

    state.reminderBannerDismissedCount = 0;
    renderTaskReminderBadge([{ reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }] }]);
    assert.strictEqual(banner.classList.contains("hidden"), false);
    assert.strictEqual(message.textContent, "You have 1 overdue reminder.");

    closeButton.onclick?.();
    assert.strictEqual(state.reminderBannerDismissedCount, 1);
    assert.strictEqual(banner.classList.contains("hidden"), true);

    state.reminderBannerActive = true;
    banner.classList.remove("hidden");
    renderTaskReminderBadge([]);
    assert.strictEqual(banner.classList.contains("hidden"), true);
    assert.strictEqual(state.reminderBannerDismissedCount, 0);
  });

  it("keeps the zoom button hidden when no task id is available", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { renderTaskReminderBadge } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    class FakeElement {
      constructor() {
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
        this.textContent = "";
        this._listeners = new Map();
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }
    }

    const banner = new FakeElement();
    const message = new FakeElement();
    const zoomButton = new FakeElement();
    const undoButton = new FakeElement();
    const closeButton = new FakeElement();
    domRefs.notificationBanner = banner;
    domRefs.notificationMessage = message;
    domRefs.notificationZoomButton = zoomButton;
    domRefs.notificationUndoButton = undoButton;
    domRefs.notificationCloseButton = closeButton;

    const past = new Date(Date.now() - 86400000).toISOString();
    state.reminderBannerActive = false;
    state.reminderBannerDismissedCount = 0;
    renderTaskReminderBadge([
      { reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }] }
    ]);

    assert.strictEqual(banner.classList.contains("hidden"), false);
    assert.strictEqual(zoomButton.classList.contains("hidden"), true);
    assert.strictEqual(zoomButton._listeners.get("click")?.size || 0, 0);
  });

  it("shows reminder banners even when the zoom button is missing", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { renderTaskReminderBadge } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    class FakeElement {
      constructor() {
        this._classSet = new Set(["hidden"]);
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
        this.textContent = "";
      }
    }

    const banner = new FakeElement();
    const message = new FakeElement();
    const undoButton = new FakeElement();
    const closeButton = new FakeElement();
    domRefs.notificationBanner = banner;
    domRefs.notificationMessage = message;
    domRefs.notificationZoomButton = null;
    domRefs.notificationUndoButton = undoButton;
    domRefs.notificationCloseButton = closeButton;

    const past = new Date(Date.now() - 86400000).toISOString();
    state.reminderBannerActive = false;
    state.reminderBannerDismissedCount = 0;
    renderTaskReminderBadge([
      { id: "task-zoom", reminders: [{ id: "r1", days: 1, remindAt: past, dismissedAt: "" }] }
    ]);

    assert.strictEqual(banner.classList.contains("hidden"), false);
    assert.strictEqual(message.textContent, "You have 1 overdue reminder.");
  });

  it("hides the existing reminder list when empty", async () => {
    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.className = "";
        this.textContent = "";
        this.value = "";
        this._listeners = new Map();
        this._classSet = new Set();
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }

      focus() {}
    }

    const originalDocument = global.document;
    global.document = {
      body: new FakeElement("body"),
      createElement: (tag) => new FakeElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.document.body.classList = {
      add: () => {},
      remove: () => {}
    };

    const taskReminderModal = new FakeElement("div");
    const taskReminderDays = new FakeElement("div");
    const taskReminderCustomInput = new FakeElement("input");
    const taskReminderCustomAdd = new FakeElement("button");
    const taskReminderExistingWrap = new FakeElement("div");
    const taskReminderExistingList = new FakeElement("div");
    const taskReminderSaveBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");

    domRefs.taskReminderModal = taskReminderModal;
    domRefs.taskReminderDays = taskReminderDays;
    domRefs.taskReminderCustomInput = taskReminderCustomInput;
    domRefs.taskReminderCustomAdd = taskReminderCustomAdd;
    domRefs.taskReminderExistingWrap = taskReminderExistingWrap;
    domRefs.taskReminderExistingList = taskReminderExistingList;
    domRefs.taskReminderSaveBtn = taskReminderSaveBtn;
    domRefs.taskReminderCloseButtons = [closeBtn];

    state.tasksCache = [{ id: "task-empty", reminders: [] }];

    const module = await import("../src/ui/tasks/task-reminders.js");
    module.initTaskReminderModal();
    module.openTaskReminderModal("task-empty");

    assert.strictEqual(taskReminderExistingWrap.classList.contains("hidden"), true);

    module.cleanupTaskReminderModal();
    global.document = originalDocument;
  });

  it("opens the reminder modal and renders existing reminders", async () => {
    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.className = "";
        this.textContent = "";
        this.value = "";
        this._listeners = new Map();
        this._classSet = new Set();
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }

      focus() {}
    }

    const originalDocument = global.document;
    const originalSetTimeout = global.setTimeout;
    global.document = {
      body: new FakeElement("body"),
      createElement: (tag) => new FakeElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.document.body.classList = {
      add: () => {},
      remove: () => {}
    };
    global.setTimeout = (handler) => {
      handler();
      return 0;
    };

    const taskReminderModal = new FakeElement("div");
    taskReminderModal.classList.add("hidden");
    const taskReminderDays = new FakeElement("div");
    const taskReminderCustomInput = new FakeElement("input");
    const taskReminderCustomAdd = new FakeElement("button");
    const taskReminderExistingWrap = new FakeElement("div");
    const taskReminderExistingList = new FakeElement("div");
    const taskReminderSaveBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");

    domRefs.taskReminderModal = taskReminderModal;
    domRefs.taskReminderDays = taskReminderDays;
    domRefs.taskReminderCustomInput = taskReminderCustomInput;
    domRefs.taskReminderCustomAdd = taskReminderCustomAdd;
    domRefs.taskReminderExistingWrap = taskReminderExistingWrap;
    domRefs.taskReminderExistingList = taskReminderExistingList;
    domRefs.taskReminderSaveBtn = taskReminderSaveBtn;
    domRefs.taskReminderCloseButtons = [closeBtn];

    function findByTestAttr(root, value) {
      if (!root) {return null;}
      if (root.attributes?.["data-test-skedpal"] === value) {return root;}
      for (const child of root.children || []) {
        const found = findByTestAttr(child, value);
        if (found) {return found;}
      }
      return null;
    }

    const fiveMinutesDays = (5 * 60) / 86400;
    const ninetyMinutesDays = (90 * 60) / 86400;
    state.tasksCache = [
      {
        id: "task-1",
        reminders: [
          { id: "r1", days: 2, remindAt: "2026-01-11T10:00:00.000Z", dismissedAt: "" },
          { id: "r2", days: 1, remindAt: "2026-01-10T10:00:00.000Z", dismissedAt: "" },
          { id: "r3", days: 4, remindAt: "2026-01-12T10:00:00.000Z", dismissedAt: "2026-01-09T10:00:00.000Z" },
          { id: "r4", days: 6, remindAt: "invalid-date", dismissedAt: "" },
          { id: "r5", days: fiveMinutesDays, remindAt: "2026-01-10T10:05:00.000Z", dismissedAt: "" },
          { id: "r6", days: ninetyMinutesDays, remindAt: "2026-01-10T11:30:00.000Z", dismissedAt: "" }
        ]
      }
    ];

    const module = await import("../src/ui/tasks/task-reminders.js");
    module.initTaskReminderModal();
    module.openTaskReminderModal("task-1");

    assert.strictEqual(taskReminderModal.classList.contains("hidden"), false);
    assert.strictEqual(taskReminderExistingList.children.length, 6);
    assert.ok(
      (taskReminderExistingList.children[0].children[0].textContent || "").includes("In 1 day")
    );
    assert.ok(
      [...taskReminderExistingList.children].some((row) =>
        (row.children[0]?.textContent || "").includes("minutes")
      )
    );
    assert.ok(
      [...taskReminderExistingList.children].some((row) =>
        (row.children[0]?.textContent || "").includes("hours")
      )
    );
    assert.ok(findByTestAttr(taskReminderExistingList, "task-reminder-existing-dismissed"));

    taskReminderCustomInput.value = "1";
    const addHandlers = taskReminderCustomAdd._listeners.get("click");
    [...addHandlers][0]();
    assert.strictEqual(findByTestAttr(taskReminderExistingList, "task-reminder-pending-item"), null);

    taskReminderCustomInput.value = "3";
    [...addHandlers][0]();
    assert.ok(findByTestAttr(taskReminderExistingList, "task-reminder-pending-item"));

    module.cleanupTaskReminderModal();
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  });

  it("anchors the reminder modal near the click position", async () => {
    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.className = "";
        this.textContent = "";
        this.value = "";
        this.style = {};
        this._listeners = new Map();
        this._classSet = new Set();
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
      }

      querySelector(selector) {
        if (selector === '[data-test-skedpal="task-reminder-panel"]') {
          return this.children.find(
            (child) => child.attributes?.["data-test-skedpal"] === "task-reminder-panel"
          );
        }
        return null;
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }
    }

    const originalDocument = global.document;
    const originalSetTimeout = global.setTimeout;
    const originalRaf = global.requestAnimationFrame;
    const originalWindow = global.window;
    const originalHTMLElement = global.HTMLElement;

    global.window = { innerWidth: 800, innerHeight: 600 };
    global.HTMLElement = FakeElement;
    global.requestAnimationFrame = (cb) => cb();
    global.document = {
      body: new FakeElement("body"),
      createElement: (tag) => new FakeElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.document.body.classList = {
      add: () => {},
      remove: () => {}
    };
    global.setTimeout = (handler) => {
      handler();
      return 0;
    };

    const taskReminderModal = new FakeElement("div");
    taskReminderModal.classList.add("hidden");
    const taskReminderPanel = new FakeElement("div");
    taskReminderPanel.setAttribute("data-test-skedpal", "task-reminder-panel");
    taskReminderPanel.getBoundingClientRect = () => ({ width: 360, height: 420 });
    taskReminderModal.appendChild(taskReminderPanel);

    const taskReminderDays = new FakeElement("div");
    const taskReminderCustomInput = new FakeElement("input");
    const taskReminderCustomAdd = new FakeElement("button");
    const taskReminderExistingWrap = new FakeElement("div");
    const taskReminderExistingList = new FakeElement("div");
    const taskReminderSaveBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");

    domRefs.taskReminderModal = taskReminderModal;
    domRefs.taskReminderDays = taskReminderDays;
    domRefs.taskReminderCustomInput = taskReminderCustomInput;
    domRefs.taskReminderCustomAdd = taskReminderCustomAdd;
    domRefs.taskReminderExistingWrap = taskReminderExistingWrap;
    domRefs.taskReminderExistingList = taskReminderExistingList;
    domRefs.taskReminderSaveBtn = taskReminderSaveBtn;
    domRefs.taskReminderCloseButtons = [closeBtn];

    state.tasksCache = [{ id: "task-2", reminders: [] }];

    const module = await import("../src/ui/tasks/task-reminders.js");
    module.initTaskReminderModal();
    module.openTaskReminderModal("task-2", { event: { clientX: 200, clientY: 150 } });

    assert.strictEqual(taskReminderPanel.style.position, "fixed");
    assert.ok(taskReminderPanel.style.left);
    assert.ok(taskReminderPanel.style.top);

    module.cleanupTaskReminderModal();
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
    global.requestAnimationFrame = originalRaf;
    global.window = originalWindow;
    global.HTMLElement = originalHTMLElement;
  });

  it("anchors the reminder modal using target bounds when click coords missing", async () => {
    class FakeElement {
      constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.className = "";
        this.textContent = "";
        this.value = "";
        this.style = {};
        this._listeners = new Map();
        this._classSet = new Set();
        this.classList = {
          add: (...names) => names.forEach((n) => this._classSet.add(n)),
          remove: (...names) => names.forEach((n) => this._classSet.delete(n)),
          toggle: (name, force) => {
            if (force === undefined) {
              if (this._classSet.has(name)) {this._classSet.delete(name);}
              else {this._classSet.add(name);}
              return;
            }
            if (force) {this._classSet.add(name);}
            else {this._classSet.delete(name);}
          },
          contains: (name) => this._classSet.has(name)
        };
      }

      appendChild(child) {
        this.children.push(child);
        return child;
      }

      setAttribute(name, value) {
        this.attributes[name] = value;
      }

      querySelector(selector) {
        if (selector === '[data-test-skedpal="task-reminder-panel"]') {
          return this.children.find(
            (child) => child.attributes?.["data-test-skedpal"] === "task-reminder-panel"
          );
        }
        return null;
      }

      addEventListener(type, handler) {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type).add(handler);
      }

      removeEventListener(type, handler) {
        this._listeners.get(type)?.delete(handler);
      }

      getBoundingClientRect() {
        return { left: 100, top: 120, width: 40, height: 20 };
      }
    }

    const originalDocument = global.document;
    const originalSetTimeout = global.setTimeout;
    const originalRaf = global.requestAnimationFrame;
    const originalWindow = global.window;
    const originalHTMLElement = global.HTMLElement;

    global.window = { innerWidth: 800, innerHeight: 600 };
    global.HTMLElement = FakeElement;
    global.requestAnimationFrame = (cb) => cb();
    global.document = {
      body: new FakeElement("body"),
      createElement: (tag) => new FakeElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    global.document.body.classList = {
      add: () => {},
      remove: () => {}
    };
    global.setTimeout = (handler) => {
      handler();
      return 0;
    };

    const taskReminderModal = new FakeElement("div");
    taskReminderModal.classList.add("hidden");
    const taskReminderPanel = new FakeElement("div");
    taskReminderPanel.setAttribute("data-test-skedpal", "task-reminder-panel");
    taskReminderPanel.getBoundingClientRect = () => ({ width: 360, height: 420 });
    taskReminderModal.appendChild(taskReminderPanel);

    const taskReminderDays = new FakeElement("div");
    const taskReminderCustomInput = new FakeElement("input");
    const taskReminderCustomAdd = new FakeElement("button");
    const taskReminderExistingWrap = new FakeElement("div");
    const taskReminderExistingList = new FakeElement("div");
    const taskReminderSaveBtn = new FakeElement("button");
    const closeBtn = new FakeElement("button");

    domRefs.taskReminderModal = taskReminderModal;
    domRefs.taskReminderDays = taskReminderDays;
    domRefs.taskReminderCustomInput = taskReminderCustomInput;
    domRefs.taskReminderCustomAdd = taskReminderCustomAdd;
    domRefs.taskReminderExistingWrap = taskReminderExistingWrap;
    domRefs.taskReminderExistingList = taskReminderExistingList;
    domRefs.taskReminderSaveBtn = taskReminderSaveBtn;
    domRefs.taskReminderCloseButtons = [closeBtn];

    state.tasksCache = [{ id: "task-3", reminders: [] }];

    const module = await import("../src/ui/tasks/task-reminders.js");
    module.initTaskReminderModal();
    module.openTaskReminderModal("task-3", { event: { target: new FakeElement("button") } });

    assert.strictEqual(taskReminderPanel.style.position, "fixed");
    assert.ok(taskReminderPanel.style.left);
    assert.ok(taskReminderPanel.style.top);

    module.cleanupTaskReminderModal();
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
    global.requestAnimationFrame = originalRaf;
    global.window = originalWindow;
    global.HTMLElement = originalHTMLElement;
  });

  it("filters overdue reminders and skips dismissed entries", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { getOverdueReminders } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    const now = new Date("2026-01-10T10:00:00.000Z");
    const task = {
      reminders: [
        { id: "r1", days: 1, remindAt: "2026-01-09T10:00:00.000Z", dismissedAt: "" },
        { id: "r2", days: 1, remindAt: "2026-01-11T10:00:00.000Z", dismissedAt: "" },
        { id: "r3", days: 1, remindAt: "2026-01-08T10:00:00.000Z", dismissedAt: "2026-01-08T12:00:00.000Z" }
      ]
    };

    const overdue = getOverdueReminders(task, now);
    assert.strictEqual(overdue.length, 1);
    assert.strictEqual(overdue[0].id, "r1");

    const completedOverdue = getOverdueReminders({ ...task, completed: true }, now);
    assert.deepStrictEqual(completedOverdue, []);
  });

  it("returns empty overdue list for invalid dates", async () => {
    const originalDocument = global.document;
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    const { getOverdueReminders } = await import("../src/ui/tasks/task-reminders.js");
    global.document = originalDocument;

    const overdue = getOverdueReminders({ reminders: [] }, "not-a-date");
    assert.deepStrictEqual(overdue, []);
  });

  it("removes a reminder by id", () => {
    const reminders = [
      { id: "r1", days: 1, remindAt: "2026-01-01T00:00:00.000Z" },
      { id: "r2", days: 2, remindAt: "2026-01-02T00:00:00.000Z" }
    ];

    const result = removeReminderEntry(reminders, "r1");

    assert.strictEqual(result.removed, true);
    assert.strictEqual(result.reminders.length, 1);
    assert.strictEqual(result.reminders[0].id, "r2");
  });

  it("merges reminder days without duplicating existing entries", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const existing = [
      { id: "r1", days: 2, remindAt: "2026-01-12T10:00:00.000Z", dismissedAt: "" }
    ];
    const result = mergeReminderEntries(existing, [2, 3], now);

    assert.strictEqual(result.added, true);
    assert.strictEqual(result.reminders.length, 2);
    assert.ok(result.reminders.some((entry) => entry.days === 3));
  });

  it("returns existing reminders when no new days are added", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const existing = [
      { id: "r1", days: 2, remindAt: "2026-01-12T10:00:00.000Z", dismissedAt: "" }
    ];
    const result = mergeReminderEntries(existing, [2], now);

    assert.strictEqual(result.added, false);
    assert.strictEqual(result.reminders.length, 1);
  });

  it("normalizes reminders and drops invalid entries", () => {
    const reminders = normalizeReminders([
      { id: "", days: 2, remindAt: "2026-01-12T10:00:00.000Z", dismissedAt: "" },
      { id: "r2", days: 0, remindAt: "", dismissedAt: "" }
    ]);
    assert.strictEqual(reminders.length, 1);
    assert.ok(reminders[0].id);
    assert.strictEqual(reminders[0].days, 2);
  });

  it("returns empty reminders when input is not an array", () => {
    const reminders = normalizeReminders(null);
    assert.deepStrictEqual(reminders, []);
  });

  it("builds reminder entries using non-Date inputs", () => {
    const entry = buildReminderEntry(1, "2026-01-10T10:00:00.000Z");
    assert.strictEqual(entry.days, 1);
    assert.ok(entry.remindAt);
    assert.ok(entry.createdAt);
  });

  it("ignores non-array reminder day inputs", () => {
    const existing = [
      { id: "r1", days: 2, remindAt: "2026-01-12T10:00:00.000Z", dismissedAt: "" }
    ];
    const result = mergeReminderEntries(existing, "bad");
    assert.strictEqual(result.added, false);
    assert.strictEqual(result.reminders.length, 1);
  });

  it("returns unchanged reminders when id is missing", () => {
    const reminders = [
      { id: "r1", days: 1, remindAt: "2026-01-01T00:00:00.000Z" }
    ];

    const result = removeReminderEntry(reminders, "");

    assert.strictEqual(result.removed, false);
    assert.strictEqual(result.reminders.length, 1);
    assert.strictEqual(result.reminders[0].id, "r1");
  });

  it("handles non-array reminder inputs", () => {
    const result = removeReminderEntry(null, "r1");
    assert.deepStrictEqual(result, { reminders: [], removed: false });
  });
});
