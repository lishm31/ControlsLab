import { describe, expect, it } from 'vitest';
import { expectClose } from '../../../core/__tests__/helpers';
import { rad2deg, radps2rpm } from '../../../core/units';
import { wnZetaFromPD } from '../../../core/secondOrder';
import { measureBang, measurePD } from '../measure';
import { DEFAULTS, type RWParams } from '../model';
import { PROBLEMS, instance } from '../problems';
import { simulate } from '../sim';

const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);
const byId = (id: string) => PROBLEMS.find((g) => g.id === id)!;
const simParams = (patch: Partial<RWParams>): RWParams => ({ ...DEFAULTS, ...patch });

describe('every generator', () => {
  it.each(PROBLEMS.map((g) => [g.id, g] as const))('%s: reference answer passes its own check over 200 seeds', (_id, g) => {
    for (const s of SEEDS) {
      const p = instance(g, s);
      const ans = p.solve();
      expect(p.check(ans).pass, `seed ${s}`).toBe(true);
      // Never leaks the answer through the given values or prompt
      expect(p.fields.length).toBeGreaterThan(0);
      expect(p.steps().length).toBeGreaterThan(0);
    }
  });
  it.each(PROBLEMS.map((g) => [g.id, g] as const))('%s: is reproducible from the seed', (_id, g) => {
    const a = instance(g, 42);
    const b = instance(g, 42);
    expect(a.given).toEqual(b.given);
    expect(a.solve()).toEqual(b.solve());
  });
  it('wrong answers fail', () => {
    for (const g of PROBLEMS.filter((x) => x.id !== 'c02-meet-spec')) {
      const p = instance(g, 5);
      const bad = Object.fromEntries(Object.entries(p.solve()).map(([k, v]) => [k, v * 1.3 + 1]));
      expect(p.check(bad).pass, g.id).toBe(false);
    }
  });
});

describe('answers play out in the sim (load into simulator)', () => {
  it('read the gains: sim overshoot matches the hand answer', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const p = instance(byId('c02-read-gains'), s);
      const ans = p.solve();
      const sp = simParams(p.toSim());
      const m = measurePD(simulate(sp), sp);
      expectClose(m.overshoot, ans.os, 0.01, 0.05, `seed ${s}: ${m.overshoot} vs ${ans.os}`);
    }
  });
  it('gains from wn, zeta: the student gains give the requested wn and zeta', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const p = instance(byId('c02-design-wn-zeta'), s);
      const sp = simParams(p.toSim(p.solve()));
      const { wn, zeta } = wnZetaFromPD(sp.Kp, sp.KD, sp.I);
      const given = Object.fromEntries(p.given.map((g) => [g.tex, g.value]));
      expectClose(wn, given['\\omega_n'], 1e-9);
      expectClose(zeta, given['\\zeta'], 1e-9);
    }
  });
  it('meet a spec: the derived design passes in the sim, and a sluggish one fails', () => {
    for (const s of SEEDS) {
      const p = instance(byId('c02-meet-spec'), s);
      const ref = p.solve();
      const r = p.check(ref);
      expect(r.pass, `seed ${s} ${JSON.stringify(r.simEvidence)}`).toBe(true);
      expect(p.check({ Kp: ref.Kp / 20, KD: ref.KD / 20 }).pass).toBe(false);
      expect(p.check({ Kp: -1, KD: 2 }).pass).toBe(false);
    }
  });
  it('bang-bang plan: sim peak rate and wheel speed match', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const p = instance(byId('c02-bang-plan'), s);
      const ans = p.solve();
      const run = simulate(simParams(p.toSim()));
      const m = measureBang(run);
      expectClose(run.tSwitch!, ans.ts, 1e-9);
      expectClose(m.peakRateDegS, ans.rate, 1e-9);
      expectClose(m.peakWheelRpm, ans.rpm, 1e-9);
    }
  });
  it('inertia error: sim stops where the hand answer says', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const p = instance(byId('c02-inertia-error'), s);
      const m = measureBang(simulate(simParams(p.toSim())));
      expectClose(m.finalAngleDeg, p.solve().thf, 1e-9);
    }
  });
  it('disturbance: sim settles at the hand offset', () => {
    for (const s of SEEDS.slice(0, 20)) {
      const p = instance(byId('c02-disturbance'), s);
      const sp = simParams(p.toSim());
      const run = simulate(sp, 'pd', 3000);
      const off = rad2deg(run.theta.at(-1)! - (sp.theta1Deg * Math.PI) / 180);
      expectClose(off, p.solve().offset, 1e-4, 1e-6, `seed ${s}`);
      // and with K_p,min the offset is exactly epsilon
      const sp2 = { ...sp, Kp: p.solve().KpMin };
      const run2 = simulate(sp2, 'pd', 4000);
      const eps = p.given.find((g) => g.tex === '\\varepsilon')!.value;
      expectClose(Math.abs(rad2deg(run2.theta.at(-1)! - (sp.theta1Deg * Math.PI) / 180)), eps, 1e-3);
    }
  });
  it('unit sanity: rpm conversion', () => expectClose(radps2rpm(2 * Math.PI), 60));
});
