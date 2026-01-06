import assert from "assert";
import { describe, it } from "mocha";

function createStubElement() {
  return {
    value: "",
    checked: false,
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    style: {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const elements = new Map();
elements.set("task-deadline", createStubElement());

global.document = {
  querySelectorAll: () => [],
  getElementById: (id) => elements.get(id) || null
};

const repeat = await import("../src/ui/repeat.js");
const { getRepeatSummary, buildRepeatFromState, repeatStore } = repeat;

describe("repeat utils", () => {
  it("summarizes weekly and monthly repeats", () => {
    const weekly = {
      type: "custom",
      unit: "week",
      interval: 2,
      weeklyDays: [1, 3],
      end: { type: "after", count: 3 }
    };
    const weeklySummary = getRepeatSummary(weekly);
    assert.ok(weeklySummary.includes("Every 2 weeks"));
    assert.ok(weeklySummary.includes("on Mon, Wed"));
    assert.ok(weeklySummary.includes("for 3 times"));

    const monthly = {
      type: "custom",
      unit: "month",
      interval: 1,
      monthlyMode: "nth",
      monthlyNth: 2,
      monthlyWeekday: 4
    };
    const monthlySummary = getRepeatSummary(monthly);
    assert.ok(monthlySummary.includes("Every 1 month"));
    assert.ok(monthlySummary.includes("on the 2nd Thu"));
  });

  it("builds rrule strings from state", () => {
    repeatStore.repeatState = {
      unit: "week",
      interval: 2,
      weeklyDays: [1, 3],
      end: { type: "after", count: 3 }
    };
    let built = buildRepeatFromState();
    assert.strictEqual(built.rrule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3");

    repeatStore.repeatState = {
      unit: "month",
      interval: 1,
      monthlyMode: "nth",
      monthlyNth: 2,
      monthlyWeekday: 4,
      end: { type: "on", date: "2026-02-10T12:00:00" }
    };
    built = buildRepeatFromState();
    assert.strictEqual(
      built.rrule,
      "FREQ=MONTHLY;INTERVAL=1;BYDAY=TH;BYSETPOS=2;UNTIL=20260210"
    );
  });
});
