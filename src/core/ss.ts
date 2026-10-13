/** Continuous-time state space models x' = A x + B u, y = C x + D u. */
import { type Complex } from './complex';
import { eigvals } from './eig';
import { expm } from './expm';
import { type Matrix, eye, hstack, matMul, matSub, rank, solve, transpose, vstack, zeros } from './linalg';

export interface StateSpace {
  A: Matrix;
  B: Matrix; // n x m
  C: Matrix; // p x n
  D: Matrix; // p x m
}

export const ss = (A: Matrix, B: Matrix, C: Matrix, D: Matrix): StateSpace => ({ A, B, C, D });
export const nStates = (s: StateSpace) => s.A.length;
export const ssPoles = (s: StateSpace): Complex[] => eigvals(s.A);

/** Controllability matrix [B, AB, A^2 B, ...]. */
export function ctrb(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  let blk = B;
  let M = B;
  for (let k = 1; k < n; k++) {
    blk = matMul(A, blk);
    M = hstack(M, blk);
  }
  return M;
}

/** Observability matrix [C; CA; CA^2; ...]. */
export function obsv(A: Matrix, C: Matrix): Matrix {
  return transpose(ctrb(transpose(A), transpose(C)));
}

export const isControllable = (s: StateSpace) => rank(ctrb(s.A, s.B)) === nStates(s);
export const isObservable = (s: StateSpace) => rank(obsv(s.A, s.C)) === nStates(s);

/** Static gain D - C A^{-1} B. Throws if A is singular (integrator in the loop). */
export function ssDcGain(s: StateSpace): Matrix {
  return matSub(s.D, matMul(s.C, solve(s.A, s.B)));
}

/**
 * Exact discretization with a first order hold on the input (exact for piecewise
 * linear inputs, so steps and ramps are reproduced exactly at the samples):
 *   x[k+1] = Ad x[k] + G1 u[k] + G2 (u[k+1] - u[k]).
 */
export function c2dFoh(s: StateSpace, h: number): { Ad: Matrix; G1: Matrix; G2: Matrix } {
  const n = nStates(s);
  const m = s.B[0].length;
  const N = n + 2 * m;
  const M = zeros(N);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = s.A[i][j] * h;
    for (let j = 0; j < m; j++) M[i][n + j] = s.B[i][j] * h;
  }
  for (let j = 0; j < m; j++) M[n + j][n + m + j] = 1;
  const E = expm(M);
  const pick = (c0: number, c1: number) => E.slice(0, n).map((r) => r.slice(c0, c1));
  return { Ad: pick(0, n), G1: pick(n, n + m), G2: pick(n + m, N) };
}

/** Zero order hold discretization (what a digital controller sees). */
export function c2dZoh(s: StateSpace, h: number): { Ad: Matrix; Bd: Matrix } {
  const n = nStates(s);
  const m = s.B[0].length;
  const M = vstack(hstack(s.A, s.B), zeros(m, n + m)).map((r) => r.map((a) => a * h));
  const E = expm(M);
  return { Ad: E.slice(0, n).map((r) => r.slice(0, n)), Bd: E.slice(0, n).map((r) => r.slice(n)) };
}

export const identity = eye;
