/** Seeded PRNG (mulberry32) so practice problems are reproducible from a seed. */
export interface Rng {
  seed: number;
  next(): number; // [0, 1)
  uniform(a: number, b: number): number;
  int(a: number, b: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
  /** Uniform on [a, b] snapped to a multiple of step, so given values look like homework numbers. */
  nice(a: number, b: number, step: number): number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed,
    next,
    uniform: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    nice: (a, b, step) => {
      const lo = Math.ceil(a / step);
      const hi = Math.floor(b / step);
      const k = lo + Math.floor(next() * (hi - lo + 1));
      // Round away float noise like 0.30000000000000004.
      return Number((k * step).toPrecision(12));
    },
  };
  return rng;
}

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);
