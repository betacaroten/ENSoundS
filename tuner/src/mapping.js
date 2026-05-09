import { fnv1a, splitSeed } from "./hash.js";

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

export function deriveParams(name, options) {
  const bytes = new TextEncoder().encode(name);
  const seed = bytes.length === 0 ? 0 : fnv1a(bytes);
  const [s0, s1] = splitSeed(seed);

  const scale = options.lockScale ? options.lockedScale : SCALE_POOL[s0 & 7];

  const cpm = options.lockCpm
    ? options.lockedCpm
    : options.cpmBase + (s1 % options.cpmRange);

  const nibbles = bytesToNibbles(bytes);
  const melody = nibblesToMelody(nibbles, options.subdivisionDensity, seed);

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

function nibblesToMelody(nibbles, density, seed) {
  const events = [];
  if (nibbles.length === 0) {
    events.push("0");
  } else {
    const threshold = Math.floor(density * 16);
    for (let i = 0; i < nibbles.length; i++) {
      const n = nibbles[i];
      const note = noteFromNibble(n);
      const trigger = n ^ ((seed >>> ((i & 7) * 4)) & 0xf);
      if (trigger >= 16 - threshold && nibbles.length > 1) {
        const sibling = nibbles[(i + 1) % nibbles.length];
        const note2 = noteFromNibble(sibling);
        events.push(`[${note} ${note2}]`);
      } else {
        events.push(String(note));
      }
    }
  }
  for (let i = 0; i < TAIL_RESTS; i++) events.push("~");
  return events.join(" ");
}
