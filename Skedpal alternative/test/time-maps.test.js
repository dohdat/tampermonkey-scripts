import assert from "assert";
import { describe, it, beforeEach } from "mocha";

function createRow({
  day,
  checked,
  blocks = []
}) {
  return {
    dataset: { dayRow: String(day) },
    querySelector: (selector) => {
      if (selector === "input[type='checkbox']") {
        return { checked };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === "[data-block]") {
        return blocks.map((block) => ({
          querySelector: (inputSelector) => {
            if (inputSelector === "input[data-start-for]") {
              return { value: block.startTime };
            }
            if (inputSelector === "input[data-end-for]") {
              return { value: block.endTime };
            }
            return null;
          }
        }));
      }
      return [];
    }
  };
}

const elements = new Map();
elements.set("timemap-id", { value: "" });
elements.set("timemap-name", { value: "" });
elements.set("timemap-color", { value: "#22c55e" });
elements.set("timemap-day-rows", {
  querySelectorAll: () => []
});

function installDomStubs() {
  global.document = {
    querySelectorAll: () => [],
    getElementById: (id) => elements.get(id) || null
  };
  global.alert = () => {};
  global.crypto = {
    randomUUID: () => "tm-uuid"
  };
}

installDomStubs();
const { domRefs } = await import("../src/ui/constants.js");
domRefs.timeMapColorInput = elements.get("timemap-color");
domRefs.timeMapDayRows = elements.get("timemap-day-rows");
const timeMaps = await import("../src/ui/time-maps.js");
const { collectSelectedValues, collectTimeMapRules, getTimeMapFormData } = timeMaps;

describe("time maps", () => {
  beforeEach(() => {
    installDomStubs();
    domRefs.timeMapColorInput = elements.get("timemap-color");
    domRefs.timeMapDayRows = elements.get("timemap-day-rows");
  });
  it("collects selected checkbox values", () => {
    const container = {
      querySelectorAll: () => [{ value: "1" }, { value: "tm-a" }, { value: "42" }]
    };
    assert.deepStrictEqual(collectSelectedValues(container), [1, "tm-a", 42]);
  });

  it("collects and sorts time map rules", () => {
    const container = {
      querySelectorAll: () => [
        createRow({
          day: 2,
          checked: true,
          blocks: [
            { startTime: "09:00", endTime: "12:00" },
            { startTime: "13:00", endTime: "12:00" }
          ]
        }),
        createRow({
          day: 1,
          checked: true,
          blocks: [{ startTime: "10:00", endTime: "11:00" }]
        }),
        createRow({ day: 3, checked: false, blocks: [{ startTime: "09:00", endTime: "10:00" }] })
      ]
    };
    const rules = collectTimeMapRules(container);
    assert.deepStrictEqual(rules, [
      { day: 1, startTime: "10:00", endTime: "11:00" },
      { day: 2, startTime: "09:00", endTime: "12:00" }
    ]);
  });

  it("builds time map form data and validates inputs", () => {
    let alertMessage = "";
    global.alert = (msg) => {
      alertMessage = msg;
    };

    elements.get("timemap-name").value = "";
    elements.get("timemap-day-rows").querySelectorAll = () => [];
    assert.strictEqual(getTimeMapFormData(), null);
    assert.strictEqual(alertMessage, "Select at least one day and a valid time window.");

    alertMessage = "";
    elements.get("timemap-name").value = "Work";
    elements.get("timemap-day-rows").querySelectorAll = () => [
      createRow({
        day: 1,
        checked: true,
        blocks: [{ startTime: "09:00", endTime: "12:00" }]
      })
    ];
    const data = getTimeMapFormData();
    assert.strictEqual(alertMessage, "");
    assert.deepStrictEqual(data, {
      id: "tm-uuid",
      name: "Work",
      rules: [{ day: 1, startTime: "09:00", endTime: "12:00" }],
      color: "#22c55e"
    });
  });
});
