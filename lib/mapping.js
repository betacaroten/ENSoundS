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
  const [s0] = splitSeed(seed);

  const typedScale = (options.lockedScale || "").trim();
  const scale = options.lockScale && typedScale ? typedScale : SCALE_POOL[s0 & (SCALE_POOL.length - 1)];
  const cpm = options.lockedCpm | 0 || 120;

  const { melody, weights, melodyCycles } = bytesToMelody(bytes, {
    sizes: Array.isArray(options.subSizes) ? options.subSizes : [],
    step: options.subStep | 0,
    offset: options.noteOffset | 0,
    hiAdj: options.highNibbleOffset | 0,
    loAdj: options.lowNibbleOffset | 0,
    startFromZero: !!options.startFromZero,
    loop: !!options.loopEnabled,
  });

  return { scale, cpm, melody, bytes, seed, events: melodyCycles || 1, byteWeights: weights };
}

function noteFromNibble(n) {
  return n - 8;
}

const TAIL_RESTS = 12;

function durToken(note, dur) {
  if (dur === 1) return String(note);
  return `${note}@${dur}`;
}

function popcount(n) {
  let c = 0;
  for (let m = n & 0xf; m; m >>= 1) c += m & 1;
  return c;
}

function nibbleDuration(nibble) {
  const ones = popcount(nibble);
  if (ones === 0 || ones === 4) return 1;
  if (ones === 1) return 1;
  if (ones === 2) return 0.5;
  return 1;
}

function bytesToMelody(bytes, sub) {
  const events = [];
  const weights = [];
  const offset = sub.offset | 0;
  const hiAdj = sub.hiAdj | 0;
  const loAdj = sub.loAdj | 0;
  if (bytes.length === 0) {
    events.push(String(offset));
    weights.push(1);
  } else {
    const sizes = (sub.sizes || []).filter((n) => n >= 2 && n <= 8);
    const step = sub.step | 0;
    const useSub = step > 0 && sizes.length > 0;

    const nibbleVals = [];
    const nibbleNotes = [];
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      const hiV = (byte >> 4) & 0xf;
      const loV = byte & 0xf;
      nibbleVals.push(hiV, loV);
      nibbleNotes.push(noteFromNibble(hiV) + offset + hiAdj);
      nibbleNotes.push(noteFromNibble(loV) + offset + loAdj);
    }

    if (sub.startFromZero && nibbleNotes.length > 0) {
      const shift = nibbleNotes[0];
      for (let i = 0; i < nibbleNotes.length; i++) nibbleNotes[i] -= shift;
    }

    if (useSub) {
      let subIdx = 0;
      for (let i = 0; i < nibbleNotes.length; i++) {
        const shouldSub = i > 0 && i % step === 0 && nibbleNotes.length > 1;
        if (shouldSub) {
          const size = sizes[subIdx % sizes.length];
          subIdx++;
          const subTokens = [String(nibbleNotes[i])];
          for (let k = 1; k < size; k++) {
            subTokens.push(String(nibbleNotes[(i + k) % nibbleNotes.length]));
          }
          events.push(`[${subTokens.join(" ")}]`);
        } else {
          events.push(String(nibbleNotes[i]));
        }
      }
      for (let i = 0; i < bytes.length; i++) weights.push(2);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        const hiDur = nibbleDuration(nibbleVals[i * 2]);
        const loDur = nibbleDuration(nibbleVals[i * 2 + 1]);
        events.push(durToken(nibbleNotes[i * 2], hiDur));
        events.push(durToken(nibbleNotes[i * 2 + 1], loDur));
        weights.push(hiDur + loDur);
      }
    }
  }
  const melodyCycles = weights.reduce((a, b) => a + b, 0);
  if (!sub.loop) {
    for (let i = 0; i < TAIL_RESTS; i++) {
      events.push("~");
      weights.push(1);
    }
  }
  return { melody: events.join(" "), weights, melodyCycles };
}
