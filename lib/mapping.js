import { fnv1a, splitSeed } from "./hash.js";
import { ens_normalize } from "@adraffy/ens-normalize";

export const SCALE_POOL = [
  "a:minor",
  "c:major",
  "a:major",
  "d:major",
  "g:minor",
  "e:minor",
  "e:major",
  "d:minor",
];

export const SYNTHS = ["sine", "sawtooth", "square", "triangle", "supersaw"];

export function normalize(name) {
  if (!name) return "";
  let n;
  try {
    n = ens_normalize(name);
  } catch {
    n = name;
  }
  return n.replace(/\.eth$/, "");
}

export function deriveParams(name, options) {
  const normalized = normalize(name);
  const bytes = new TextEncoder().encode(normalized);
  const seed = bytes.length === 0 ? 0 : fnv1a(bytes);
  const [s0, s1] = splitSeed(seed);

  const scale = options.lockScale ? options.lockedScale : SCALE_POOL[s0 & 7];

  const cpm = options.lockCpm
    ? options.lockedCpm
    : options.cpmBase + (s1 % options.cpmRange);

  const melody = bytesToMelody(bytes, {
    sizes: Array.isArray(options.subSizes) ? options.subSizes : [],
    step: options.subStep | 0,
    offset: options.noteOffset | 0,
    hiAdj: options.highNibbleOffset | 0,
    loAdj: options.lowNibbleOffset | 0,
    asSum: !!options.byteAsSum,
    asRhythm: !!options.byteAsRhythm,
    loop: !!options.loopEnabled,
  });

  return { scale, cpm, melody, bytes, seed, events: bytes.length || 1 };
}

function noteFromNibble(n) {
  return n - 8;
}

function byteChord(byte, offset, hiAdj, loAdj, asSum) {
  const hi = noteFromNibble((byte >> 4) & 0xf) + hiAdj;
  const lo = noteFromNibble(byte & 0xf) + loAdj;
  if (asSum) return String(hi + lo + offset);
  return `[${hi + offset},${lo + offset}]`;
}

const TAIL_RESTS = 4;

const RHYTHM_SLOTS = 8;
const DURATION_SLOTS = [1, 2, 4, 8]; // 1/8, 1/4, 1/2, 1 of a beat

function rhythmCell(bytes, i, offset, hiAdj) {
  const byte = bytes[i];
  const note = String(noteFromNibble((byte >> 4) & 0xf) + offset + hiAdj);
  const onSlots = DURATION_SLOTS[(byte & 0xf) >> 2];
  if (onSlots >= RHYTHM_SLOTS) return note;
  const slots = [note];
  for (let k = 1; k < onSlots; k++) slots.push("_");
  for (let k = onSlots; k < RHYTHM_SLOTS; k++) slots.push("~");
  return `[${slots.join(" ")}]`;
}

function bytesToMelody(bytes, sub) {
  const events = [];
  const offset = sub.offset | 0;
  const hiAdj = sub.hiAdj | 0;
  const loAdj = sub.loAdj | 0;
  const asSum = !!sub.asSum;
  const asRhythm = !!sub.asRhythm;
  if (bytes.length === 0) {
    events.push(String(offset));
  } else if (asRhythm) {
    for (let i = 0; i < bytes.length; i++) {
      events.push(rhythmCell(bytes, i, offset, hiAdj));
    }
  } else {
    const sizes = (sub.sizes || []).filter((n) => n >= 2 && n <= 8);
    const step = sub.step | 0;
    let subIdx = 0;
    for (let i = 0; i < bytes.length; i++) {
      const chord = byteChord(bytes[i], offset, hiAdj, loAdj, asSum);
      const shouldSub =
        step > 0 && sizes.length > 0 && i > 0 && i % step === 0 && bytes.length > 1;
      if (shouldSub) {
        const size = sizes[subIdx % sizes.length];
        subIdx++;
        const subTokens = [chord];
        for (let k = 1; k < size; k++) {
          const sibling = bytes[(i + k) % bytes.length];
          subTokens.push(byteChord(sibling, offset, hiAdj, loAdj, asSum));
        }
        events.push(`[${subTokens.join(" ")}]`);
      } else {
        events.push(chord);
      }
    }
  }
  if (!sub.loop) {
    for (let i = 0; i < TAIL_RESTS; i++) events.push("~");
  }
  return events.join(" ");
}
