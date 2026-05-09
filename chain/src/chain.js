import { renderStrudel } from "../../lib/generator.js";
import { defaults } from "../../lib/defaults.js";
import { mountCharViz, animateCharViz, clearCharViz, nextCycleDelayMs, fitCanvasToCSS } from "../../lib/charviz.js";
import {
  DEFAULT_RPC,
  makeClient,
  getLatestBlockNumber,
  getBlockWithTxs,
  uniqueFromAddresses,
  resolveEnsNames,
} from "./rpc.js";

const STORAGE_KEY = "ens-chain-state-v1";

const POLL_BASE_MS = 6_000;
const POLL_MAX_MS = 60_000;
const RECENT_LIMIT = 10;

const state = {
  rpcUrl: DEFAULT_RPC,
  queueDepth: 10,
  ...load(),
};

let client = makeClient(state.rpcUrl);
let running = false;
let lastBlockNumber = 0n;
let pollTimer = null;
let pollDelay = POLL_BASE_MS;
let strudelReady = false;
let strudelMod = null;
let strudelRepl = null;

let current = null;
let currentTimer = null;
let queue = [];

let charSpans = [];
let cancelVizFn = () => {};

const recent = [];

const BG_DRONE_LINE = `\t$: note("c2").s("sine").gain(.4).attack(2).release(4).tscope({ id: 1, color: "#7cd1ff", thickness: 2, scale: 1.6, pos: .5 })`;
const IDLE_DRONE = `setcpm(60)\n${BG_DRONE_LINE}`;

function $(id) { return document.getElementById(id); }

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
    rpcUrl: state.rpcUrl,
    queueDepth: state.queueDepth,
  })); } catch {}
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.classList.remove("error", "warn");
  if (kind) el.classList.add(kind);
}

function setLive(on) {
  $("live-dot").classList.toggle("on", on);
}

function setBlock(n) {
  $("block-number").textContent = n ? "#" + n.toLocaleString() : "—";
}

function shortAddr(a) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function clearViz() {
  cancelVizFn();
  cancelVizFn = () => {};
  clearCharViz(charSpans);
}

function renderCharViz(name) {
  charSpans = mountCharViz($("char-viz"), name, { dimBeyondNormalized: true });
}

function startViz(noteSeconds, totalEvents) {
  cancelVizFn();
  cancelVizFn = animateCharViz(charSpans, noteSeconds, totalEvents);
}

async function ensureStrudel() {
  if (strudelReady) return;
  setStatus("Loading audio engine…");
  strudelMod = await import("@strudel/web");
  strudelRepl = await strudelMod.initStrudel({ prebake: () => {} });
  strudelReady = true;
}

function evalStrudel(code) {
  const fn = strudelMod?.evaluate || window.evaluate;
  if (!fn) throw new Error("Strudel evaluate() not available");
  return fn(code);
}

function hush() {
  const fn = strudelMod?.hush || window.hush;
  if (fn) try { fn(); } catch {}
}

async function evaluateIdle() {
  try { await evalStrudel(IDLE_DRONE); } catch (e) { console.error(e); }
}

async function playName(entry) {
  current = entry;
  const r = renderStrudel(entry.name, { ...defaults, scope: true, droneEnabled: false });
  const codeWithBg = r.code + "\n" + BG_DRONE_LINE;
  $("now-playing").textContent = entry.name;
  $("now-playing-row").classList.add("on");
  renderCharViz(entry.name);
  let delayMs = 0;
  try {
    await evalStrudel(codeWithBg);
    delayMs = nextCycleDelayMs(strudelRepl);
    setTimeout(() => startViz(r.noteSeconds, r.events), delayMs);
  } catch (e) {
    console.error(e);
    setStatus("Audio error: " + (e.message || e), "error");
  }
  if (currentTimer) clearTimeout(currentTimer);
  const ms = Math.max(500, delayMs + r.durationSeconds * 1000);
  currentTimer = setTimeout(() => {
    currentTimer = null;
    current = null;
    clearViz();
    $("now-playing").textContent = "—";
    $("now-playing-row").classList.remove("on");
    if (queue.length) {
      const next = queue.shift();
      renderQueue();
      playName(next);
    } else {
      evaluateIdle();
    }
  }, ms);
}

