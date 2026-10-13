import { describe, expect, it } from 'vitest';
import { expectClose } from '../../../core/__tests__/helpers';
import { DEFAULTS, type LSParams, eigenvalues, freeResponse, simulate } from '../model';
import { PROBLEMS, instance } from '../problems';

const SEEDS = Array.from({ length: 200 }, (_, i) => 3000 + i * 7919);
const byId = (id: string) => PROBLEMS.find((g) => g.id === id)!;
const sp = (patch: Partial<LSParams>): LSParams => ({ ...DEFAULTS, ...patch });

describe('C-1 generators', () => {
  it.each(PROBLEMS.map((g) => [g.id, g] as const))('%s: reference answer passes over 200 seeds', (_id, g) => {
    for (const s of SEEDS) {
      const p = instance(g, s);
      expect(p.check(p.solve()).pass, `seed ${s}`).toBe(true);
      expect(p.steps().length).toBeGreaterThan(0);
    }
  });
  it.each(PROBLEMS.map((g) => [g.id, g] as const))('%s: reproducible from the seed', (_id, g) => {
    expect(instance(g, 9).solve()).toEqual(instance(g, 9).solve());
  });
  it('wrong answers fail', () => {
    for (const g of PROBLEMS.filter((x) => x.id !== 'c01-choose-damping')) {
      const p = instance(g, 11);
      const bad = Object.fromEntries(Object.entries(p.solve()).map(([k, v]) => [k, v * 1.3 + 0.7]));
      expect(p.check(bad).pass, g.id).toBe(false);
    }
  });
});

describe('C-1 answers play out in the sim', () => {
  it('free response: sim x(t1) matches', () => {
    for (const s of SEEDS.slice(0, 50)) {
      const p = instance(byId('c01-free-response'), s);
      const params = sp(p.toSim());
      const t1 = p.given.find((g) => g.tex === 't_1')!.value;
      const run = simulate(params, t1, 2000);
      expectClose(run.x.at(-1)!, p.solve().x, 1e-7, 1e-9, `seed ${s}`);
    }
  });
  it('linearize: loaded sim has the answered eigenvalue or wn/zeta', () => {
    for (const s of SEEDS.slice(0, 50)) {
      const p = instance(byId('c01-linearize'), s);
      const ans = p.solve();
      const params = sp(p.toSim());
      if ('lam' in ans) {
        const lmax = Math.max(...eigenvalues(params).map((e) => e.re));
        expectClose(lmax, ans.lam, 1e-9);
        // small tilt grows like e^{lambda t}
        const [x] = freeResponse(params, 3 / ans.lam);
        expect(x / params.x0).toBeGreaterThan(Math.exp(3) * 0.4);
      } else {
        expectClose(params.wn, ans.wn, 1e-12);
        expectClose(params.zeta, ans.zeta, 1e-12);
      }
    }
  });
  it('eigenvalue and timescale problems load systems with matching eigenvalues', () => {
    for (const s of SEEDS.slice(0, 50)) {
      const p = instance(byId('c01-timescales'), s);
      const ev = eigenvalues(sp(p.toSim()));
      expectClose((2 * Math.PI) / Math.abs(ev[0].im), p.solve().Td, 1e-9);
      const q = instance(byId('c01-eigs'), s);
      const e2 = eigenvalues(sp(q.toSim()));
      const a = q.solve();
      const isComplex = Math.abs(e2[0].im) > 1e-9;
      if (isComplex) {
        expectClose(e2[0].re, a.re, 1e-9, 1e-9);
        expectClose(Math.abs(e2[0].im), a.im, 1e-9, 1e-9);
      } else {
        expectClose(Math.max(e2[0].re, e2[1].re), a.re, 1e-6, 1e-9);
        expectClose(Math.min(e2[0].re, e2[1].re), a.im, 1e-6, 1e-9);
      }
    }
  });
  it('choose damping: zero damping and a huge damper both fail', () => {
    for (const s of SEEDS.slice(0, 30)) {
      const p = instance(byId('c01-choose-damping'), s);
      expect(p.check({ c: 0 }).pass).toBe(false);
      expect(p.check({ c: p.solve().c * 40 }).pass).toBe(false);
      expect(simulate(sp(p.toSim(p.solve()))).x.length).toBeGreaterThan(0);
    }
  });
});
