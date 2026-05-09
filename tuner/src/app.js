import { renderStrudel } from "../../lib/generator.js";
import { SCALE_POOL, SYNTHS } from "../../lib/mapping.js";
import { defaults } from "../../lib/defaults.js";
import { mountCharViz, animateCharViz, clearCharViz, nextCycleDelayMs } from "../../lib/charviz.js";

const STORAGE_KEY = "ens-tuner-state-v1";

let state = loadState();
let userEdited = false;
let strudelReady = false;
let strudelMod = null;
let strudelRepl = null;
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

const DEFAULT_NAMES = [
  "vitalik.eth",
  "lumir.eth",
  "betacaroten.eth",
  "mrq.eth",
  "abi.eth",
  "aata.eth",
  "alžběta.eth",
];

function getNamesList() {
  return $("names").value.split("\n").map((s) => s.trim()).filter(Boolean);
}

function getCurrentName() {
  const ta = $("names");
  const before = ta.value.slice(0, ta.selectionStart ?? 0);
  const lineIdx = before.split("\n").length - 1;
  const lines = ta.value.split("\n");
  const cursorLine = (lines[lineIdx] ?? "").trim();
  if (cursorLine) return cursorLine;
  const first = getNamesList()[0];
  return first || "";
}

function regenerate(force = false) {
  if (userEdited && !force) {
    setStatus("Code is manually edited — slider changes won't auto-update. Click Reset to regenerate.", true);
    return;
  }
  const name = getCurrentName();
  const { code, durationSeconds, noteSeconds, events } = renderStrudel(name, { ...state, scope: true });
  $("code").value = code;
  lastDuration = durationSeconds;
  lastNoteSeconds = noteSeconds;
  lastEvents = events;
  renderCharViz(name);
  userEdited = false;
  setStatus(
    name ? `Generated for "${name}" (one pass: ${durationSeconds.toFixed(1)}s)` : "Add a name above",
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
  strudelRepl = await strudelMod.initStrudel({
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
    const delayMs = nextCycleDelayMs(strudelRepl);
    setTimeout(startViz, delayMs);
    if (lastDuration > 0) {
      setStatus(`Playing… auto-stop in ${lastDuration.toFixed(1)}s`, false);
      stopTimer = setTimeout(() => {
        const hush = strudelMod?.hush || window.hush;
        if (hush) hush();
        cancelViz();
        setStatus("Done.", false);
        stopTimer = null;
      }, delayMs + lastDuration * 1000);
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

let playAllAbort = null;

async function onPlayAll() {
  const names = getNamesList();
  if (!names.length) return;
  if (playAllAbort) playAllAbort.aborted = true;
  const aborter = { aborted: false };
  playAllAbort = aborter;
  setStatus(`Play all: ${names.length} names…`, false);
  for (let i = 0; i < names.length; i++) {
    if (aborter.aborted) return;
    const name = names[i];
    setSelectedLine(i);
    regenerate(true);
    await onPlay();
    const ms = (lastDuration > 0 ? lastDuration * 1000 : 1500) + 250;
    await new Promise((r) => setTimeout(r, ms));
  }
  if (!aborter.aborted) setStatus("Play all: done.", false);
  if (playAllAbort === aborter) playAllAbort = null;
}

function setSelectedLine(idx) {
  const ta = $("names");
  const lines = ta.value.split("\n");
  let pos = 0;
  for (let i = 0; i < idx && i < lines.length; i++) pos += lines[i].length + 1;
  ta.focus();
  ta.setSelectionRange(pos, pos + (lines[idx]?.length ?? 0));
}

function init() {
  const namesTa = $("names");
  if (!namesTa.value.trim()) {
    namesTa.value = DEFAULT_NAMES.join("\n");
  }
  const onCursorMove = () => regenerate();
  namesTa.addEventListener("input", onCursorMove);
  namesTa.addEventListener("keyup", onCursorMove);
  namesTa.addEventListener("click", onCursorMove);
  namesTa.addEventListener("focus", onCursorMove);

  $("play").addEventListener("click", onPlay);
  $("stop").addEventListener("click", () => {
    if (playAllAbort) playAllAbort.aborted = true;
    onStop();
  });
  $("play-all").addEventListener("click", onPlayAll);
  $("reset").addEventListener("click", () => regenerate(true));
  $("export-defaults").addEventListener("click", onExportDefaults);

  $("code").addEventListener("input", () => {
    userEdited = true;
    setStatus("Manually edited — Play uses your edits. Reset to regenerate.", true);
  });

  bindCheckbox("lock-scale", "lockScale");
  bindSelect("locked-scale", "lockedScale", SCALE_POOL);

  bindCheckbox("lock-cpm", "lockCpm");
  bindIntRange("locked-cpm", "lockedCpm");
  bindIntRange("cpm-base", "cpmBase");
  bindIntRange("cpm-range", "cpmRange");

  bindSizesText("sub-sizes", "subSizes");
  bindIntRange("sub-step", "subStep");

  bindCheckbox("lead-enabled", "leadEnabled");
  bindSelect("lead-synth", "leadSynth", SYNTHS);
  bindAdsr("lead", "leadAdsr");
  bindRange("lead-gain", "leadGain");

  bindCheckbox("pad-enabled", "padEnabled");
  bindSelect("pad-synth", "padSynth", SYNTHS);
  bindAdsr("pad", "padAdsr");
  bindRange("pad-gain", "padGain");

  bindCheckbox("drone-enabled", "droneEnabled");
  bindRange("drone-gain", "droneGain");

  const params = new URLSearchParams(location.search);
  const handoff = params.get("name");
  if (handoff) {
    const existing = namesTa.value.split("\n").map((s) => s.trim());
    if (!existing.includes(handoff)) {
      namesTa.value = handoff + "\n" + namesTa.value;
    }
    setSelectedLine(0);
  }

  regenerate(true);
}

document.addEventListener("DOMContentLoaded", init);
