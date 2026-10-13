/**
 * Design helpers: time delay approximation, steady-state error constants, Ackermann
 * pole placement, and LQR through the Riccati equation.
 */
import { eigvals } from './eig';
import { type Matrix, eye, inv, lu, matAdd, matMul, matScale, matSub, normFro, solve, transpose, zeros } from './linalg';
import { type Poly, pfromRoots, ptrim } from './poly';
import { ctrb } from './ss';
import type { Complex } from './complex';

/** Pade approximation of e^{-sT}, order n (same coefficients as control.pade). */
export function pade(T: number, n = 1): { num: Poly; den: Poly } {
  if (T === 0) return { num: [1], den: [1] };
  const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));
  const c: number[] = [];
  for (let k = 0; k <= n; k++) c.push((fact(2 * n - k) * fact(n)) / (fact(2 * n) * fact(k) * fact(n - k)) * T ** k);
  // c[k] multiplies s^k; flip to highest power first, normalize the denominator to monic.
  const den = c.slice().reverse();
  const num = c.map((v, k) => v * (k % 2 ? -1 : 1)).reverse();
  const lead = den[0];
  return { num: num.map((v) => v / lead), den: den.map((v) => v / lead) };
}

export interface ErrorConstants {
  type: number; // number of free integrators in the loop
  Kp: number;
  Kv: number;
  Ka: number;
  essStep: number;
  essRamp: number;
  essParabola: number;
}

/** Static error constants and steady-state errors for unity negative feedback around L(s) = num/den. */
export function errorConstants(num: Poly, den: Poly): ErrorConstants {
  const n = ptrim(num);
  const d = ptrim(den);
  const trailing = (p: Poly) => {
    let z = 0;
    while (z < p.length - 1 && p[p.length - 1 - z] === 0) z++;
    return z;
  };
  const zN = trailing(n);
  const zD = trailing(d);
  const n0 = n[n.length - 1 - zN];
  const d0 = d[d.length - 1 - zD];
  const type = zD - zN;
  const lim = (j: number) => {
    const e = zN - zD + j;
    if (e > 0) return 0;
    if (e === 0) return n0 / d0;
    return Infinity * Math.sign(n0 / d0);
  };
  const Kp = lim(0);
  const Kv = lim(1);
  const Ka = lim(2);
  return { type, Kp, Kv, Ka, essStep: 1 / (1 + Kp), essRamp: 1 / Kv, essParabola: 1 / Ka };
}

/** Characteristic polynomial phi evaluated at a matrix: A^n + a1 A^{n-1} + ... + an I. */
function polyAtMatrix(p: Poly, A: Matrix): Matrix {
  let R = zeros(A.length);
  for (const c of p) R = matAdd(matMul(R, A), matScale(eye(A.length), c));
  return R;
}

/** Ackermann's formula for single input systems: K such that eig(A - B K) = poles. */
export function acker(A: Matrix, B: Matrix, poles: Complex[]): number[] {
  const n = A.length;
  if (B[0].length !== 1) throw new Error('acker: single input only');
  const phi = pfromRoots(poles);
  const C = ctrb(A, B);
  const en = zeros(1, n);
  en[0][n - 1] = 1;
  // K = e_n^T C^{-1} phi(A)  ->  solve C^T y = e_n, K = y^T phi(A)
  const y = solve(transpose(C), transpose(en));
  return matMul(transpose(y), polyAtMatrix(phi, A))[0];
}

/**
 * Continuous algebraic Riccati equation A'X + XA - X B R^{-1} B' X + Q = 0 by the matrix
 * sign function of the Hamiltonian (Roberts' method with determinant scaling).
 */
export function care(A: Matrix, B: Matrix, Q: Matrix, R: Matrix): Matrix {
  const n = A.length;
  const G = matMul(matMul(B, inv(R)), transpose(B));
  const H: Matrix = zeros(2 * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      H[i][j] = A[i][j];
      H[i][j + n] = -G[i][j];
      H[i + n][j] = -Q[i][j];
      H[i + n][j + n] = -A[j][i];
    }
  let Z = H;
  for (let it = 0; it < 100; it++) {
    const Zi = inv(Z);
    // determinant scaling speeds up convergence a lot
    const { LU } = lu(Z);
    let logdet = 0;
    for (let i = 0; i < 2 * n; i++) logdet += Math.log(Math.abs(LU[i][i]));
    // Scaling only helps early on; near convergence it is ~1 anyway.
    const c = Number.isFinite(logdet) ? Math.exp(-logdet / (2 * n)) : 1;
    const Zn = matScale(matAdd(matScale(Z, c), matScale(Zi, 1 / c)), 0.5);
    const delta = normFro(matSub(Zn, Z)) / Math.max(1, normFro(Z));
    Z = Zn;
    if (delta < 1e-13) break;
  }
  // [W12; W22 + I] X = -[W11 + I; W21], solved by least squares (normal equations).
  const M: Matrix = zeros(2 * n, n);
  const rhs: Matrix = zeros(2 * n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      M[i][j] = Z[i][j + n];
      M[i + n][j] = Z[i + n][j + n] + (i === j ? 1 : 0);
      rhs[i][j] = -(Z[i][j] + (i === j ? 1 : 0));
      rhs[i + n][j] = -Z[i + n][j];
    }
  const X = solve(matMul(transpose(M), M), matMul(transpose(M), rhs));
  // Symmetrize
  return X.map((r, i) => r.map((v, j) => (v + X[j][i]) / 2));
}

/** LQR gain K = R^{-1} B' X for u = -K x. */
export function lqr(A: Matrix, B: Matrix, Q: Matrix, R: Matrix): { K: Matrix; X: Matrix; poles: Complex[] } {
  const X = care(A, B, Q, R);
  const K = matMul(matMul(inv(R), transpose(B)), X);
  return { K, X, poles: eigvals(matSub(A, matMul(B, K))) };
}
