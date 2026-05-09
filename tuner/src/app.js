import { renderStrudel } from "../../lib/generator.js";
import { SCALE_POOL, SYNTHS } from "../../lib/mapping.js";
import { defaults } from "../../lib/defaults.js";
import { mountCharViz, animateCharViz, clearCharViz } from "../../lib/charviz.js";

const STORAGE_KEY = "ens-tuner-state-v1";

let state = loadState();
let userEdited = false;
let strudelReady = false;
let strudelMod = null;
let lastDuration = 0;
let lastNoteSeconds = 0.1;
let lastEvents = 0;
let charSpans = [];
let stopTimer = null;
let cancelVizFn = () => {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaults);
    return { ...clone(defaults), ...JSON.parse(raw) };
  } catch {
    return clone(defaults);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function $(id) { return document.getElementById(id); }

function regenerate(force = false) {
  if (userEdited && !force) {
    setStatus("Code is manually edited — slider changes won't auto-update. Click Reset to regenerate.", true);
    return;
  }
  const name = $("name").value;
  const { code, durationSeconds, noteSeconds, events } = renderStrudel(name, state);
  $("code").value = code;
  lastDuration = durationSeconds;
  lastNoteSeconds = noteSeconds;
  lastEvents = events;
  renderCharViz(name);
  userEdited = false;
  setStatus(
    name ? `Generated for "${name}" (one pass: ${durationSeconds.toFixed(1)}s)` : "Type a name above",
    false
  );
}

function renderCharViz(name) {
  charSpans = mountCharViz($("char-viz"), name);
}

function startViz() {
  cancelVizFn();
  cancelVizFn = animateCharViz(charSpans, lastNoteSeconds, lastEvents);
}

function cancelViz() {
  cancelVizFn();
  cancelVizFn = () => {};
  clearCharViz(charSpans);
}

function setStatus(msg, dirty) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("dirty", !!dirty);
}

async function ensureStrudel() {
  if (strudelReady) return;
  setStatus("Loading Strudel…", false);
  strudelMod = await import("@strudel/web");
  await strudelMod.initStrudel({
    prebake: () => {},
  });
  strudelReady = true;
  setStatus("Strudel ready.", false);
}

async function onPlay() {
  try {
    await ensureStrudel();
    clearStopTimer();
    const code = $("code").value;
    const evalFn = strudelMod.evaluate || window.evaluate;
    if (!evalFn) throw new Error("Strudel evaluate() not available");
    await evalFn(code);
    startViz();
    if (lastDuration > 0) {
      setStatus(`Playing… auto-stop in ${lastDuration.toFixed(1)}s`, false);
      stopTimer = setTimeout(() => {
        const hush = strudelMod?.hush || window.hush;
        if (hush) hush();
        cancelViz();
        setStatus("Done.", false);
        stopTimer = null;
      }, lastDuration * 1000);
    } else {
      setStatus("Playing.", false);
    }
  } catch (e) {
    console.error(e);
    setStatus("Play failed: " + (e.message || e), true);
  }
}

async function onExportDefaults() {
  const json = JSON.stringify(state, null, 2);
  const objLiteral = json.replace(/^(\s+)"([A-Za-z_][\w]*)":/gm, "$1$2:");
  const text = `export const defaults = ${objLiteral};\n`;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Current settings copied as `defaults` — paste into lib/defaults.js.", false);
  } catch {
    console.log(text);
    setStatus("Clipboard blocked — see console for the defaults block.", true);
  }
}

function onStop() {
  clearStopTimer();
  cancelViz();
  try {
    const hush = strudelMod?.hush || window.hush;
    if (hush) hush();
    setStatus("Stopped.", false);
  } catch (e) {
    console.error(e);
  }
}

function clearStopTimer() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
}

function bindRange(id, key, format = (v) => v.toFixed(2)) {
  const el = $(id);
  const valEl = $(id + "-val");
  el.value = state[key];
  valEl.textContent = format(+el.value);
  el.addEventListener("input", () => {
    state[key] = +el.value;
    valEl.textContent = format(+el.value);
    saveState();
    regenerate();
  });
}

