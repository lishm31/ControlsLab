import { describe, expect, it } from 'vitest';
import { cx } from '../complex';
import { ss2tf, tf2ss } from '../convert';
import { eigvals } from '../eig';
import { matClose } from '../linalg';
import { stepInfo } from '../metrics';
import { pmul, pfromRoots } from '../poly';
import { impulse, linspace, lsim, ramp, step } from '../response';
import { integrate } from '../rk4';
import { routh } from '../routh';
import { makeRng } from '../rng';
import { roots } from '../roots';
import {
  gainsFromWnZeta,
  overshootPct,
  peakTime,
  poles2,
  settlingTime2pct,
  underdampedStep,
  wnZetaFromPD,
  zetaFromOvershoot,
} from '../secondOrder';
import { c2dZoh, ctrb, isControllable, isObservable, ssDcGain } from '../ss';
import { TransferFunction, tf } from '../tf';
import { expectArrayClose, expectClose, expectRootsClose } from './helpers';

describe('TransferFunction', () => {
  const G = tf([1], [1, 1]); // 1/(s+1)
  it('normalizes to a monic denominator', () => {
    const H = tf([2, 4], [2, 6, 4]);
    expect(H.num).toEqual([1, 2]);
    expect(H.den).toEqual([1, 3, 2]);
  });
  it('series, parallel, feedback', () => {
    expect(G.series(tf([1], [1, 2])).den).toEqual([1, 3, 2]);
    const P = G.parallel(tf([1], [1, 2]));
    expect(P.num).toEqual([2, 3]);
    // Unity negative feedback around K/(s(s+1)) with K=4: 4/(s^2+s+4)
    const L = tf([4], [1, 1, 0]);
    const T = L.feedback();
    expect(T.num).toEqual([4]);
    expect(T.den).toEqual([1, 1, 4]);
    // Positive feedback flips the sign
    expect(L.feedback(TransferFunction.gain(1), 1).den).toEqual([1, 1, -4]);
    // Non-unity feedback H = 1/(s+5): G/(1+GH) = 4(s+5)/((s^2+s)(s+5)+4)
    const T2 = L.feedback(tf([1], [1, 5]));
    expectArrayClose(T2.num, [4, 20]);
    expectArrayClose(T2.den, [1, 6, 5, 4]);
  });
  it('poles, zeros, DC gain', () => {
    const H = tf([1, 3], [1, 3, 2]);
    expectRootsClose(H.poles(), [cx(-1), cx(-2)]);
    expectRootsClose(H.zeros(), [cx(-3)]);
    expectClose(H.dcGain(), 1.5);
    expect(tf([1], [1, 0]).dcGain()).toBe(Infinity);
  });
  it('minreal cancels a common factor', () => {
    const H = tf(pmul([1, 2], [1, 5]), pmul([1, 2], [1, 1, 4])).minreal();
    expectArrayClose(H.num, [1, 5], 1e-9);
    expectArrayClose(H.den, [1, 1, 4], 1e-9);
  });
  it('evaluates at a complex point', () => {
    const v = tf([1], [1, 1]).evalAt(cx(0, 1)); // 1/(1+j) = 0.5 - 0.5j
    expectClose(v.re, 0.5);
    expectClose(v.im, -0.5);
  });
});

describe('tf2ss / ss2tf', () => {
  it('builds the scipy controllable canonical form', () => {
    const s = tf2ss(tf([1, 3], [1, 3, 2]));
    expect(s.A).toEqual([[-3, -2], [1, 0]]);
    expect(s.B).toEqual([[1], [0]]);
    expect(s.C).toEqual([[1, 3]]);
    expect(s.D).toEqual([[0]]);
  });
  it('handles biproper TFs with a feedthrough term', () => {
    const s = tf2ss(tf([2, 1, 1], [1, 3, 2]));
    expect(s.D[0][0]).toBe(2);
    expect(s.C).toEqual([[1 - 6, 1 - 4]]);
  });
  it('round trips random TFs', () => {
    const rng = makeRng(3);
    for (let k = 0; k < 100; k++) {
      const n = rng.int(1, 6);
      const m = rng.int(0, n);
      const den = pfromRoots(Array.from({ length: n }, () => cx(rng.uniform(-5, 1))));
      const num = Array.from({ length: m + 1 }, () => rng.uniform(-3, 3));
      const G = tf(num, den);
      const back = ss2tf(tf2ss(G));
      expectArrayClose(back.den, G.den, 1e-7, 1e-9, 'den');
      const pad = new Array(back.num.length - G.num.length).fill(0).concat(G.num);
      expectArrayClose(back.num.slice(-pad.length), pad.slice(-back.num.length), 1e-7, 1e-8, 'num');
    }
  });
  it('eigenvalues of A equal the TF poles', () => {
    const G = tf([5], pmul([1, 1, 4], [1, 3]));
    expectRootsClose(eigvals(tf2ss(G).A), G.poles(), 1e-9);
  });
});

