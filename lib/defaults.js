import { SCALE_POOL } from "./mapping.js";

export const defaults = {
  lockScale: false,
  lockedScale: SCALE_POOL[0],
  lockCpm: false,
  lockedCpm: 120,
  cpmBase: 90,
  cpmRange: 60,
  subSizes: [2],
  subStep: 3,
  leadEnabled: true,
  leadSynth: "sine",
  leadAdsr: [0.6, 0.1, 1.0, 0.6],
  leadGain: 1.0,
  padEnabled: true,
  padSynth: "supersaw",
  padAdsr: [0.1, 0.2, 3.0, 0.2],
  padGain: 0.05,
  droneEnabled: true,
  droneGain: 0.6,
};
