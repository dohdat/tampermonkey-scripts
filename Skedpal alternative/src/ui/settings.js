import { getSettings, saveSettings, DEFAULT_SETTINGS } from "../data/db.js";
import { domRefs } from "./constants.js";
import { state } from "./state/page-state.js";
import { normalizeHorizonDays } from "./utils.js";

const { horizonInput } = domRefs;

export async function initSettings(prefetchedSettings) {
  const settings = prefetchedSettings || (await getSettings());
  state.settingsCache = { ...DEFAULT_SETTINGS, ...settings };
  if (horizonInput) {
    const min = Number(horizonInput.min) || 1;
    const max = Number(horizonInput.max) || 60;
    const fallback = 14;
    const normalizeHorizonInput = () => {
      const days = normalizeHorizonDays(horizonInput.value, min, max, fallback);
      horizonInput.value = String(days);
      return days;
    };
    const savePromise = (promise) => {
      state.pendingSettingsSave = promise;
      promise.finally(() => {
        if (state.pendingSettingsSave === promise) {
          state.pendingSettingsSave = null;
        }
      });
    };
    horizonInput.value = String(
      normalizeHorizonDays(state.settingsCache.schedulingHorizonDays, min, max, fallback)
    );
    const persist = async () => {
      const days = normalizeHorizonInput();
      state.settingsCache = { ...state.settingsCache, schedulingHorizonDays: days };
      const promise = saveSettings(state.settingsCache);
      savePromise(promise);
      await promise;
    };
    const persistSafely = () => {
      void persist().catch((error) => {
        console.warn("Failed to save horizon setting.", error);
      });
    };
    horizonInput.addEventListener("input", persistSafely);
    horizonInput.addEventListener("change", persistSafely);
  }
}
