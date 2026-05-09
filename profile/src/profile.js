import { renderStrudel } from "../../lib/generator.js";
import { normalize } from "../../lib/mapping.js";
import { defaults } from "../../lib/defaults.js";
import { mountCharViz, animateCharViz, clearCharViz, nextCycleDelayMs } from "../../lib/charviz.js";

let strudelReady = false;
let strudelMod = null;
let strudelRepl = null;
let charSpans = [];
let lastEvents = 0;
let lastNoteSeconds = 0.1;
let lastDuration = 0;
let stopTimer = null;
let cancelVizFn = () => {};
let currentName = "";

function $(id) { return document.getElementById(id); }

function readNameFromHash() {
  const raw = location.hash.slice(1);
  if (!raw) return "";
  try { return decodeURIComponent(raw).trim(); }
  catch { return raw.trim(); }
}

function setHashName(name) {
  const next = "#" + encodeURIComponent(name);
  if (location.hash !== next) location.hash = next;
}

function show(view) {
  $("landing").classList.toggle("hidden", view !== "landing");
  $("profile").classList.toggle("hidden", view !== "profile");
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.classList.remove("dirty", "error");
  if (kind) el.classList.add(kind);
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

function clearStopTimer() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
}

function bytesToHex(bytes) {
  const out = [];
  for (const b of bytes) out.push(b.toString(16).padStart(2, "0"));
  return out.join(" ");
}

function renderProfile(name) {
  currentName = name;
  const normalized = normalize(name);
  const bytes = new TextEncoder().encode(normalized);

  $("name-display").textContent = name;

  const noteEl = $("normalized-note");
  if (normalized && normalized !== name) {
    $("normalized").textContent = normalized;
    noteEl.classList.remove("hidden");
  } else {
    noteEl.classList.add("hidden");
  }

  const result = renderStrudel(name, defaults);
  $("code").textContent = result.code;
  $("meta-scale").textContent = inferScale(result.code);
  $("meta-cpm").textContent = inferCpm(result.code);
  $("meta-events").textContent = String(result.events);
  $("meta-duration").textContent = result.durationSeconds.toFixed(2) + "s";
  $("meta-bytes").textContent = bytesToHex(bytes) || "(empty)";

  lastEvents = result.events;
  lastNoteSeconds = result.noteSeconds;
  lastDuration = result.durationSeconds;

  charSpans = mountCharViz($("char-viz"), name, { dimBeyondNormalized: true });
  $("tune-link").href = "../tuner/?name=" + encodeURIComponent(name);
  setStatus("Tap Play to hear it.");
}

function inferScale(code) {
  const m = code.match(/\.scale\("([^"]+)"\)/);
  return m ? m[1] : "?";
}
function inferCpm(code) {
  const m = code.match(/setcpm\((\d+)\)/);
  return m ? m[1] : "?";
}

async function ensureStrudel() {
  if (strudelReady) return;
  setStatus("Loading Strudel…");
  strudelMod = await import("@strudel/web");
  strudelRepl = await strudelMod.initStrudel({ prebake: () => {} });
  strudelReady = true;
}

async function onPlay() {
  if (!currentName) return;
  try {
    await ensureStrudel();
    clearStopTimer();
    const evalFn = strudelMod.evaluate || window.evaluate;
    if (!evalFn) throw new Error("Strudel evaluate() not available");
    const { code } = renderStrudel(currentName, defaults);
    await evalFn(code);
    const delayMs = nextCycleDelayMs(strudelRepl);
    setTimeout(startViz, delayMs);
    if (lastDuration > 0) {
      setStatus(`Playing… auto-stop in ${lastDuration.toFixed(1)}s`);
      stopTimer = setTimeout(() => {
        const hush = strudelMod?.hush || window.hush;
        if (hush) hush();
        cancelViz();
        setStatus("Done.");
        stopTimer = null;
      }, Math.max(0, delayMs + lastDuration * 1000 - 100));
    } else {
      setStatus("Playing.");
    }
  } catch (e) {
    console.error(e);
    setStatus("Play failed: " + (e.message || e), "error");
  }
}

function onStop() {
  clearStopTimer();
  cancelViz();
  try {
    const hush = strudelMod?.hush || window.hush;
    if (hush) hush();
    setStatus("Stopped.");
  } catch (e) {
    console.error(e);
  }
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(location.href);
    setStatus("Link copied.");
  } catch {
    setStatus("Couldn't copy — select the URL manually.", "error");
  }
}

function onLanding(e) {
  e.preventDefault();
  const name = $("landing-name").value.trim();
  if (!name) return;
  setHashName(name);
}

function onBack(e) {
  e.preventDefault();
  cancelViz();
  clearStopTimer();
  const hush = strudelMod?.hush || window.hush;
  if (hush) try { hush(); } catch {}
  history.pushState("", document.title, location.pathname + location.search);
  route();
}

function onExamples(e) {
  const t = e.target;
  if (t.classList.contains("pill")) {
    setHashName(t.dataset.name);
  }
}

function route() {
  const name = readNameFromHash();
  if (!name) {
    show("landing");
    cancelViz();
    clearStopTimer();
    return;
  }
  show("profile");
  renderProfile(name);
}

function init() {
  $("play").addEventListener("click", onPlay);
  $("stop").addEventListener("click", onStop);
  $("copy").addEventListener("click", onCopy);
  $("back").addEventListener("click", onBack);
  $("landing-form").addEventListener("submit", onLanding);
  $("examples").addEventListener("click", onExamples);
  window.addEventListener("hashchange", () => {
    cancelViz();
    clearStopTimer();
    const hush = strudelMod?.hush || window.hush;
    if (hush) try { hush(); } catch {}
    route();
  });
  route();
}

document.addEventListener("DOMContentLoaded", init);
