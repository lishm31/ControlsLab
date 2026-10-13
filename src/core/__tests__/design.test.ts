import { describe, expect, it } from 'vitest';
import residueG from '../../../verify/golden/residue.json';
import padeG from '../../../verify/golden/pade.json';
import ackerG from '../../../verify/golden/acker.json';
import lqrG from '../../../verify/golden/lqr.json';
import { cabs, csub, cx } from '../complex';
import { acker, errorConstants, lqr, pade } from '../design';
import { eigvals } from '../eig';
import { matMul, matSub } from '../linalg';
import { ParseError, parsePoly } from '../parse';
import { ilaplace, partialFractions } from '../pfrac';
import { pmul } from '../poly';
import { impulse, linspace } from '../response';
import { tf } from '../tf';
import { expectArrayClose, expectClose, expectRootsClose } from './helpers';

describe('parsePoly', () => {
  it.each([
    ['s^2 + 2s + 5', [1, 2, 5]],
    ['(s+1)(s+2)', [1, 3, 2]],
    ['10(s + 0.5)', [10, 5]],
    ['s(s+3)^2', [1, 6, 9, 0]],
    ['-2s^3 + s', [-2, 0, 1, 0]],
    ['4', [4]],
    ['2*s*s - 1', [2, 0, -1]],
    ['(s+1)^0', [1]],
    ['1e2 s', [100, 0]],
    ['s^2 − 1', [1, 0, -1]],
  ])('%s', (src, want) => expect(parsePoly(src)).toEqual(want));
  it.each(['', 's^', '(s+1', 's^1.5', 's + + ', 'x+1', 's)'])('rejects %j', (src) => expect(() => parsePoly(src)).toThrow(ParseError));
});

describe('partial fractions', () => {
  it('distinct real poles: 1/((s+1)(s+2)) = 1/(s+1) - 1/(s+2)', () => {
    const { terms, direct } = partialFractions([1], [1, 3, 2]);
    expect(direct).toEqual([0]);
    expect(terms.map((t) => [t.pole.re, t.power, Number(t.coeff.re.toFixed(12))])).toEqual([
      [-2, 1, -1],
      [-1, 1, 1],
    ]);
  });
  it('repeated pole: 1/(s+1)^2 (s+2)', () => {
    const { terms } = partialFractions([1], pmul([1, 2, 1], [1, 2]));
    const get = (p: number, k: number) => terms.find((t) => Math.abs(t.pole.re - p) < 1e-6 && t.power === k)!.coeff.re;
    expectClose(get(-1, 2), 1, 1e-9);
    expectClose(get(-1, 1), -1, 1e-9);
    expectClose(get(-2, 1), 1, 1e-9);
  });
  it('inverse Laplace equals the impulse response for random stable TFs', () => {
    const cases = [
      [[1], [1, 2, 5]],
      [[2, 1], pmul([1, 1], [1, 4, 13])],
      [[1, 0], pmul([1, 2, 1], [1, 3])],
      [[3], pmul([1, 0, 4], [1, 1])],
    ] as [number[], number[]][];
    for (const [n, d] of cases) {
      const t = linspace(0, 6, 121);
      const { f } = ilaplace(n, d);
      const imp = impulse(tf(n, d), t).y;
      expectArrayClose(t.map(f), imp, 1e-7, 1e-9);
    }
  });
});

describe('golden: residue (scipy.signal.residue)', () => {
  it.each(residueG.cases.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    const pf = partialFractions(c.num, c.den);
    expect(pf.terms.length).toBe(c.terms.length);
    for (const want of c.terms) {
      const wp = cx(want.pole[0], want.pole[1]);
      const got = pf.terms.find((t) => t.power === want.power && cabs(csub(t.pole, wp)) <= 1e-3 * Math.max(1, cabs(wp)));
      expect(got, `pole ${want.pole} power ${want.power}`).toBeDefined();
      // repeated poles are only known to ~1e-5, residues of high powers inherit that
      const scale = Math.max(1, Math.hypot(want.coeff[0], want.coeff[1]));
      expect(cabs(csub(got!.coeff, cx(want.coeff[0], want.coeff[1]))) / scale).toBeLessThan(1e-4);
    }
    const dirWant = c.direct.length ? c.direct : [0];
    expectArrayClose(pf.direct.length === 1 && pf.direct[0] === 0 && dirWant.length === 0 ? [] : pf.direct, dirWant, 1e-9, 1e-12);
  });
});

describe('pade', () => {
  it.each(padeG.cases.map((c, i) => [i, c] as const))('golden case %i', (_i, c) => {
    const { num, den } = pade(c.T, c.n);
    const lead = c.den[0];
    expectArrayClose(num, c.num.map((v: number) => v / lead), 1e-12, 1e-14);
    expectArrayClose(den, c.den.map((v: number) => v / lead), 1e-12, 1e-14);
  });
});

describe('error constants', () => {
  it('type 0, 1, 2', () => {
    const t0 = errorConstants([10], [1, 3, 2]);
    expect(t0.type).toBe(0);
    expectClose(t0.Kp, 5);
    expectClose(t0.essStep, 1 / 6);
    expect(t0.essRamp).toBe(Infinity);
    const t1 = errorConstants([10], [1, 2, 0]);
    expect(t1.type).toBe(1);
    expect(t1.essStep).toBe(0);
    expectClose(t1.Kv, 5);
    expectClose(t1.essRamp, 0.2);
    const t2 = errorConstants([4, 1], [1, 2, 0, 0]);
    expect(t2.type).toBe(2);
    expectClose(t2.Ka, 0.5);
    expect(t2.essRamp).toBe(0);
  });
});

describe('golden: acker (control.acker)', () => {
  it.each(ackerG.cases.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    const K = acker(c.A, c.B, c.poles.map(([re, im]: number[]) => cx(re, im)));
    expectArrayClose(K, c.K, 1e-6, 1e-8);
    const Acl = matSub(c.A, matMul(c.B, [K]));
    expectRootsClose(eigvals(Acl), c.poles.map(([re, im]: number[]) => cx(re, im)), 1e-6);
  });
});

describe('golden: lqr (control.lqr)', () => {
  it.each(lqrG.cases.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    const { K, X, poles } = lqr(c.A, c.B, c.Q, c.R);
    K.forEach((row, r) => expectArrayClose(row, c.K[r], 1e-6, 1e-8, `K row ${r}`));
    X.forEach((row, r) => expectArrayClose(row, c.X[r], 1e-6, 1e-8, `X row ${r}`));
    expectRootsClose(poles, c.poles.map(([re, im]: number[]) => cx(re, im)), 1e-6);
  });
});
