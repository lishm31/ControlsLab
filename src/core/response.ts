/**
 * Time responses of LTI systems by exact discretization (first order hold), so results
 * are exact at the samples for steps and ramps, independent of the step size.
 */
import type { Complex } from './complex';
import { tf2ss } from './convert';
import { matVec } from './linalg';
import { type StateSpace, c2dFoh } from './ss';
import { TransferFunction } from './tf';

export interface Response {
  t: number[];
  y: number[];
}

const asSS = (sys: TransferFunction | StateSpace): StateSpace => (sys instanceof TransferFunction ? tf2ss(sys) : sys);

export function linspace(a: number, b: number, n: number): number[] {
  if (n < 2) return [a];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function checkUniform(t: number[]): number {
  const h = t[1] - t[0];
  for (let k = 1; k < t.length; k++)
    if (Math.abs(t[k] - t[k - 1] - h) > 1e-9 * Math.max(1, Math.abs(h))) throw new Error('lsim: time grid must be uniform');
  return h;
}

/** Simulate output y for input samples u on a uniform grid t (SISO, input 0 / output 0). */
export function lsim(sys: TransferFunction | StateSpace, u: number[], t: number[], x0?: number[]): Response & { x: number[][] } {
  const s = asSS(sys);
  const n = s.A.length;
  const d = s.D[0][0];
  if (n === 0) return { t, y: u.map((v) => d * v), x: t.map(() => []) };
  const h = checkUniform(t);
  const { Ad, G1, G2 } = c2dFoh(s, h);
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  const xs: number[][] = [];
  const y: number[] = [];
  const c = s.C[0];
  for (let k = 0; k < t.length; k++) {
    xs.push(x);
    y.push(c.reduce((acc, ci, i) => acc + ci * x[i], 0) + d * u[k]);
    if (k === t.length - 1) break;
    const ax = matVec(Ad, x);
    const du = u[k + 1] - u[k];
    x = ax.map((v, i) => v + G1[i][0] * u[k] + G2[i][0] * du);
  }
  return { t, y, x: xs };
}

export function step(sys: TransferFunction | StateSpace, t: number[]): Response {
  const { y } = lsim(sys, t.map(() => 1), t);
  return { t, y };
}

export function ramp(sys: TransferFunction | StateSpace, t: number[]): Response {
  const { y } = lsim(sys, t.map((v) => v - t[0]), t);
  return { t, y };
}

/**
 * Impulse response C e^{At} B (the D delta is not representable on a grid and is
 * dropped, the same choice python-control makes).
 */
export function impulse(sys: TransferFunction | StateSpace, t: number[]): Response {
  const s = asSS(sys);
  if (s.A.length === 0) return { t, y: t.map(() => 0) };
  const x0 = s.B.map((r) => r[0]);
  const noD = { ...s, D: [[0]] };
  const { y } = lsim(noD, t.map(() => 0), t, x0);
  return { t, y };
}

/**
 * A sensible simulation window from the poles: about 7 time constants of the slowest
 * stable pole, at least a few periods of the slowest oscillation, capped for marginal
 * or unstable systems.
 */
export function autoTimeEnd(poles: Complex[]): number {
  let tEnd = 0;
  for (const p of poles) {
    const sigma = -p.re;
    if (sigma > 1e-9) tEnd = Math.max(tEnd, 7 / sigma);
    if (Math.abs(p.im) > 1e-9) tEnd = Math.max(tEnd, (3 * 2 * Math.PI) / Math.abs(p.im));
  }
  if (tEnd === 0) tEnd = 10;
  return Math.min(tEnd, 200);
}
