import { renderStrudel } from "../../lib/generator.js";
import { normalize } from "../../lib/mapping.js";
import { loadOptions, saveOptions } from "../../lib/state.js";
import { defaults as fileDefaults } from "../../lib/defaults.js";
import { TWEAK_RANGES, autoTweakOptions } from "../../lib/tweaks.js";

let options = loadOptions();
let isPlaying = false;
window.addEventListener("storage", (e) => {
  if (e.key !== "ens-tuner-state-v1") return;
  options = loadOptions();
  if (currentName) renderProfile(currentName);
  if (isPlaying && strudelMod && currentName) {
    const { code } = renderStrudel(currentName, { ...options, scope: true });
    const fn = strudelMod.evaluate || window.evaluate;
    if (fn) Promise.resolve(fn(code)).catch((err) => console.error(err));
  }
});
import { mountCharViz, animateCharViz, clearCharViz, nextCycleDelayMs, fitCanvasToCSS } from "../../lib/charviz.js";
import { createPublicClient, http, fallback } from "viem";
import { mainnet } from "viem/chains";

const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.llamarpc.com",
];
const ensClient = createPublicClient({
  chain: mainnet,
  transport: fallback(PUBLIC_RPCS.map((u) => http(u, { retryCount: 0 })), { retryCount: 1 }),
});
const ensCheckCache = new Map();
let ensCheckSeq = 0;

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

function renderTweakOverrides(name) {
  const container = $("tweak-overrides");
  if (!container) return;
  const normalized = normalize(name);
  if (!normalized) {
    container.innerHTML = "";
    return;
  }
  const overrides = (options.perNameTweaks && options.perNameTweaks[normalized]) || {};
  // Compute the auto value for each tweakable param at the *base* options (no override)
  const baseOptions = { ...options, perNameTweaks: {} };
  const autoEffective = autoTweakOptions(name, baseOptions);

  container.innerHTML = "";
  const hiddenInUi = new Set(["leadGain"]);
  for (const [key, range] of Object.entries(TWEAK_RANGES)) {
    if (hiddenInUi.has(key)) continue;
    const autoVal = readEffective(autoEffective, key);
    const overrideVal = overrides[key];
    const isOverridden = overrideVal !== undefined;
    const current = isOverridden ? overrideVal : autoVal;

    const row = document.createElement("div");
    row.className = "tweak-override-row";
    row.innerHTML = `
      <label>${range.label}</label>
      <input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${current}" />
      <span class="val"></span>
      <button class="reset" title="Use auto">×</button>
    `;
    const slider = row.querySelector("input");
    const valEl = row.querySelector(".val");
    const resetBtn = row.querySelector(".reset");
    const formatVal = (v) =>
      Number.isInteger(range.step) ? String(Math.round(v)) : (+v).toFixed(2);
    valEl.textContent = formatVal(current);
    if (isOverridden) row.classList.add("overridden");

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      valEl.textContent = formatVal(v);
      setTweakOverride(normalized, key, v);
      row.classList.add("overridden");
    });
    resetBtn.addEventListener("click", () => {
      clearTweakOverride(normalized, key);
      slider.value = autoVal;
      valEl.textContent = formatVal(autoVal);
      row.classList.remove("overridden");
    });
    container.appendChild(row);
  }
}

function readEffective(opts, key) {
  if (key === "leadAttack") return opts.leadAdsr?.[0] ?? 0;
  if (key === "leadRelease") return opts.leadAdsr?.[3] ?? 0;
  return opts[key];
}

function setTweakOverride(name, key, value) {
  if (!options.perNameTweaks || typeof options.perNameTweaks !== "object") {
    options.perNameTweaks = {};
  }
  if (!options.perNameTweaks[name]) options.perNameTweaks[name] = {};
  options.perNameTweaks[name][key] = value;
  saveOptions(options);
  if (currentName) {
    const r = renderStrudel(currentName, { ...options, scope: true });
    $("code").textContent = r.code;
    if (isPlaying && strudelMod) {
      const fn = strudelMod.evaluate || window.evaluate;
      if (fn) Promise.resolve(fn(r.code)).catch((err) => console.error(err));
    }
  }
}

