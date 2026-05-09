import { normalize } from "./mapping.js";

const EVENTS_PER_BYTE = 2;

export function mountCharViz(container, name, opts = {}) {
  const { dimBeyondNormalized = false } = opts;
  container.innerHTML = "";
  if (!name) return [];

  const enc = new TextEncoder();
  const normalized = normalize(name);
  const normLen = enc.encode(normalized).length;
  const useDim = dimBeyondNormalized && name.startsWith(normalized) && name !== normalized;

  const spans = [];
  let offset = 0;
  for (const ch of name) {
    const len = enc.encode(ch).length;
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = ch === " " ? "·" : ch;

    let startByte = offset;
    let endByte = offset + len;
    if (useDim && startByte >= normLen) {
      startByte = -1;
      endByte = -1;
      span.classList.add("dim");
    } else if (useDim && endByte > normLen) {
      endByte = normLen;
    }

    const start = startByte < 0 ? -1 : startByte * EVENTS_PER_BYTE;
    const end = endByte < 0 ? -1 : endByte * EVENTS_PER_BYTE;

    spans.push({ el: span, start, end });
    container.appendChild(span);
    offset += len;
  }
  return spans;
}

export function clearCharViz(spans) {
  for (const s of spans) s.el.classList.remove("active");
}

export function nextCycleDelayMs(repl) {
  const sch = repl?.scheduler;
  if (!sch || typeof sch.now !== "function") return 0;
  const cps = sch.cps;
  if (!(cps > 0)) return 0;
  const cycle = sch.now();
  const cyclesUntil = Math.ceil(cycle) - cycle;
  return Math.max(0, (cyclesUntil / cps) * 1000);
}

export function animateCharViz(spans, noteSeconds, totalEvents) {
  if (!spans.length || totalEvents <= 0) return () => {};
  let rafId = 0;
  const start = performance.now();
  const noteMs = noteSeconds * 1000;
  const step = (now) => {
    const idx = Math.floor((now - start) / noteMs);
    if (idx >= totalEvents) {
      clearCharViz(spans);
      rafId = 0;
      return;
    }
    for (const s of spans) {
      const active = s.start >= 0 && idx >= s.start && idx < s.end;
      s.el.classList.toggle("active", active);
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    clearCharViz(spans);
  };
}