function enqueueName(entry) {
  if (current?.name === entry.name) return;
  if (queue.some((q) => q.name === entry.name)) return;
  if (!current) {
    playName(entry);
  } else {
    queue.push(entry);
    while (queue.length > state.queueDepth) queue.shift();
    renderQueue();
  }
}

function renderQueue() {
  const el = $("queue");
  if (!queue.length) { el.textContent = ""; return; }
  el.textContent = "queued: " + queue.map((q) => q.name).join(" · ");
}

function pushRecent(entry) {
  recent.unshift({ ...entry, at: Date.now() });
  while (recent.length > RECENT_LIMIT) recent.pop();
  renderRecent();
}

function renderRecent() {
  const el = $("recent-list");
  el.innerHTML = "";
  for (const r of recent) {
    const row = document.createElement("li");
    const ago = Math.round((Date.now() - r.at) / 1000);
    const link = document.createElement("a");
    link.href = "../profile/#" + encodeURIComponent(r.name);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = r.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${ago}s ago · ${shortAddr(r.address)}`;
    row.appendChild(link);
    row.appendChild(meta);
    el.appendChild(row);
  }
}

setInterval(() => { if (recent.length) renderRecent(); }, 1000);

async function pollOnce() {
  try {
    const n = await getLatestBlockNumber(client);
    if (n === lastBlockNumber) return;
    lastBlockNumber = n;
    setBlock(n);
    setLive(true);

    const block = await getBlockWithTxs(client, n);
    const addrs = uniqueFromAddresses(block);
    if (!addrs.length) return;

    setStatus(`block ${n}: resolving ${addrs.length} addresses…`);
    const results = await resolveEnsNames(client, addrs);
    const named = results.filter((r) => r.name);
    setStatus(named.length
      ? `block ${n}: ${named.length}/${addrs.length} have ENS`
      : `block ${n}: no ENS in ${addrs.length} addresses`);

    for (const r of named) {
      enqueueName(r);
      pushRecent(r);
    }
    pollDelay = POLL_BASE_MS;
  } catch (e) {
    console.error(e);
    setLive(false);
    pollDelay = Math.min(pollDelay * 2, POLL_MAX_MS);
    setStatus(`RPC error: ${e.shortMessage || e.message || e}. retrying in ${pollDelay/1000}s`, "error");
  }
}

function schedulePoll() {
  if (!running) return;
  pollTimer = setTimeout(async () => {
    await pollOnce();
    schedulePoll();
  }, pollDelay);
}

async function start() {
  if (running) return;
  await ensureStrudel();
  running = true;
  pollDelay = POLL_BASE_MS;
  $("start").classList.add("hidden");
  $("stop").classList.remove("hidden");
  setStatus("Started.");
  await evaluateIdle();
  await pollOnce();
  schedulePoll();
}

function stop() {
  running = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  current = null;
  queue = [];
  renderQueue();
  hush();
  clearViz();
  $("now-playing").textContent = "—";
  $("now-playing-row").classList.remove("on");
  setLive(false);
  $("start").classList.remove("hidden");
  $("stop").classList.add("hidden");
  setStatus("Stopped. Polling and audio paused.");
}

function bindSettings() {
  const rpcInput = $("rpc-url");
  rpcInput.value = state.rpcUrl;
  rpcInput.addEventListener("change", () => {
    const v = rpcInput.value.trim() || DEFAULT_RPC;
    state.rpcUrl = v;
    save();
    client = makeClient(v);
    pollDelay = POLL_BASE_MS;
    lastBlockNumber = 0n;
    setStatus("RPC switched. Re-checking…");
    if (running) pollOnce();
  });

  const qd = $("queue-depth");
  const qdVal = $("queue-depth-val");
  qd.value = state.queueDepth;
  qdVal.textContent = state.queueDepth;
  qd.addEventListener("input", () => {
    state.queueDepth = +qd.value;
    qdVal.textContent = qd.value;
    save();
  });
}

function init() {
  fitCanvasToCSS($("test-canvas"));
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", stop);
  bindSettings();
  setStatus("Tap Start to begin streaming the chain.");
}

document.addEventListener("DOMContentLoaded", init);
