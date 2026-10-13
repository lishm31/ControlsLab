import { describe, expect, it } from 'vitest';
import { underdampedStep } from '../../../core/secondOrder';
import { deg2rad, rad2deg, radps2rpm } from '../../../core/units';
import { expectClose } from '../../../core/__tests__/helpers';
import { measureBang, measurePD } from '../measure';
import { DEFAULTS, bangTheory, pdTheory, type RWParams } from '../model';
import { simulate } from '../sim';

const P = (x: Partial<RWParams> = {}): RWParams => ({ ...DEFAULTS, ...x });

describe('PD slew', () => {
  it('matches the analytic second order step response', () => {
    const p = P({ I: 10, Kp: 10, KD: 10, theta1Deg: 20 }); // wn = 1, zeta = 0.5
    const run = simulate(p);
    const th1 = deg2rad(20);
    for (let k = 0; k < run.t.length; k += 97) expectClose(run.theta[k], th1 * underdampedStep(1, 0.5, run.t[k]), 0, 2e-5 * th1);
  });
  it('overshoot and peak time match theory (I=10, Kp=10, KD=10)', () => {
    const p = P({ I: 10, Kp: 10, KD: 10 });
    const m = measurePD(simulate(p), p);
    const th = pdTheory(p);
    expectClose(th.overshoot, 16.303, 1e-4);
    expectClose(m.overshoot, th.overshoot, 2e-3);
    expectClose(m.peakTime, th.peakTime, 2e-3);
  });
  it('a constant disturbance leaves a steady-state offset of d/Kp', () => {
    const p = P({ dist: 0.01 });
    // Run long enough for the transient to die out completely
    const m = measurePD(simulate(p, 'pd', 400), p);
    expectClose(m.offsetDeg, rad2deg(0.01 / p.Kp), 1e-3);
    expectClose(pdTheory(p).offsetDeg, rad2deg(0.02), 1e-12);
  });
  it('respects the torque limit and records saturation', () => {
    const p = P({ torqueLimit: true, uMax: 0.1, theta1Deg: 60 });
    const run = simulate(p);
    expect(run.saturated).toBe(true);
    for (const u of run.u) expect(Math.abs(u)).toBeLessThanOrEqual(0.1 + 1e-12);
    // Still gets there, just slower
    expectClose(rad2deg(run.theta.at(-1)!), 60, 1e-3);
  });
});

describe('bang-bang slew', () => {
  it('ends at theta1 with zero rate when the inertia is right', () => {
    const p = P({ mode: 'bangbang' });
    const m = measureBang(simulate(p));
    expectClose(m.finalAngleDeg, p.theta1Deg, 1e-9);
    expect(Math.abs(m.finalRateDegS)).toBeLessThan(1e-9);
    const th = bangTheory(p);
    expectClose(m.peakRateDegS, rad2deg(th.peakRate), 1e-9);
    expectClose(m.peakWheelRpm, th.peakWheelRpm, 1e-9);
  });
  it('stops at theta1/(1+e) with zero rate when the true inertia is off', () => {
    for (const e of [-0.2, 0.1, 0.35]) {
      const p = P({ mode: 'bangbang', inertiaErr: e });
      const m = measureBang(simulate(p));
      expectClose(m.finalAngleDeg, p.theta1Deg / (1 + e), 1e-9);
      expect(Math.abs(m.finalRateDegS)).toBeLessThan(1e-9);
    }
  });
  it('drifts under a constant disturbance (open loop cannot correct)', () => {
    const p = P({ mode: 'bangbang', dist: 0.002 });
    const run = simulate(p);
    const m = measureBang(run);
    expect(m.finalRateDegS).toBeGreaterThan(0);
    expect(m.angleAtEndDeg).toBeGreaterThan(m.finalAngleDeg);
    // rate after the maneuver is d * t / I exactly
    expectClose(m.finalRateDegS, rad2deg((0.002 * 2 * run.tSwitch!) / p.I), 1e-9);
  });
});

describe('wheel momentum', () => {
  it('Iw w_w + Ia theta_dot equals the disturbance impulse at every sample', () => {
    for (const p of [P(), P({ mode: 'bangbang', inertiaErr: 0.2 }), P({ dist: -0.003, torqueLimit: true, uMax: 0.05 })]) {
      const run = simulate(p);
      const Ia = p.I * (1 + p.inertiaErr);
      run.t.forEach((t, k) => {
        expectClose(p.Iw * run.wheel[k] + Ia * run.rate[k], p.dist * t, 0, 1e-9);
      });
    }
  });
  it('wheel spins opposite to the body', () => {
    const run = simulate(P({ mode: 'bangbang' }));
    const k = Math.round(run.tSwitch! / run.dt);
    expect(Math.sign(run.wheel[k])).toBe(-Math.sign(run.rate[k]));
    expectClose(Math.abs(radps2rpm(run.wheel[k])), bangTheory(P()).peakWheelRpm, 1e-9);
  });
});
