/**
 * C-1 Linear Systems Explorer: the unforced second order system
 *
 *   x'' + 2 zeta wn x' + s wn^2 x = 0,   s = +1 (spring) or -1 (negative stiffness)
 *
 * written as x' = A x with state [x, v]. Negative stiffness is what you get when you
 * linearize about an unstable equilibrium, like an inverted pendulum.
 */
import { type Complex, cx } from '../../core/complex';
import { c2dZoh } from '../../core/ss';
import { matVec } from '../../core/linalg';
import { roots } from '../../core/roots';

export type Visual = 'msd' | 'pendulum';

export interface LSParams {
  zeta: number;
  wn: number; // rad/s
  negStiffness: boolean;
  x0: number;
  v0: number;
  m: number; // kg, only used to show equivalent c and k
  visual: Visual;
}

export const DEFAULTS: LSParams = { zeta: 0.2, wn: 2, negStiffness: false, x0: 1, v0: 0, m: 1, visual: 'msd' };

export const stiffSign = (p: Pick<LSParams, 'negStiffness'>) => (p.negStiffness ? -1 : 1);

export function stateMatrix(p: LSParams): number[][] {
  return [
    [0, 1],
    [-stiffSign(p) * p.wn * p.wn, -2 * p.zeta * p.wn],
  ];
}

/** Characteristic polynomial s^2 + 2 zeta wn s + sign wn^2 and its roots (the eigenvalues of A). */
export const charPoly = (p: LSParams) => [1, 2 * p.zeta * p.wn, stiffSign(p) * p.wn * p.wn];
export const eigenvalues = (p: LSParams): Complex[] => roots(charPoly(p));

export type Regime = 'saddle' | 'unstable-osc' | 'unstable-node' | 'undamped' | 'underdamped' | 'critical' | 'overdamped';

export function regime(p: LSParams): Regime {
  if (p.negStiffness) return 'saddle';
  const z = p.zeta;
  if (Math.abs(z) < 1e-9) return 'undamped';
  if (z < 0) return z > -1 ? 'unstable-osc' : 'unstable-node';
  if (Math.abs(z - 1) < 1e-9) return 'critical';
  return z < 1 ? 'underdamped' : 'overdamped';
}

export const REGIME_TEXT: Record<Regime, { name: string; portrait: string; stable: 'stable' | 'marginal' | 'unstable' }> = {
  saddle: { name: 'Saddle (negative stiffness)', portrait: 'saddle', stable: 'unstable' },
  'unstable-osc': { name: 'Negative damping, growing oscillation', portrait: 'unstable spiral', stable: 'unstable' },
  'unstable-node': { name: 'Negative damping, growing', portrait: 'unstable node', stable: 'unstable' },
  undamped: { name: 'Undamped', portrait: 'center', stable: 'marginal' },
  underdamped: { name: 'Underdamped', portrait: 'stable spiral', stable: 'stable' },
  critical: { name: 'Critically damped', portrait: 'degenerate node', stable: 'stable' },
  overdamped: { name: 'Overdamped', portrait: 'stable node', stable: 'stable' },
};

/**
 * Closed-form free response x(t), v(t). Three cases from lecture:
 * complex roots, a double root, and distinct real roots.
 */
export function freeResponse(p: LSParams, t: number): [number, number] {
  const [l1, l2] = eigenvalues(p);
  const { x0, v0 } = p;
  if (Math.abs(l1.im) > 1e-12) {
    const sig = -l1.re; // decay rate
    const wd = Math.abs(l1.im);
    const e = Math.exp(-sig * t);
    const B = (v0 + sig * x0) / wd;
    const c = Math.cos(wd * t);
    const s = Math.sin(wd * t);
    const x = e * (x0 * c + B * s);
    const v = e * (-sig * (x0 * c + B * s) + wd * (-x0 * s + B * c));
    return [x, v];
  }
  const a = l1.re;
  const b = l2.re;
  if (Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))) {
    // double root lambda: x = (x0 + (v0 - lambda x0) t) e^{lambda t}
    const lam = (a + b) / 2;
    const C = v0 - lam * x0;
    const e = Math.exp(lam * t);
    return [(x0 + C * t) * e, (C + lam * (x0 + C * t)) * e];
  }
  const c1 = (v0 - b * x0) / (a - b);
  const c2 = (a * x0 - v0) / (a - b);
  return [c1 * Math.exp(a * t) + c2 * Math.exp(b * t), c1 * a * Math.exp(a * t) + c2 * b * Math.exp(b * t)];
}

