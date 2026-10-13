import { describe, expect, it } from 'vitest';
import { cx } from '../complex';
import { padd, pderiv, pdiv, peval, pevalc, pformat, pfromRoots, pmul, ptrim, psub } from '../poly';
import { roots } from '../roots';
import { makeRng } from '../rng';
import { expectArrayClose, expectRootsClose } from './helpers';

describe('poly', () => {
  it('adds polynomials of different lengths aligned at the constant term', () => {
    expect(padd([1, 2, 3], [4, 5])).toEqual([1, 6, 8]);
    expect(psub([1, 2], [1, 2])).toEqual([0]);
  });
  it('multiplies by convolution', () => {
    expect(pmul([1, 1], [1, 2])).toEqual([1, 3, 2]);
    expect(pmul([1, 0, 1], [1, -1])).toEqual([1, -1, 1, -1]);
  });
  it('evaluates with Horner at real and complex points', () => {
    expect(peval([1, 3, 2], -1)).toBe(0);
    const z = pevalc([1, 2, 5], cx(-1, 2));
    expect(Math.abs(z.re) + Math.abs(z.im)).toBeLessThan(1e-12);
  });
  it('differentiates', () => {
    expect(pderiv([4, 3, 2, 1])).toEqual([12, 6, 2]);
    expect(pderiv([7])).toEqual([0]);
  });
  it('divides with remainder', () => {
    const { q, r } = pdiv([1, 0, 0, -1], [1, -1]);
    expectArrayClose(q, [1, 1, 1]);
    expectArrayClose(r, [0]);
    const d = pdiv([2, 3, 4], [1, 1]);
    expectArrayClose(d.q, [2, 1]);
    expectArrayClose(d.r, [3]);
  });
  it('trims leading zeros', () => {
    expect(ptrim([0, 0, 1, 2])).toEqual([1, 2]);
    expect(ptrim([0, 0])).toEqual([0]);
  });
  it('builds from roots including conjugate pairs', () => {
    expectArrayClose(pfromRoots([cx(-1, 2), cx(-1, -2)]), [1, 2, 5]);
    expectArrayClose(pfromRoots([cx(-1), cx(-2)], 3), [3, 9, 6]);
  });
  it('formats like a textbook', () => {
    expect(pformat([1, 3, 2])).toBe('s^2 + 3s + 2');
    expect(pformat([-1, 0, 4])).toBe('-s^2 + 4');
    expect(pformat([2, -1])).toBe('2s - 1');
  });
});

describe('roots', () => {
  it('handles linear and quadratic cases exactly', () => {
    expectRootsClose(roots([2, 4]), [cx(-2)]);
    expectRootsClose(roots([1, 3, 2]), [cx(-1), cx(-2)]);
    expectRootsClose(roots([1, 2, 5]), [cx(-1, 2), cx(-1, -2)]);
    expectRootsClose(roots([1, 0, 0]), [cx(0), cx(0)]);
  });
  it('returns exact conjugate pairs', () => {
    const r = roots([1, 2, 3, 4, 5]);
    const pos = r.filter((z) => z.im > 0);
    for (const z of pos) expect(r.some((w) => w.re === z.re && w.im === -z.im)).toBe(true);
  });
  it('finds roots of a cubic with a complex pair', () => {
    // (s + 3)(s^2 + 2s + 10)
    expectRootsClose(roots(pmul([1, 3], [1, 2, 10])), [cx(-3), cx(-1, 3), cx(-1, -3)]);
  });
  it('finds roots at the origin and RHP roots', () => {
    expectRootsClose(roots([1, -1, -2, 0]), [cx(0), cx(2), cx(-1)]);
  });
  it('handles a repeated root to the expected reduced accuracy', () => {
    // (s+1)^4: multiplicity 4 limits accuracy to about eps^(1/4)
    expectRootsClose(roots([1, 4, 6, 4, 1]), [cx(-1), cx(-1), cx(-1), cx(-1)], 1e-3);
  });
  it('recovers random root sets up to degree 10', () => {
    const rng = makeRng(42);
    for (let t = 0; t < 200; t++) {
      const n = rng.int(3, 10);
      const rs = [];
      while (rs.length < n) {
        if (n - rs.length >= 2 && rng.next() < 0.5) {
          const re = rng.uniform(-5, 2);
          const im = rng.uniform(0.2, 6);
          rs.push(cx(re, im), cx(re, -im));
        } else rs.push(cx(rng.uniform(-8, 3)));
      }
      const p = pfromRoots(rs, rng.uniform(0.5, 3));
      expectRootsClose(roots(p), rs, 1e-6);
    }
  });
});
