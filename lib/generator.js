import { deriveParams } from "./mapping.js";
import { autoTweakOptions } from "./tweaks.js";

export function renderStrudel(name, options) {
  const effective = autoTweakOptions(name, options);
  options = effective;
  const params = deriveParams(name, options);
  const lines = [`setcpm(${params.cpm})`];

  const layers = [];

  if (options.leadEnabled) {
    const adsr = formatAdsr(options.leadAdsr);
    let chain = `x.s("${options.leadSynth}").adsr("${adsr}")`;
    if (options.leadGain !== 1) chain += `.gain(${trim(options.leadGain)})`;
    chain += filterChain(options.leadLpf, options.leadHpf, options.leadLpq);
    chain += bandpassChain(options.leadBpf, options.leadBpq);
    chain += shapeChain(options.leadShape);
    chain += modChain(options.leadVib, options.leadDetune, options.leadFm, options.leadFmh);
    layers.push(`x => ${chain}`);
  }

  if (options.padEnabled) {
    let chain = `x.s("${options.padSynth}").adsr("${formatAdsr(options.padAdsr)}").gain(${trim(options.padGain)})`;
    chain += filterChain(options.padLpf, options.padHpf, options.padLpq);
    chain += bandpassChain(options.padBpf, options.padBpq);
    chain += shapeChain(options.padShape);
    chain += modChain(options.padVib, options.padDetune, options.padFm, options.padFmh);
    layers.push(`x => ${chain}`);
  }

  if (options.droneEnabled) {
    const semis = options.droneSemitones | 0;
    let chain = `x.s("sine")`;
    if (semis !== 0) chain += `.add(note(${semis}))`;
    chain += `.gain(${trim(options.droneGain)})`;
    chain += filterChain(options.droneLpf, options.droneHpf, options.droneLpq);
    chain += bandpassChain(options.droneBpf, options.droneBpq);
    chain += shapeChain(options.droneShape);
    chain += modChain(options.droneVib, options.droneDetune, options.droneFm, options.droneFmh);
    layers.push(`x => ${chain}`);
  }

  if (options.auxEnabled) {
    const semis = options.auxSemitones | 0;
    let chain = `x.s("${options.auxSynth}").adsr("${formatAdsr(options.auxAdsr)}")`;
    if (semis !== 0) chain += `.add(note(${semis}))`;
    chain += `.gain(${trim(options.auxGain)})`;
    chain += filterChain(options.auxLpf, options.auxHpf, options.auxLpq);
    chain += bandpassChain(options.auxBpf, options.auxBpq);
    chain += shapeChain(options.auxShape);
    chain += modChain(options.auxVib, options.auxDetune, options.auxFm, options.auxFmh);
    layers.push(`x => ${chain}`);
  }

  if (layers.length > 0) {
    const scaleSuffix = params.scale ? `.scale("${params.scale}")` : "";
    let line = `\t$: n("<${params.melody}>")${scaleSuffix}.layer(${layers.join(", ")})`;
    line += masterFx(options);
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
    effectiveOptions: effective,
  };
}

function filterChain(lpf, hpf, lpq) {
  let s = "";
  if (Number.isFinite(lpf) && lpf > 0 && lpf < 20000) s += `.lpf(${lpf | 0})`;
  if (Number.isFinite(hpf) && hpf > 0) s += `.hpf(${hpf | 0})`;
  if (Number.isFinite(lpq) && lpq > 0) s += `.lpq(${trim(lpq)})`;
  return s;
}

function shapeChain(shape) {
  return Number.isFinite(shape) && shape > 0 ? `.shape(${trim(shape)})` : "";
}

function bandpassChain(bpf, bpq) {
  let s = "";
  if (Number.isFinite(bpf) && bpf > 0 && bpf < 20000) s += `.bpf(${bpf | 0})`;
  if (Number.isFinite(bpq) && bpq > 0) s += `.bpq(${trim(bpq)})`;
  return s;
}

function modChain(vib, detune, fm, fmh) {
  let s = "";
  if (Number.isFinite(vib) && vib > 0) s += `.vib(${trim(vib)})`;
  if (Number.isFinite(detune) && detune !== 0) s += `.detune(${trim(detune)})`;
  if (Number.isFinite(fm) && fm > 0) s += `.fm(${trim(fm)})`;
  if (Number.isFinite(fmh) && fmh > 0) s += `.fmh(${trim(fmh)})`;
  return s;
}

function masterFx(options) {
  let s = "";
  if (options.masterRoom > 0) s += `.room(${trim(options.masterRoom)})`;
  if (options.masterDelay > 0) s += `.delay(${trim(options.masterDelay)})`;
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
