import { renderStrudel } from "../../lib/generator.js";
import { SCALE_POOL, SYNTHS } from "../../lib/mapping.js";
import { loadOptions, saveOptions } from "../../lib/state.js";
import { defaults as fileDefaults } from "../../lib/defaults.js";
import { mountCharViz, animateCharViz, clearCharViz, nextCycleDelayMs, fitCanvasToCSS } from "../../lib/charviz.js";
import { connectMIDI, onCC, midiSupported, listInputs } from "../../lib/midi.js";

let state = loadOptions();
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
let isPlaying = false;

function saveState() {
  saveOptions(state);
}

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
  const result = renderStrudel(name, { ...state, scope: true });
  const { code, durationSeconds, noteSeconds, events, byteWeights, effectiveOptions } = result;
  $("code").value = code;
  lastDuration = durationSeconds;
  lastNoteSeconds = noteSeconds;
  lastEvents = events;
  renderCharViz(name, byteWeights);
  renderTweaks(effectiveOptions || state);
  renderNibbleMapLog((effectiveOptions || state).nibbleMap);
  userEdited = false;
  setStatus(
    name ? `Generated for "${name}" (one pass: ${durationSeconds.toFixed(1)}s)` : "Add a name above",
    false
  );
  liveReeval(code);
}

function liveReeval(code) {
  if (!isPlaying || !strudelMod) return;
  const evalFn = strudelMod.evaluate || window.evaluate;
  if (!evalFn) return;
  Promise.resolve(evalFn(code)).catch((e) => console.error("Live re-eval failed:", e));
}

function renderCharViz(name, byteWeights) {
  charSpans = mountCharViz($("char-viz"), name, { byteWeights });
}

function renderNibbleMapLog(map) {
  const el = $("nibble-map-log");
  if (!el) return;
  if (!Array.isArray(map) || map.length !== 16) {
    el.textContent = "";
    return;
  }
  const cells = map
    .map((v, i) => `<span><b>${i.toString(16).toUpperCase()}</b>→${v}</span>`)
    .join("");
  el.innerHTML = `<span class="muted">nibble → note: </span>${cells}`;
}

function renderTweaks(opts) {
  const container = $("tweaks-list");
  if (!container) return;
  container.innerHTML = "";
  const skip = new Set(["midiBindings"]);
  const diffs = [];
  for (const k of Object.keys(fileDefaults)) {
    if (skip.has(k)) continue;
    if (JSON.stringify(opts[k]) === JSON.stringify(fileDefaults[k])) continue;
    diffs.push({ key: k, current: opts[k], def: fileDefaults[k] });
  }
  if (diffs.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No tweaks — using file defaults.";
    container.appendChild(p);
    return;
  }
  for (const d of diffs) {
    const li = document.createElement("li");
    li.innerHTML = `<code>${d.key}</code>: ${formatTweakDiff(d.current, d.def)}`;
    container.appendChild(li);
  }
}

function formatTweakDiff(cur, def) {
  if (typeof cur === "number" && typeof def === "number") {
    const delta = cur - def;
    const sign = delta > 0 ? "+" : "";
    const round = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));
    return `<b>${round(cur)}</b> <span class="muted">(was ${round(def)}, ${sign}${round(delta)})</span>`;
  }
  if (typeof cur === "string" && typeof def === "string") {
    return `<b>"${cur}"</b> <span class="muted">(was "${def}")</span>`;
  }
  if (typeof cur === "boolean") {
    return `<b>${cur}</b> <span class="muted">(was ${def})</span>`;
  }
  if (Array.isArray(cur) && Array.isArray(def)) {
    return `<b>[${cur.join(", ")}]</b> <span class="muted">(was [${def.join(", ")}])</span>`;
  }
  return `<b>${JSON.stringify(cur)}</b> <span class="muted">(was ${JSON.stringify(def)})</span>`;
}