function bindIntRange(id, key) {
  bindRange(id, key, (v) => String(Math.round(v)));
  const el = $(id);
  el.addEventListener("input", () => { state[key] = Math.round(+el.value); });
}

function bindText(id, key) {
  const el = $(id);
  el.value = state[key] ?? "";
  el.addEventListener("input", () => {
    state[key] = el.value;
    saveState();
    regenerate();
  });
}

function populateDatalist(id, options) {
  const el = $(id);
  el.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    el.appendChild(o);
  }
}

function bindSizesText(id, key) {
  const el = $(id);
  el.value = (state[key] || []).join(" ");
  el.addEventListener("input", () => {
    state[key] = parseSizes(el.value);
    saveState();
    regenerate();
  });
}

function parseSizes(s) {
  return s
    .split(/[\s,]+/)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isInteger(n) && n >= 2 && n <= 8);
}

function bindCheckbox(id, key) {
  const el = $(id);
  el.checked = !!state[key];
  el.addEventListener("change", () => {
    state[key] = el.checked;
    saveState();
    regenerate();
  });
}

function bindSelect(id, key, options) {
  const el = $(id);
  el.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    el.appendChild(o);
  }
  el.value = state[key];
  el.addEventListener("change", () => {
    state[key] = el.value;
    saveState();
    regenerate();
  });
}

function bindAdsr(prefix, key) {
  const labels = ["a", "d", "s", "r"];
  for (let i = 0; i < 4; i++) {
    const slider = $(`${prefix}-${labels[i]}`);
    const valEl = $(`${prefix}-${labels[i]}-val`);
    slider.value = state[key][i];
    valEl.textContent = (+slider.value).toFixed(2);
    slider.addEventListener("input", () => {
      state[key][i] = +slider.value;
      valEl.textContent = (+slider.value).toFixed(2);
      saveState();
      regenerate();
    });
  }
}

function bindExamples() {
  $("examples").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("pill")) {
      $("name").value = t.dataset.name;
      regenerate(true);
    }
  });
}

function init() {
  $("name").addEventListener("input", () => regenerate());
  $("play").addEventListener("click", onPlay);
  $("stop").addEventListener("click", onStop);
  $("reset").addEventListener("click", () => regenerate(true));
  $("export-defaults").addEventListener("click", onExportDefaults);

  $("code").addEventListener("input", () => {
    userEdited = true;
    setStatus("Manually edited — Play uses your edits. Reset to regenerate.", true);
  });

  bindCheckbox("lock-scale", "lockScale");
  populateDatalist("scale-suggestions", SCALE_POOL);
  bindText("locked-scale", "lockedScale");

  bindCheckbox("lock-cpm", "lockCpm");
  bindIntRange("locked-cpm", "lockedCpm");
  bindIntRange("cpm-base", "cpmBase");
  bindIntRange("cpm-range", "cpmRange");

  bindSizesText("sub-sizes", "subSizes");
  bindIntRange("sub-step", "subStep");
  bindIntRange("note-offset", "noteOffset");

  bindCheckbox("lead-enabled", "leadEnabled");
  bindSelect("lead-synth", "leadSynth", SYNTHS);
  bindAdsr("lead", "leadAdsr");
  bindRange("lead-gain", "leadGain");
  bindIntRange("lead-lpf", "leadLpf");
  bindIntRange("lead-hpf", "leadHpf");

  bindCheckbox("pad-enabled", "padEnabled");
  bindSelect("pad-synth", "padSynth", SYNTHS);
  bindAdsr("pad", "padAdsr");
  bindRange("pad-gain", "padGain");
  bindIntRange("pad-lpf", "padLpf");
  bindIntRange("pad-hpf", "padHpf");

  bindCheckbox("drone-enabled", "droneEnabled");
  bindRange("drone-gain", "droneGain");
  bindIntRange("drone-semitones", "droneSemitones");
  bindIntRange("drone-lpf", "droneLpf");
  bindIntRange("drone-hpf", "droneHpf");

  bindExamples();

  const params = new URLSearchParams(location.search);
  const handoff = params.get("name");
  if (handoff) $("name").value = handoff;

  regenerate(true);
}

document.addEventListener("DOMContentLoaded", init);
