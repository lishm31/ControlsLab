import { describe, expect, it } from 'vitest';
import { expectClose, expectRootsClose } from '../../../core/__tests__/helpers';
import { eigvals } from '../../../core/eig';
import { DEFAULTS, type LSParams, eigenvalues, freeResponse, regime, settleTime, simulate, stateMatrix } from '../model';

const P = (x: Partial<LSParams>): LSParams => ({ ...DEFAULTS, ...x });

describe('C-1 free response', () => {
  const cases: [string, Partial<LSParams>][] = [
    ['underdamped', { zeta: 0.2, wn: 2, x0: 1, v0: 0.5 }],
    ['undamped', { zeta: 0, wn: 3, x0: 0.5, v0: -1 }],
    ['critical', { zeta: 1, wn: 1.5, x0: 1, v0: 2 }],
    ['overdamped', { zeta: 2, wn: 1, x0: -1, v0: 1 }],
    ['negative damping', { zeta: -0.1, wn: 2, x0: 0.2, v0: 0 }],
    ['negative stiffness', { zeta: 0.3, wn: 2, negStiffness: true, x0: 0.01, v0: 0 }],
  ];
  it.each(cases)('%s: closed form matches the matrix exponential sim', (_n, x) => {
    const p = P(x);
    const run = simulate(p);
    for (let k = 0; k < run.t.length; k += 37) {
      const [xa, va] = freeResponse(p, run.t[k]);
      const scale = 1 + Math.abs(xa);
      expectClose(run.x[k], xa, 0, 1e-9 * scale);
      expectClose(run.v[k], va, 0, 1e-8 * scale);
    }
  });
  it.each(cases)('%s: eigenvalues of A are the roots of the characteristic equation', (_n, x) => {
    const p = P(x);
    expectRootsClose(eigvals(stateMatrix(p)), eigenvalues(p), 1e-6);
  });
  it('classifies regimes', () => {
    expect(regime(P({ zeta: 0.5 }))).toBe('underdamped');
    expect(regime(P({ zeta: 1 }))).toBe('critical');
    expect(regime(P({ zeta: 1.5 }))).toBe('overdamped');
    expect(regime(P({ zeta: 0 }))).toBe('undamped');
    expect(regime(P({ zeta: -0.2 }))).toBe('unstable-osc');
    expect(regime(P({ negStiffness: true }))).toBe('saddle');
  });
  it('undamped motion conserves energy (x^2 wn^2 + v^2)', () => {
    const p = P({ zeta: 0, wn: 2.5, x0: 1, v0: 0.3 });
    const run = simulate(p);
    const E0 = p.wn ** 2 * p.x0 ** 2 + p.v0 ** 2;
    run.t.forEach((_t, k) => expectClose(p.wn ** 2 * run.x[k] ** 2 + run.v[k] ** 2, E0, 1e-9));
  });
  it('critically damped crosses zero once only when thrown hard enough toward it', () => {
    const crossings = (v0: number) => {
      const run = simulate(P({ zeta: 1, wn: 2, x0: 1, v0 }), 20, 4000);
      let n = 0;
      for (let k = 1; k < run.x.length; k++) if (Math.sign(run.x[k]) !== Math.sign(run.x[k - 1]) && Math.abs(run.x[k]) > 1e-12) n++;
      return n;
    };
    expect(crossings(0)).toBe(0);
    expect(crossings(-1.9)).toBe(0); // v0 > -wn x0
    expect(crossings(-6)).toBe(1); // v0 < -wn x0
  });
  it('2% settling is close to the envelope estimate for light damping', () => {
    const p = P({ zeta: 0.1, wn: 2 });
    const ts = settleTime(simulate(p, 60, 20000), p.x0);
    // ln(50)/(zeta wn) is the envelope crossing; the response crosses at or before it
    expect(ts).toBeLessThanOrEqual(Math.log(50) / (0.1 * 2) / Math.sqrt(1 - 0.01) + 0.05);
    expect(ts).toBeGreaterThan(0.8 * (Math.log(50) / 0.2));
  });
});
