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

const TAIL_RESTS = 6;
const TAIL_REST_WEIGHT = 4;

function durToken(note, dur) {
  if (dur === 1) return String(note);
  return `${note}@${dur}`;
}

function popcount(n) {
  let c = 0;
  for (let m = n & 0xf; m; m >>= 1) c += m & 1;
  return c;
}

function totalBitParity(bytes) {
  let ones = 0;
  for (const b of bytes) {
    for (let m = b; m; m >>= 1) ones += m & 1;
  }
  return ones & 1;
}

function nibbleDuration(nibble) {
  const ones = popcount(nibble);
  if (ones === 0 || ones === 4) return 1;
  if (ones === 1) return 1;
  if (ones === 2) return 0.5;
  return 1.5;
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
      // Every 3rd nibble, repeat one of the prior three (1st or 2nd, picked by total
      // bit parity of the name). Then group every 4 events into a `[...]@<sum>` bar
      // so each inner note keeps its parity-based cycle duration; the last bar pads
      // with `~` rests (weight 1 each) as needed.
      const pickOffset = totalBitParity(bytes) === 0 ? 2 : 1;
      const allTokens = [];
      const allDurs = [];
      const tokenBytes = [];
      for (let i = 0; i < nibbleNotes.length; i++) {
        const dur = nibbleDuration(nibbleVals[i]);
        allTokens.push(durToken(nibbleNotes[i], dur));
        allDurs.push(dur);
        tokenBytes.push(i >> 1);
        if ((i + 1) % 3 === 0) {
          const pickIdx = i - pickOffset;
          if (pickIdx >= 0) {
            const pickDur = nibbleDuration(nibbleVals[pickIdx]);
            allTokens.push(durToken(nibbleNotes[pickIdx], pickDur));
            allDurs.push(pickDur);
            tokenBytes.push(i >> 1);
          }
        }
      }
      const BAR_SIZE = 4;
      const numBars = Math.ceil(allTokens.length / BAR_SIZE) || 1;
      const byteCycles = new Array(bytes.length).fill(0);
      for (let bar = 0; bar < numBars; bar++) {
        const slots = [];
        let barTotalDur = 0;
        let lastTokenIdx = -1;
        for (let j = 0; j < BAR_SIZE; j++) {
          const idx = bar * BAR_SIZE + j;
          if (idx < allTokens.length) {
            slots.push(allTokens[idx]);
            barTotalDur += allDurs[idx];
            byteCycles[tokenBytes[idx]] += allDurs[idx];
            lastTokenIdx = idx;
          } else {
            slots.push("~");
            barTotalDur += 1;
            if (lastTokenIdx >= 0) byteCycles[tokenBytes[lastTokenIdx]] += 1;
          }
        }
        const inner = slots.join(" ");
        if (barTotalDur === 1) {
          events.push(`[${inner}]`);
        } else {
          events.push(`[${inner}]@${barTotalDur}`);
        }
      }
      for (const w of byteCycles) weights.push(w);
    }
  }
  const melodyCycles = weights.reduce((a, b) => a + b, 0);
  if (!sub.loop) {
    for (let i = 0; i < TAIL_RESTS; i++) {
      events.push(TAIL_REST_WEIGHT === 1 ? "~" : `~@${TAIL_REST_WEIGHT}`);
      weights.push(TAIL_REST_WEIGHT);
    }
  }
  return { melody: events.join(" "), weights, melodyCycles };
}
