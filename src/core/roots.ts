/**
 * Polynomial root finding with the Aberth-Ehrlich method plus a Newton polish.
 * Aberth converges cubically for simple roots and finds all roots at once, which
 * is plenty for the low order (<= 12) polynomials this lab deals with.
 */
import { type Complex, cabs, cadd, cdiv, cmul, csqrt, csub, cx } from './complex';
import { type Poly, pderiv, pevalc, ptrim } from './poly';

function quadratic(b: number, c: number): Complex[] {
  // Roots of s^2 + b s + c, using the cancellation-free form.
  const disc = b * b - 4 * c;
  if (disc >= 0) {
    const sq = Math.sqrt(disc);
    const q = -0.5 * (b + (b >= 0 ? sq : -sq));
    if (q === 0) return [cx(0), cx(0)];
    return [cx(q), cx(c / q)];
  }
  const re = -b / 2;
  const im = Math.sqrt(-disc) / 2;
  return [cx(re, -im), cx(re, im)];
}

/** Sort roots by real part, then imaginary part, so outputs are stable. */
export function sortRoots(rs: Complex[]): Complex[] {
  return rs.slice().sort((a, b) => a.re - b.re || a.im - b.im);
}

export function roots(p: Poly): Complex[] {
  let a = ptrim(p);
  if (a.length <= 1) return [];
  const out: Complex[] = [];
  // Roots at the origin.
  while (a.length > 1 && a[a.length - 1] === 0) {
    out.push(cx(0));
    a = a.slice(0, -1);
  }
  const lead = a[0];
  a = a.map((c) => c / lead);
  const n = a.length - 1;
  if (n === 1) out.push(cx(-a[1]));
  else if (n === 2) out.push(...quadratic(a[1], a[2]));
  else if (n > 2) out.push(...aberth(a));
  return sortRoots(cleanConjugates(out));
}

function aberth(a: Poly): Complex[] {
  const n = a.length - 1;
  const da = pderiv(a);
  // Initial guesses on a circle sized by the geometric mean of root magnitudes,
  // rotated off the real axis so symmetric starts do not stall.
  const R = Math.max(Math.abs(a[n]) ** (1 / n), 1e-3);
  const z: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n + 0.4;
    z.push(cx(R * Math.cos(th), R * Math.sin(th)));
  }
  for (let iter = 0; iter < 800; iter++) {
    let maxRel = 0;
    for (let k = 0; k < n; k++) {
      const pz = pevalc(a, z[k]);
      if (cabs(pz) === 0) continue;
      const ratio = cdiv(pz, pevalc(da, z[k]));
      let sum = cx(0);
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const d = csub(z[k], z[j]);
        if (cabs(d) === 0) continue;
        sum = cadd(sum, cdiv(cx(1), d));
      }
      const w = cdiv(ratio, csub(cx(1), cmul(ratio, sum)));
      if (!Number.isFinite(w.re) || !Number.isFinite(w.im)) continue;
      z[k] = csub(z[k], w);
      maxRel = Math.max(maxRel, cabs(w) / Math.max(cabs(z[k]), 1e-300));
    }
    if (maxRel < 1e-15) break;
  }
  // Newton polish against the monic polynomial; keep a step only if it helps.
  return z.map((zk) => {
    let best = zk;
    let bestRes = cabs(pevalc(a, zk));
    for (let i = 0; i < 3; i++) {
      const d = pevalc(da, best);
      if (cabs(d) === 0) break;
      const cand = csub(best, cdiv(pevalc(a, best), d));
      const res = cabs(pevalc(a, cand));
      if (!(res < bestRes)) break;
      best = cand;
      bestRes = res;
    }
    return best;
  });
}

/**
 * For real polynomials, complex roots come in conjugate pairs. Snap tiny imaginary
 * parts to zero and make each pair exactly conjugate.
 */
function cleanConjugates(rs: Complex[]): Complex[] {
  const out = rs.map((r) => (Math.abs(r.im) <= 1e-9 * Math.max(1, cabs(r)) ? cx(r.re) : r));
  const used = new Array(out.length).fill(false);
  for (let i = 0; i < out.length; i++) {
    if (used[i] || out[i].im <= 0) continue;
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < out.length; j++) {
      if (j === i || used[j] || out[j].im >= 0) continue;
      const d = Math.hypot(out[i].re - out[j].re, out[i].im + out[j].im);
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      const re = (out[i].re + out[bestJ].re) / 2;
      const im = (out[i].im - out[bestJ].im) / 2;
      out[i] = cx(re, im);
      out[bestJ] = cx(re, -im);
      used[i] = used[bestJ] = true;
    }
  }
  return out;
}

/** csqrt re-exported for callers that want closed-form 2nd order roots. */
export { csqrt };