describe('state space tools', () => {
  const A = [[0, 1], [0, 0]];
  const B = [[0], [1]];
  it('controllability of the double integrator', () => {
    expect(ctrb(A, B)).toEqual([[0, 1], [1, 0]]);
    expect(isControllable({ A, B, C: [[1, 0]], D: [[0]] })).toBe(true);
    expect(isControllable({ A: [[-1, 0], [0, -2]], B: [[1], [0]], C: [[1, 1]], D: [[0]] })).toBe(false);
    expect(isObservable({ A, B, C: [[0, 1]], D: [[0]] })).toBe(false);
  });
  it('ZOH discretization of the double integrator', () => {
    const h = 0.1;
    const { Ad, Bd } = c2dZoh({ A, B, C: [[1, 0]], D: [[0]] }, h);
    expect(matClose(Ad, [[1, h], [0, 1]], 1e-14, 1e-15)).toBe(true);
    expect(matClose(Bd, [[h * h / 2], [h]], 1e-14, 1e-15)).toBe(true);
  });
  it('dc gain', () => {
    const s = tf2ss(tf([3], [1, 3, 2]));
    expectClose(ssDcGain(s)[0][0], 1.5, 1e-12);
  });
});

describe('responses', () => {
  it('first order step is exact on any grid', () => {
    const t = linspace(0, 5, 11);
    const { y } = step(tf([2], [1, 2]), t);
    expectArrayClose(y, t.map((v) => 1 - Math.exp(-2 * v)), 1e-12, 1e-14);
  });
  it('second order step matches the closed form', () => {
    const wn = 3, z = 0.3;
    const t = linspace(0, 6, 601);
    const { y } = step(tf([wn * wn], [1, 2 * z * wn, wn * wn]), t);
    expectArrayClose(y, t.map((v) => underdampedStep(wn, z, v)), 1e-10, 1e-12);
  });
  it('impulse is the derivative of the step', () => {
    const t = linspace(0, 4, 401);
    const { y } = impulse(tf([1], [1, 3]), t);
    expectArrayClose(y, t.map((v) => Math.exp(-3 * v)), 1e-12, 1e-14);
  });
  it('ramp of an integrator is t^2/2', () => {
    const t = linspace(0, 2, 21);
    expectArrayClose(ramp(tf([1], [1, 0]), t).y, t.map((v) => (v * v) / 2), 1e-12, 1e-14);
  });
  it('lsim matches RK4 on a forced 3rd order system', () => {
    const G = tf([2, 1], [1, 4, 6, 4]);
    const t = linspace(0, 8, 801);
    const u = t.map((v) => Math.sin(1.3 * v));
    const { y } = lsim(G, u, t);
    const s = tf2ss(G);
    const sim = integrate(
      (_t, x, uu) => s.A.map((r, i) => r.reduce((acc, a, j) => acc + a * x[j], 0) + s.B[i][0] * uu),
      (tt) => Math.sin(1.3 * tt),
      [0, 0, 0],
      { dt: 0.001, tEnd: 8, controlMode: 'continuous' },
    );
    for (let k = 0; k < t.length; k += 50) {
      const x = sim.x[k * 10];
      const yr = s.C[0].reduce((acc, c, i) => acc + c * x[i], 0);
      // FOH treats the sine as piecewise linear between samples, error ~ h^2 w^2 / 8
      expectClose(y[k], yr, 0, 1e-5);
    }
  });
});

