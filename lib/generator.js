import { deriveParams } from "./mapping.js";

export function renderStrudel(name, options) {
  const params = deriveParams(name, options);
  const lines = [`setcpm(${params.cpm})`];
  const melody = `n("<${params.melody}>")`;

  const scopeColor = options.scopeColor || "#7cd1ff";
  const scopeSuffix = options.scope
    ? `.tscope({ id: 1, color: "${scopeColor}", thickness: 2, scale: .35, pos: .5 })`
    : "";
  let scopeApplied = false;
  const applyScope = () => {
    if (scopeApplied || !options.scope) return "";
    scopeApplied = true;
    return scopeSuffix;
  };

  if (options.leadEnabled) {
    const adsr = formatAdsr(options.leadAdsr);
    let line = `\t$: ${melody}.scale("${params.scale}").s("${options.leadSynth}").adsr("${adsr}")`;
    if (options.leadGain !== 1) line += `.gain(${trim(options.leadGain)})`;
    line += applyScope();
    lines.push(line);
  }

  if (options.padEnabled) {
    const adsr = formatAdsr(options.padAdsr);
    lines.push(
      `\t$: ${melody}.scale("${params.scale}").s("${options.padSynth}").adsr("${adsr}").gain(${trim(options.padGain)})${applyScope()}`
    );
  }

  if (options.droneEnabled) {
    lines.push(
      `\t$: n("<-12>").scale("${params.scale}").s("sine").gain(${trim(options.droneGain)})${applyScope()}`
    );
  }

  const cycleSeconds = 60 / params.cpm;
  return {
    code: lines.join("\n"),
    noteSeconds: cycleSeconds,
    events: params.events,
    durationSeconds: params.events * cycleSeconds,
  };
}

function formatAdsr([a, d, s, r]) {
  return [a, d, s, r].map(trim).join(":");
}

function trim(n) {
  const s = String(n);
  if (s.startsWith("0.")) return s.slice(1);
  if (s.startsWith("-0.")) return "-" + s.slice(2);
  return s;
}
