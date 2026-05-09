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

  const melody = bytesToMelody(bytes, options.subdivisionDensity, seed);

  return { scale, cpm, melody, bytes, seed, events: bytes.length || 1 };
}

function noteFromByte(byte) {
  return (byte % 13) - 6;
}

function bytesToMelody(bytes, density, seed) {
  if (bytes.length === 0) return "0";
  const threshold = Math.floor(density * 256);
  const events = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const note = noteFromByte(b);
    const triggerByte = b ^ ((seed >>> ((i & 3) * 8)) & 0xff);
    if (triggerByte >= 256 - threshold && bytes.length > 1) {
      const sibling = bytes[(i + 1) % bytes.length];
      const note2 = noteFromByte(sibling);
      events.push(`[${note} ${note2}]`);
    } else {
      events.push(String(note));
    }
  }
  return events.join(" ");
}
