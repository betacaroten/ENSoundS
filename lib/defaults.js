import { SCALE_POOL } from "./mapping.js";

export const defaults = {
  lockScale: true,
  lockedScale: "a:dorian",
  lockCpm: true,
  lockedCpm: 300,
  cpmBase: 76,
  cpmRange: 60,
  subSizes: [2],
  subStep: 2,
  noteOffset: 0,
  leadEnabled: true,
  leadSynth: "sine",
  leadAdsr: [1.32, 1.04, 1.06, 0.96],
  leadGain: 0.65,
  padEnabled: true,
  padSynth: "triangle",
  padAdsr: [0.89, 0.39, 0.58, 0.2],
  padGain: 0.05,
  droneEnabled: false,
  droneGain: 0.6,
};
