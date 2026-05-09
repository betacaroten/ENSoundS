import { fnv1a, splitSeed } from "./hash.js";
import { ens_normalize } from "@adraffy/ens-normalize";

export const SCALE_POOL = [
  "f#:minor",
  "c:major",
  "a:dorian",
  "d:phrygian",
  "g:mixolydian",
  "e:lydian",
  "bb:minor",
  "eb:major",
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

  const nibbles = bytesToNibbles(bytes);
  const melody = nibblesToMelody(nibbles, {
    sizes: Array.isArray(options.subSizes) ? options.subSizes : [],
    step: options.subStep | 0,
  });

  return { scale, cpm, melody, bytes, seed, events: nibbles.length || 1 };
}

function bytesToNibbles(bytes) {
  const out = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    out[i * 2] = (bytes[i] >> 4) & 0xf;
    out[i * 2 + 1] = bytes[i] & 0xf;
  }
  return out;
}

function noteFromNibble(n) {
  return n - 8;
}

const TAIL_RESTS = 4;

function nibblesToMelody(nibbles, sub) {
  const events = [];
  if (nibbles.length === 0) {
    events.push("0");
  } else {
    const sizes = (sub.sizes || []).filter((n) => n >= 2 && n <= 8);
    const step = sub.step | 0;
    let subIdx = 0;
    for (let i = 0; i < nibbles.length; i++) {
      const n = nibbles[i];
      const note = noteFromNibble(n);
      const shouldSub =
        step > 0 && sizes.length > 0 && i > 0 && i % step === 0 && nibbles.length > 1;
      if (shouldSub) {
        const size = sizes[subIdx % sizes.length];
        subIdx++;
        const subNotes = [String(note)];
        for (let k = 1; k < size; k++) {
          const sibling = nibbles[(i + k) % nibbles.length];
          subNotes.push(String(noteFromNibble(sibling)));
        }
        events.push(`[${subNotes.join(" ")}]`);
      } else {
        events.push(String(note));
      }
    }
  }
  for (let i = 0; i < TAIL_RESTS; i++) events.push("~");
  return events.join(" ");
}