function clearTweakOverride(name, key) {
  if (!options.perNameTweaks || !options.perNameTweaks[name]) return;
  delete options.perNameTweaks[name][key];
  if (Object.keys(options.perNameTweaks[name]).length === 0) {
    delete options.perNameTweaks[name];
  }
  saveOptions(options);
  if (currentName) {
    const r = renderStrudel(currentName, { ...options, scope: true });
    $("code").textContent = r.code;
    if (isPlaying && strudelMod) {
      const fn = strudelMod.evaluate || window.evaluate;
      if (fn) Promise.resolve(fn(r.code)).catch((err) => console.error(err));
    }
  }
}

function renderTweaks(container, opts) {
  if (!container) return;
  container.innerHTML = "";
  const skip = new Set(["midiBindings"]);
  const diffs = [];
  for (const k of Object.keys(fileDefaults)) {
    if (skip.has(k)) continue;
    const cur = opts[k];
    const def = fileDefaults[k];
    if (JSON.stringify(cur) === JSON.stringify(def)) continue;
    diffs.push({ key: k, current: cur, def });
  }
  if (diffs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No tweaks — using file defaults.";
    container.appendChild(empty);
    return;
  }
  for (const d of diffs) {
    const li = document.createElement("li");
    li.innerHTML = `<code>${d.key}</code>: ${formatDiff(d.current, d.def)}`;
    container.appendChild(li);
  }
}

function formatDiff(cur, def) {
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

  const result = renderStrudel(name, options);
  $("code").textContent = result.code;
  $("meta-scale").textContent = inferScale(result.code);
  $("meta-cpm").textContent = inferCpm(result.code);
  $("meta-events").textContent = String(result.events);
  $("meta-duration").textContent = result.durationSeconds.toFixed(2) + "s";
  $("meta-bytes").textContent = bytesToHex(bytes) || "(empty)";
  renderTweaks($("meta-tweaks"), result.effectiveOptions || options);
  renderTweakOverrides(name);

  lastEvents = result.events;
  lastNoteSeconds = result.noteSeconds;
  lastDuration = result.durationSeconds;

  charSpans = mountCharViz($("char-viz"), name, { dimBeyondNormalized: true, byteWeights: result.byteWeights });
  $("tune-link").href = "../tuner/?name=" + encodeURIComponent(name);
  setStatus("Tap Play to hear it.");
  fitCanvasToCSS($("test-canvas"));
  checkEnsRegistration(name);
}

function ensNameFor(input) {
  const n = normalize(input);
  return n ? `${n}.eth` : "";
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

async function checkEnsRegistration(input) {
  const banner = $("register-banner");
  const link = $("register-link");
  const text = $("register-text");
  banner.classList.add("hidden");
  banner.classList.remove("registered", "unregistered");

  const ensName = ensNameFor(input);
  if (!ensName) return;

  const seq = ++ensCheckSeq;
  text.textContent = `Checking ${ensName}…`;

  let address;
  if (ensCheckCache.has(ensName)) {
    address = ensCheckCache.get(ensName);
  } else {
    try {
      address = await ensClient.getEnsAddress({ name: ensName });
      ensCheckCache.set(ensName, address);
    } catch (e) {
      console.warn("ENS check failed:", e);
      return;
    }
  }
  if (seq !== ensCheckSeq) return;

  if (address) {
    text.innerHTML = `Owned by <code>${shortAddr(address)}</code>`;
    link.textContent = `View on Etherscan →`;
    link.href = `https://etherscan.io/address/${address}`;
    banner.classList.add("registered");
    banner.classList.remove("hidden");
  } else {
    text.textContent = `${ensName} isn't registered yet.`;
    link.textContent = `Register on ENS →`;
    link.href = `https://app.ens.domains/${encodeURIComponent(ensName)}`;
    banner.classList.add("unregistered");
    banner.classList.remove("hidden");
  }
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
    const { code } = renderStrudel(currentName, { ...options, scope: true });
    await evalFn(code);
    isPlaying = true;
    const delayMs = nextCycleDelayMs(strudelRepl);
    setTimeout(startViz, delayMs);
    if (lastDuration > 0) {
      setStatus(`Playing… auto-stop in ${lastDuration.toFixed(1)}s`);
      stopTimer = setTimeout(() => {
        const hush = strudelMod?.hush || window.hush;
        if (hush) hush();
        cancelViz();
        isPlaying = false;
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
  isPlaying = false;
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
  isPlaying = false;
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
