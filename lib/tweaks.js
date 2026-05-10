import { fnv1a } from "./hash.js";
import { normalize } from "./mapping.js";

// Each tweakable parameter has a [min, max] range. The per-name auto value
// picks anywhere in that range deterministically from the FNV hash. A user
// override stored at state.perNameTweaks[normalizedName][key] takes priority.
export const TWEAK_RANGES = {
  leadGain: { min: 0.66, max: 1, step: 0.01, label: "Lead gain" },
  leadAttack: { min: 0, max: 0.39, step: 0.01, label: "Lead attack" },
  leadRelease: { min: 0, max: 1, step: 0.01, label: "Lead release" },
  leadLpf: { min: 5450, max: 16150, step: 50, label: "Lead LPF (Hz)" },
  leadVib: { min: 0, max: 0.6, step: 0.01, label: "Lead vibrato" },
  masterRoom: { min: 0, max: 1, step: 0.01, label: "Master reverb" },
};

const TWEAK_KEYS = Object.keys(TWEAK_RANGES);

export function autoTweakOptions(name, options) {
  if (!name) return { ...options };
  const normalized = normalize(name);
  const bytes = new TextEncoder().encode(normalized);
  if (bytes.length === 0) return { ...options };

  const seedBytes = deriveSeedBytes(bytes, TWEAK_KEYS.length);
  const overrides = pickOverrides(options, normalized);

  const tweaked = { ...options };
  TWEAK_KEYS.forEach((key, i) => {
    const range = TWEAK_RANGES[key];
    const auto = lerp(seedBytes[i] / 255, range.min, range.max);
    const raw = overrides[key] !== undefined ? overrides[key] : auto;
    const clamped = clamp(raw, range.min, range.max);
    applyTweak(tweaked, key, snap(clamped, range.step));
  });

  // Pad gain mirrors lead gain across the same range, so they trade off:
  // leadGain at max → padGain at min, leadGain at min → padGain at max.
  const lg = TWEAK_RANGES.leadGain;
  if (lg && tweaked.leadGain !== undefined) {
    tweaked.padGain = snap(clamp(lg.min + lg.max - tweaked.leadGain, lg.min, lg.max), lg.step);
  }

  return tweaked;
}

function pickOverrides(options, normalized) {
  const map = options.perNameTweaks;
  if (!map || typeof map !== "object") return {};
  return map[normalized] || {};
}

function applyTweak(opts, key, value) {
  if (key === "leadAttack" || key === "leadRelease") {
    const adsr = [...(opts.leadAdsr || [0, 0, 0, 0])];
    adsr[key === "leadAttack" ? 0 : 3] = value;
    opts.leadAdsr = adsr;
    return;
  }
  if (key === "leadLpf") {
    opts.leadLpf = Math.round(value);
    return;
  }
  opts[key] = value;
}

function deriveSeedBytes(bytes, n) {
  const out = new Array(n);
  let h = fnv1a(bytes);
  let used = 0;
  for (let i = 0; i < n; i++) {
    if (used === 4) {
      h = fnv1a([h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff, (h >>> 24) & 0xff]);
      used = 0;
    }
    out[i] = (h >>> (used * 8)) & 0xff;
    used++;
  }
  return out;
}

function lerp(t, a, b) { return a + t * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function snap(v, step) {
  if (!step) return v;
  return Math.round(v / step) * step;
}
