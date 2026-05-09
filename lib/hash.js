export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function splitSeed(seed) {
  return [
    seed & 0xff,
    (seed >>> 8) & 0xff,
    (seed >>> 16) & 0xff,
    (seed >>> 24) & 0xff,
  ];
}
