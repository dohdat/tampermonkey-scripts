import { getSettings, saveSettings, DEFAULT_SETTINGS } from "../data/db.js";
import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";

const { horizonInput } = domRefs;

export async function initSettings(prefetchedSettings) {
  const settings = prefetchedSettings || (await getSettings());
  state.settingsCache = { ...DEFAULT_SETTINGS, ...settings };
  if (horizonInput) {
    horizonInput.value = state.settingsCache.schedulingHorizonDays;
    horizonInput.addEventListener("change", async () => {
      const days = Number(horizonInput.value) || 14;
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: days };
      await saveSettings(state.settingsCache);
    });
  }
}
