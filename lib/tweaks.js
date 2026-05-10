import { fnv1a } from "./hash.js";

// Per-name auto-tweaks applied to lead+master parameters.
// Variations are deterministic from the FNV hash of the name and stay within
// narrow ranges so the family sound is preserved.
export function autoTweakOptions(name, options) {
  if (!name) return { ...options };
  const bytes = new TextEncoder().encode(name);
  if (bytes.length === 0) return { ...options };

  const seed = fnv1a(bytes);
  const b0 = seed & 0xff;
  const b1 = (seed >>> 8) & 0xff;
  const b2 = (seed >>> 16) & 0xff;
  const b3 = (seed >>> 24) & 0xff;
  const seed2 = fnv1a([b0, b1, b2, b3]);
  const b4 = seed2 & 0xff;
  const b5 = (seed2 >>> 8) & 0xff;

  const norm = (b) => b / 255;
  const lerp = (t, a, b) => a + t * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = (n) => Math.round(n * 100) / 100;

  const adsr = options.leadAdsr || [0, 0, 0, 0];
  const baseLpf = options.leadLpf || 20000;
  const baseRoom = options.masterRoom || 0;

  return {
    ...options,
    leadGain: round2(lerp(norm(b0), 0.66, 1)),
    leadAdsr: [
      round2(clamp(adsr[0] + lerp(norm(b1), -0.05, 0.05), 0, 0.39)),
      adsr[1],
      adsr[2],
      round2(clamp(adsr[3] + lerp(norm(b2), -0.15, 0.15), 0, 1)),
    ],
    leadLpf: Math.round(lerp(norm(b3), 5450, 16150)),
    leadVib: round2(lerp(norm(b4), 0, 0.6)),
    masterRoom: round2(clamp(baseRoom + lerp(norm(b5), -0.1, 0.1), 0, 1)),
  };
}
