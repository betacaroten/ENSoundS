import { deriveParams } from "./mapping.js";

export function renderStrudel(name, options) {
  const params = deriveParams(name, options);
  const lines = [`setcpm(${params.cpm})`];

  const layers = [];

  if (options.leadEnabled) {
    const adsr = formatAdsr(options.leadAdsr);
    let chain = `x.s("${options.leadSynth}").adsr("${adsr}")`;
    if (options.leadGain !== 1) chain += `.gain(${trim(options.leadGain)})`;
    chain += filterChain(options.leadLpf, options.leadHpf);
    layers.push(`x => ${chain}`);
  }

  if (options.padEnabled) {
    let chain = `x.s("${options.padSynth}").adsr("${formatAdsr(options.padAdsr)}").gain(${trim(options.padGain)})`;
    chain += filterChain(options.padLpf, options.padHpf);
    layers.push(`x => ${chain}`);
  }

  if (options.droneEnabled) {
    const semis = options.droneSemitones | 0;
    let chain = `x.s("sine")`;
    if (semis !== 0) chain += `.add(note(${semis}))`;
    chain += `.gain(${trim(options.droneGain)})`;
    chain += filterChain(options.droneLpf, options.droneHpf);
    layers.push(`x => ${chain}`);
  }

  if (options.auxEnabled) {
    const semis = options.auxSemitones | 0;
    let chain = `x.s("${options.auxSynth}").adsr("${formatAdsr(options.auxAdsr)}")`;
    if (semis !== 0) chain += `.add(note(${semis}))`;
    chain += `.gain(${trim(options.auxGain)})`;
    chain += filterChain(options.auxLpf, options.auxHpf);
    layers.push(`x => ${chain}`);
  }

  if (layers.length > 0) {
    const scaleSuffix = params.scale ? `.scale("${params.scale}")` : "";
    let line = `\t$: n("<${params.melody}>")${scaleSuffix}.layer(${layers.join(", ")})`;
    if (options.scope) {
      const scopeColor = options.scopeColor || "#7cd1ff";
      line += `.tscope({ id: 1, color: "${scopeColor}", thickness: 2, scale: 1.6, pos: .5 })`;
    }
    lines.push(line);
  }

  const cycleSeconds = 60 / params.cpm;
  return {
    code: lines.join("\n"),
    noteSeconds: cycleSeconds,
    events: params.events,
    byteWeights: params.byteWeights,
    durationSeconds: params.events * cycleSeconds,
  };
}

function filterChain(lpf, hpf) {
  let s = "";
  if (Number.isFinite(lpf) && lpf > 0 && lpf < 20000) s += `.lpf(${lpf | 0})`;
  if (Number.isFinite(hpf) && hpf > 0) s += `.hpf(${hpf | 0})`;
  return s;
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
