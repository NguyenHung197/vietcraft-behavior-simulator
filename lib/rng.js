// Seeded PRNG (mulberry32). `state` is a plain number so it can be saved in state.json.
function createRng(seed) {
  const r = { state: seed >>> 0 };
  const next = () => {
    r.state = (r.state + 0x6d2b79f5) >>> 0;
    let t = r.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  // pairs: [[value, weight], ...]
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = next() * total;
    for (const [v, w] of pairs) { x -= w; if (x < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const poisson = (lambda) => {
    const L = Math.exp(-lambda);
    let k = 0; let p = 1;
    do { k++; p *= next(); } while (p > L);
    return k - 1;
  };
  return { get state() { return r.state; }, next, int, pick, chance, weighted, shuffle, poisson };
}

module.exports = { createRng };