/** Window: long enough to see the behavior, short enough that unstable ones do not explode off the plot. */
export function autoEnd(p: LSParams): number {
  const ev = eigenvalues(p);
  const maxRe = Math.max(...ev.map((e) => e.re));
  const minDecay = Math.min(...ev.map((e) => -e.re));
  const wd = Math.max(...ev.map((e) => Math.abs(e.im)));
  if (maxRe > 1e-9) return Math.min(30, Math.max(Math.log(25) / maxRe, wd > 0 ? (2 * 2 * Math.PI) / wd : 0));
  if (minDecay < 1e-9) return Math.min(40, (4 * 2 * Math.PI) / Math.max(wd, 1e-3));
  return Math.min(60, Math.max(6 / minDecay, wd > 0 ? (2 * 2 * Math.PI) / wd : 0));
}

export interface LSRun {
  t: number[];
  x: number[];
  v: number[];
  dt: number;
}

/** Exact simulation: step the state with the matrix exponential e^{A dt}. */
export function simulate(p: LSParams, tEnd = autoEnd(p), N = 1200): LSRun {
  const dt = tEnd / N;
  const { Ad } = c2dZoh({ A: stateMatrix(p), B: [[0], [0]], C: [[1, 0]], D: [[0]] }, dt);
  let s = [p.x0, p.v0];
  const t: number[] = [];
  const x: number[] = [];
  const v: number[] = [];
  for (let k = 0; k <= N; k++) {
    t.push(k * dt);
    x.push(s[0]);
    v.push(s[1]);
    s = matVec(Ad, s);
  }
  return { t, x, v, dt };
}

/** Real eigenvector directions [1, lambda] (normalized) when the eigenvalues are real and distinct. */
export function eigenDirections(p: LSParams): [number, number][] {
  const ev = eigenvalues(p);
  if (ev.some((e) => Math.abs(e.im) > 1e-12)) return [];
  if (Math.abs(ev[0].re - ev[1].re) < 1e-9) return [[1 / Math.hypot(1, ev[0].re), ev[0].re / Math.hypot(1, ev[0].re)]];
  return ev.map((e) => [1 / Math.hypot(1, e.re), e.re / Math.hypot(1, e.re)] as [number, number]);
}

/** Last time |x| is outside 2% of |x0| (free response settling). Infinity if it never settles in the run. */
export function settleTime(run: LSRun, x0: number, frac = 0.02): number {
  const lim = frac * Math.abs(x0);
  let last = -1;
  for (let k = 0; k < run.x.length; k++) if (Math.abs(run.x[k]) > lim) last = k;
  if (last === run.x.length - 1) return Infinity;
  return last < 0 ? 0 : run.t[last + 1];
}

/** Where eigenvalues travel as zeta goes from -0.5 to 2.5 at fixed wn: the classic circle plus real axis. */
export function eigenLocus(p: LSParams): Complex[][] {
  const up: Complex[] = [];
  const dn: Complex[] = [];
  for (let z = -0.5; z <= 2.5001; z += 0.01) {
    const [a, b] = roots([1, 2 * z * p.wn, stiffSign(p) * p.wn * p.wn]);
    const [hi, lo] = a.im >= b.im ? [a, b] : [b, a];
    if (Math.abs(hi.im) < 1e-12) {
      up.push(cx(Math.max(a.re, b.re), 0));
      dn.push(cx(Math.min(a.re, b.re), 0));
    } else {
      up.push(hi);
      dn.push(lo);
    }
  }
  return [up, dn];
}