describe('stepInfo and second order formulas', () => {
  it('measured metrics match the textbook formulas for an underdamped system', () => {
    const wn = 2, z = 0.4;
    const t = linspace(0, 15, 30001);
    const { y } = step(tf([wn * wn], [1, 2 * z * wn, wn * wn]), t);
    const info = stepInfo(t, y, { yFinal: 1, interpolate: true });
    expectClose(info.overshoot, overshootPct(z), 1e-4);
    expectClose(info.peakTime, peakTime(wn, z), 1e-3);
    // 4/(zeta wn) is an envelope estimate, so only roughly right
    expect(Math.abs(info.settlingTime - settlingTime2pct(wn, z)) / settlingTime2pct(wn, z)).toBeLessThan(0.25);
  });
  it('first order: rise time ln(9) tau, settling ln(50) tau, no overshoot', () => {
    const tau = 0.5;
    const t = linspace(0, 6, 60001);
    const { y } = step(tf([1], [tau, 1]), t);
    const info = stepInfo(t, y, { yFinal: 1, interpolate: true });
    expectClose(info.riseTime, Math.log(9) * tau, 1e-6);
    expectClose(info.settlingTime, Math.log(50) * tau, 1e-6);
    expect(info.overshoot).toBe(0);
  });
  it('inverse formulas are consistent', () => {
    for (const z of [0.1, 0.3, 0.5, 0.7, 0.9]) expectClose(zetaFromOvershoot(overshootPct(z)), z, 1e-12);
    const { Kp, KD } = gainsFromWnZeta(1.5, 0.6, 20);
    const back = wnZetaFromPD(Kp, KD, 20);
    expectClose(back.wn, 1.5);
    expectClose(back.zeta, 0.6);
    expectRootsClose(poles2(2, 0.5), roots([1, 2, 4]));
    expectRootsClose(poles2(2, 1.25), roots([1, 5, 4]));
  });
});

describe('routh', () => {
  it('stable cubic', () => {
    const r = routh([1, 6, 11, 6]);
    expect(r.verdict).toBe('stable');
    expect(r.signChanges).toBe(0);
    expectArrayClose(r.firstColumn, [1, 6, 10, 6]);
  });
  it('counts RHP roots', () => {
    // (s-1)(s-2)(s+3) = s^3 - 7s + 6 has a missing s^2 term -> zero pivot handled by epsilon
    const r = routh([1, 0, -7, 6]);
    expect(r.signChanges).toBe(2);
    expect(r.events.some((e) => e.kind === 'epsilon')).toBe(true);
  });
  it('row of zeros: s^4 + s^3 + 5s^2 + 4s + 4 = (s^2+4)(s^2+s+1)', () => {
    const r = routh(pmul([1, 0, 4], [1, 1, 1]));
    const z = r.events.find((e) => e.kind === 'zero-row');
    expect(z).toBeDefined();
    expect(r.verdict).toBe('marginal');
    expect(r.signChanges).toBe(0);
  });
  it('K for marginal stability of K/(s(s+1)(s+2)) is 6', () => {
    const den = (K: number) => [1, 3, 2, K];
    expect(routh(den(5.9)).verdict).toBe('stable');
    expect(routh(den(6)).verdict).toBe('marginal');
    expect(routh(den(6.1)).signChanges).toBe(2);
  });
  it('sign changes equal the number of RHP roots for random polynomials', () => {
    const rng = makeRng(99);
    for (let k = 0; k < 300; k++) {
      const n = rng.int(2, 8);
      const rs = [];
      while (rs.length < n) {
        if (n - rs.length >= 2 && rng.next() < 0.5) {
          let re = rng.uniform(-4, 3);
          if (Math.abs(re) < 0.1) re = 0.5;
          const im = rng.uniform(0.3, 4);
          rs.push(cx(re, im), cx(re, -im));
        } else {
          let re = rng.uniform(-5, 3);
          if (Math.abs(re) < 0.1) re = -1;
          rs.push(cx(re));
        }
      }
      const rhp = rs.filter((z) => z.re > 0).length;
      expect(routh(pfromRoots(rs)).signChanges).toBe(rhp);
    }
  });
});

describe('rk4', () => {
  it('is 4th order accurate on x\' = -x', () => {
    const err = (dt: number) => {
      const r = integrate((_t, x) => [-x[0]], () => 0, [1], { dt, tEnd: 1 });
      return Math.abs(r.x[r.x.length - 1][0] - Math.exp(-1));
    };
    const ratio = err(0.1) / err(0.05);
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(18);
  });
});

describe('core purity', () => {
  it('has no DOM, React, or Three imports', () => {
    const files = import.meta.glob('../*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(10);
    for (const [f, src] of Object.entries(files)) {
      expect(src, f).not.toMatch(/from ['"](react|react-dom|three)/);
      expect(src, f).not.toMatch(/\b(document|window)\./);
    }
  });
});
