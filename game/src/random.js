// A seeded random number generator (mulberry32): the same seed gives the same city,
// the same traffic and the same screenshot scenes, so a ?shot render is repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helpers built on a random stream: integers in a range, a pick from a list and a
// normally-ish distributed value around a centre.
export function randInt(random, low, high) {
  return low + Math.floor(random() * (high - low + 1));
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

export function randRange(random, low, high) {
  return low + random() * (high - low);
}

// Two independent uniforms averaged: a soft bell, cheap and good enough for jitter.
export function jitter(random, spread) {
  return (random() + random() - 1) * spread;
}
