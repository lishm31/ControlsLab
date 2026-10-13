/** Time simulation of the slew with RK4. Control is computed at each step and held (ZOH), like flight software. */
import { integrate } from '../../core/rk4';
import { deg2rad } from '../../core/units';
import { type Mode, type RWParams, bangSwitchTime, pdTheory, trueInertia } from './model';

export interface RWRun {
  mode: Mode;
  t: number[];
  theta: number[]; // rad
  rate: number[]; // rad/s
  u: number[]; // applied torque [N m]
  uCmd: number[]; // torque before saturation
  wheel: number[]; // wheel speed, inertial [rad/s]
  wheelAngle: number[]; // wheel angle relative to the body [rad]
  saturated: boolean;
  dt: number;
  tSwitch?: number;
}

const STEPS = 4000;

/** Window long enough to see the whole maneuver plus some coast. */
export function autoEnd(p: RWParams, mode: Mode): number {
  if (mode === 'bangbang') return Math.min(1200, 2 * bangSwitchTime(p.I, deg2rad(p.theta1Deg), p.uMax) * 1.6);
  const Ia = trueInertia(p);
  const disc = p.KD * p.KD - 4 * Ia * p.Kp;
  // Slowest pole real part decides how long it takes to settle.
  const slow = disc >= 0 ? (p.KD - Math.sqrt(disc)) / (2 * Ia) : p.KD / (2 * Ia);
  const { peakTime: tp } = pdTheory(p);
  let tEnd = Math.max(7 / Math.max(slow, 1e-6), Number.isFinite(tp) ? 3 * tp : 0);
  // Saturation stretches the slew; give it room.
  if (p.torqueLimit) tEnd += (2 * Math.sqrt((Ia * deg2rad(Math.abs(p.theta1Deg))) / p.uMax));
  return Math.min(1200, tEnd);
}

export function simulate(p: RWParams, mode: Mode = p.mode, tEnd = autoEnd(p, mode)): RWRun {
  const th1 = deg2rad(p.theta1Deg);
  const Ia = trueInertia(p);
  let dt = tEnd / STEPS;
  let tSwitch: number | undefined;
  if (mode === 'bangbang') {
    // Put the switch exactly on the grid, so the piecewise constant torque is integrated exactly.
    tSwitch = bangSwitchTime(p.I, th1, p.uMax);
    const n = Math.max(1, Math.round(tSwitch / dt));
    dt = tSwitch / n;
  }
  const sgn = Math.sign(th1) || 1;
  const sat = (u: number) => (p.torqueLimit ? Math.max(-p.uMax, Math.min(p.uMax, u)) : u);
  const law = (t: number, x: number[]) => {
    if (mode === 'bangbang') {
      const ts = tSwitch!;
      // Small epsilon so float noise at the grid point picks the next phase.
      return t < ts - 1e-9 * ts ? sgn * p.uMax : t < 2 * ts - 1e-9 * ts ? -sgn * p.uMax : 0;
    }
    return p.Kp * (th1 - x[0]) - p.KD * x[1];
  };
  const applied = (t: number, x: number[]) => (mode === 'bangbang' ? law(t, x) : sat(law(t, x)));
  // State: theta, theta_dot, wheel speed (inertial), wheel angle relative to body
  const f = (_t: number, x: number[], u: number) => [x[1], (u + p.dist) / Ia, -u / p.Iw, x[2] - x[1]];
  // PD is the analog law from lecture, so evaluate it inside every RK stage. Bang-bang
  // switches land on the grid, so holding the torque over each step is exact.
  const r = integrate(f, applied, [0, 0, 0, 0], { dt, tEnd, controlMode: mode === 'pd' ? 'continuous' : 'zoh' });
  const cmd = r.t.map((t, k) => law(t, r.x[k]));
  const saturated = cmd.some((c, k) => Math.abs(c - r.u[k]) > 1e-12);
  return {
    mode,
    t: r.t,
    theta: r.x.map((x) => x[0]),
    rate: r.x.map((x) => x[1]),
    wheel: r.x.map((x) => x[2]),
    wheelAngle: r.x.map((x) => x[3]),
    u: r.u,
    uCmd: cmd,
    saturated,
    dt,
    tSwitch,
  };
}

/** Sample index for a time (clamped). */
export const indexAt = (run: RWRun, t: number) => Math.max(0, Math.min(run.t.length - 1, Math.round(t / run.dt)));
