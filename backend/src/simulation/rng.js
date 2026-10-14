export class SeededRng {
  constructor(seed = 1) {
    this.state = (Number(seed) >>> 0) || 1;
  }

  next() {
    // Mulberry32: compact deterministic PRNG suitable for simulation/testing (not cryptography).
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability) {
    return this.next() < probability;
  }

  normal(mean = 0, sd = 1) {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * sd;
  }

  weightedChoice(entries) {
    const pairs = Array.isArray(entries)
      ? entries
      : Object.entries(entries).map(([value, weight]) => ({ value, weight }));

    const normalized = pairs.map(item => Array.isArray(item)
      ? { value: item[0], weight: Number(item[1]) }
      : { value: item.value, weight: Number(item.weight) });

    const total = normalized.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (total <= 0) return normalized[0]?.value;

    let target = this.next() * total;
    for (const item of normalized) {
      target -= Math.max(0, item.weight);
      if (target <= 0) return item.value;
    }
    return normalized.at(-1)?.value;
  }
}
