/** Seeded 3D value noise and fBm, used for procedural textures (MLI crinkle, Earth). */
import { makeRng } from '../core/rng';

export function makeNoise3(seed: number) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rng.next() * 2 - 1;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (x: number, y: number, z: number) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];

  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  const fbm = (x: number, y: number, z: number, octaves = 5, lacunarity = 2, gain = 0.5) => {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * noise(x * f, y * f, z * f);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return s / norm;
  };
  return { noise, fbm };
}
