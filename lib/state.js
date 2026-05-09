import { defaults } from "./defaults.js";

const STORAGE_KEY = "ens-tuner-state-v1";

export function loadOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaults);
    return { ...clone(defaults), ...JSON.parse(raw) };
  } catch {
    return clone(defaults);
  }
}

export function saveOptions(options) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); } catch {}
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
