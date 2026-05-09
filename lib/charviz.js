import { normalize } from "./mapping.js";

export function mountCharViz(container, name, opts = {}) {
  const { dimBeyondNormalized = false, byteWeights = null } = opts;
  container.innerHTML = "";
  if (!name) return [];

  const enc = new TextEncoder();
  const normalized = normalize(name);
  const normLen = enc.encode(normalized).length;
  const useDim = dimBeyondNormalized && name.startsWith(normalized) && name !== normalized;

  const cumulative = (byte) => {
    if (!byteWeights) return byte;
    let s = 0;
    for (let i = 0; i < byte && i < byteWeights.length; i++) s += byteWeights[i] || 1;
    return s;
  };

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
      offset += len;
      continue;
    } else if (useDim && endByte > normLen) {
      endByte = normLen;
    }

    spans.push({ el: span, start: cumulative(startByte), end: cumulative(endByte) });
    container.appendChild(span);
    offset += len;
  }
  return spans;
}

export function clearCharViz(spans) {
  for (const s of spans) s.el.classList.remove("active");
}

export function fitCanvasToCSS(canvas) {
  if (!canvas) return;
  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  fit();
  let t;
  window.addEventListener("resize", () => {
    if (t) clearTimeout(t);
    t = setTimeout(fit, 100);
  });
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

export function animateCharViz(spans, noteSeconds, totalEvents, loop = false) {
  if (!spans.length || totalEvents <= 0) return () => {};
  let rafId = 0;
  const start = performance.now();
  const noteMs = noteSeconds * 1000;
  const step = (now) => {
    const raw = Math.floor((now - start) / noteMs);
    if (!loop && raw >= totalEvents) {
      clearCharViz(spans);
      rafId = 0;
      return;
    }
    const idx = loop ? ((raw % totalEvents) + totalEvents) % totalEvents : raw;
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