function startViz() {
  cancelVizFn();
  cancelVizFn = animateCharViz(charSpans, lastNoteSeconds, lastEvents, !!state.loopEnabled);
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
    isPlaying = true;
    const delayMs = nextCycleDelayMs(strudelRepl);
    setTimeout(startViz, delayMs);
    if (state.loopEnabled) {
      setStatus("Looping… click Stop to end.", false);
    } else if (lastDuration > 0) {
      setStatus(`Playing… auto-stop in ${lastDuration.toFixed(1)}s`, false);
      stopTimer = setTimeout(() => {
        const hush = strudelMod?.hush || window.hush;
        if (hush) hush();
        cancelViz();
        isPlaying = false;
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
  isPlaying = false;
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

let midiConnected = false;
let midiLearnMode = false;
let midiArmedId = null;
const midiPendingCC = new Map();
let midiRaf = 0;

async function onMidiClick() {
  try {
    if (!midiConnected) {
      if (!midiSupported()) {
        setStatus("Web MIDI not supported in this browser.", true);
        return;
      }
      await connectMIDI();
      onCC(handleCC);
      midiConnected = true;
      const inputs = listInputs();
      const desc = inputs.length ? inputs.map((i) => i.name).join(", ") : "no inputs";
      setStatus(`MIDI: ${desc}. Click MIDI again to enter Learn mode.`);
      $("midi").classList.add("connected");
      refreshMidiTags();
      return;
    }
    midiLearnMode = !midiLearnMode;
    document.body.classList.toggle("midi-learn", midiLearnMode);
    $("midi").classList.toggle("learn", midiLearnMode);
    if (midiLearnMode) {
      document.addEventListener("click", onLearnClick, true);
      setStatus("MIDI Learn: click a slider, then twist a knob. Click MIDI again to exit.");
    } else {
      document.removeEventListener("click", onLearnClick, true);
      midiArmedId = null;
      clearArmedHighlight();
      setStatus("MIDI ready. Twist your knobs.");
    }
  } catch (e) {
    console.error(e);
    setStatus("MIDI failed: " + (e.message || e), true);
  }
}

function isLearnable(el) {
  return el?.tagName === "INPUT" && el.id && (el.type === "range" || el.type === "checkbox");
}

function onLearnClick(e) {
  const el = e.target;
  if (!isLearnable(el)) return;
  e.preventDefault();
  e.stopPropagation();
  if (state.midiBindings?.[el.id] && midiArmedId !== el.id) {
    delete state.midiBindings[el.id];
    saveState();
    refreshMidiTags();
    setStatus(`Unbound ${el.id} · saved.`);
    midiArmedId = null;
    clearArmedHighlight();
    return;
  }
  clearArmedHighlight();
  midiArmedId = el.id;
  el.classList.add("midi-arm");
  setStatus(`Armed: ${el.id}. Twist a knob.`);
}

function clearArmedHighlight() {
  document.querySelectorAll(".midi-arm").forEach((e) => e.classList.remove("midi-arm"));
}

function handleCC(channel, cc, value, deviceName) {
  if (midiLearnMode && midiArmedId) {
    if (!state.midiBindings) state.midiBindings = {};
    state.midiBindings[midiArmedId] = { cc, channel, deviceName };
    saveState();
    refreshMidiTags();
    setStatus(`Bound CC ${cc} (${deviceName}) → ${midiArmedId} · saved.`);
    document.getElementById(midiArmedId)?.classList.remove("midi-arm");
    midiArmedId = null;
    return;
  }
  const bindings = state.midiBindings || {};
  let matched = false;
  for (const [id, b] of Object.entries(bindings)) {
    if (b.cc !== cc) continue;
    if (b.channel != null && b.channel !== channel) continue;
    if (b.deviceName && b.deviceName !== deviceName) continue;
    midiPendingCC.set(id, value);
    matched = true;
  }
  if (matched && !midiRaf) {
    midiRaf = requestAnimationFrame(() => {
      midiRaf = 0;
      for (const [id, v] of midiPendingCC) {
        applyMidiValue(document.getElementById(id), v);
      }
      midiPendingCC.clear();
    });
  } else if (!matched) {
    console.log(`MIDI in: device=${deviceName} ch=${channel} cc=${cc} val=${value}`);
  }
}

function applyMidiValue(el, cc) {
  if (!el) return;
  if (el.type === "checkbox") {
    const next = cc >= 64;
    if (el.checked === next) return;
    el.checked = next;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.type === "range") {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const step = parseFloat(el.step) || 1;
    let v = min + (cc / 127) * (max - min);
    v = Math.round(v / step) * step;
    if (v < min) v = min;
    if (v > max) v = max;
    if (parseFloat(el.value) === v) return;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function refreshMidiTags() {
  document.querySelectorAll(".midi-cc-tag").forEach((t) => t.remove());
  const bindings = state.midiBindings || {};
  for (const [id, b] of Object.entries(bindings)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const tag = document.createElement("span");
    tag.className = "midi-cc-tag";
    tag.textContent = `● CC ${b.cc}`;
    tag.title = "Click in Learn mode to unbind";
    el.insertAdjacentElement("afterend", tag);
  }
}

async function onExportMidi() {
  const json = JSON.stringify(state.midiBindings || {}, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    setStatus("MIDI mapping copied to clipboard.");
  } catch {
    console.log(json);
    setStatus("Clipboard blocked — mapping logged to console.", true);
  }
}

function onImportMidi() {
  const current = JSON.stringify(state.midiBindings || {}, null, 2);
  const input = prompt("Paste MIDI mapping JSON (replaces current):", current);
  if (input === null) return;
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
      throw new Error("expected an object");
    }
    for (const [id, b] of Object.entries(parsed)) {
      if (typeof b !== "object" || b === null || typeof b.cc !== "number") {
        throw new Error(`invalid binding for "${id}"`);
      }
    }
    state.midiBindings = parsed;
    saveState();
    refreshMidiTags();
    const n = Object.keys(parsed).length;
    setStatus(`Imported ${n} MIDI binding${n === 1 ? "" : "s"} · saved.`);
  } catch (e) {
    setStatus(`Import failed: ${e.message || e}`, true);
  }
}

function init() {
  fitCanvasToCSS($("test-canvas"));

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
  $("reset-state").addEventListener("click", () => {
    if (!confirm("Wipe saved tweaks and load defaults from file?")) return;
    localStorage.removeItem("ens-tuner-state-v1");
    location.reload();
  });
  $("shuffle-nibbles").addEventListener("click", () => {
    const map = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = map.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [map[i], map[j]] = [map[j], map[i]];
    }
    state.nibbleMap = map;
    saveState();
    regenerate(true);
    setStatus(`Nibble map shuffled: [${map.join(", ")}]`, false);
  });
  $("export-defaults").addEventListener("click", onExportDefaults);
  $("midi").addEventListener("click", onMidiClick);
  $("midi-export").addEventListener("click", onExportMidi);
  $("midi-import").addEventListener("click", onImportMidi);

  $("code").addEventListener("input", () => {
    userEdited = true;
    setStatus("Manually edited — Play uses your edits. Reset to regenerate.", true);
  });

  bindCheckbox("loop-enabled", "loopEnabled");
  bindCheckbox("lock-scale", "lockScale");
  populateDatalist("scale-suggestions", SCALE_POOL);
  bindText("locked-scale", "lockedScale");
  bindIntRange("locked-cpm", "lockedCpm");

  bindSizesText("sub-sizes", "subSizes");
  bindIntRange("sub-step", "subStep");
  bindIntRange("note-offset", "noteOffset");
  bindIntRange("high-nibble-offset", "highNibbleOffset");
  bindIntRange("low-nibble-offset", "lowNibbleOffset");
  bindCheckbox("start-from-zero", "startFromZero");

  bindCheckbox("lead-enabled", "leadEnabled");
  bindSelect("lead-synth", "leadSynth", SYNTHS);
  bindAdsr("lead", "leadAdsr");
  bindRange("lead-gain", "leadGain");
  bindIntRange("lead-lpf", "leadLpf");
  bindIntRange("lead-hpf", "leadHpf");
  bindRange("lead-lpq", "leadLpq", (v) => v.toFixed(1));
  bindRange("lead-shape", "leadShape");
  bindIntRange("lead-bpf", "leadBpf");
  bindRange("lead-bpq", "leadBpq", (v) => v.toFixed(1));
  bindRange("lead-vib", "leadVib", (v) => v.toFixed(1));
  bindRange("lead-detune", "leadDetune");
  bindRange("lead-fm", "leadFm", (v) => v.toFixed(1));
  bindRange("lead-fmh", "leadFmh", (v) => v.toFixed(1));

  bindCheckbox("pad-enabled", "padEnabled");
  bindSelect("pad-synth", "padSynth", SYNTHS);
  bindAdsr("pad", "padAdsr");
  bindRange("pad-gain", "padGain");
  bindIntRange("pad-lpf", "padLpf");
  bindIntRange("pad-hpf", "padHpf");
  bindRange("pad-lpq", "padLpq", (v) => v.toFixed(1));
  bindRange("pad-shape", "padShape");
  bindIntRange("pad-bpf", "padBpf");
  bindRange("pad-bpq", "padBpq", (v) => v.toFixed(1));
  bindRange("pad-vib", "padVib", (v) => v.toFixed(1));
  bindRange("pad-detune", "padDetune");
  bindRange("pad-fm", "padFm", (v) => v.toFixed(1));
  bindRange("pad-fmh", "padFmh", (v) => v.toFixed(1));

  bindCheckbox("drone-enabled", "droneEnabled");
  bindRange("drone-gain", "droneGain");
  bindIntRange("drone-semitones", "droneSemitones");
  bindIntRange("drone-lpf", "droneLpf");
  bindIntRange("drone-hpf", "droneHpf");
  bindRange("drone-lpq", "droneLpq", (v) => v.toFixed(1));
  bindRange("drone-shape", "droneShape");
  bindIntRange("drone-bpf", "droneBpf");
  bindRange("drone-bpq", "droneBpq", (v) => v.toFixed(1));
  bindRange("drone-vib", "droneVib", (v) => v.toFixed(1));
  bindRange("drone-detune", "droneDetune");
  bindRange("drone-fm", "droneFm", (v) => v.toFixed(1));
  bindRange("drone-fmh", "droneFmh", (v) => v.toFixed(1));

  bindCheckbox("aux-enabled", "auxEnabled");
  bindSelect("aux-synth", "auxSynth", SYNTHS);
  bindAdsr("aux", "auxAdsr");
  bindRange("aux-gain", "auxGain");
  bindIntRange("aux-semitones", "auxSemitones");
  bindIntRange("aux-lpf", "auxLpf");
  bindIntRange("aux-hpf", "auxHpf");
  bindRange("aux-lpq", "auxLpq", (v) => v.toFixed(1));
  bindRange("aux-shape", "auxShape");
  bindIntRange("aux-bpf", "auxBpf");
  bindRange("aux-bpq", "auxBpq", (v) => v.toFixed(1));
  bindRange("aux-vib", "auxVib", (v) => v.toFixed(1));
  bindRange("aux-detune", "auxDetune");
  bindRange("aux-fm", "auxFm", (v) => v.toFixed(1));
  bindRange("aux-fmh", "auxFmh", (v) => v.toFixed(1));

  bindRange("master-room", "masterRoom");
  bindRange("master-delay", "masterDelay");

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
  refreshMidiTags();

  const bindingCount = Object.keys(state.midiBindings || {}).length;
  if (bindingCount > 0) {
    console.log(`MIDI bindings loaded from localStorage:`, state.midiBindings);
    setStatus(`Generated. ${bindingCount} MIDI binding${bindingCount === 1 ? "" : "s"} restored — click MIDI to connect.`);
  }
}

document.addEventListener("DOMContentLoaded", init);
