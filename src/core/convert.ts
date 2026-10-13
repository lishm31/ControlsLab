/** Conversions between transfer functions and state space (SISO). */
import { type Matrix, matMul, matSub, zeros } from './linalg';
import { eigvals } from './eig';
import { padd, pfromRoots, pscale, psub } from './poly';
import { type StateSpace } from './ss';
import { TransferFunction } from './tf';

/**
 * Controllable canonical form, the same realization scipy.signal.tf2ss returns:
 * A has -a1 ... -an in the first row and ones on the subdiagonal, B = e1,
 * C = b - b0 a (after making the TF proper with matching degrees), D = b0.
 */
export function tf2ss(G: TransferFunction): StateSpace {
  if (!G.isProper()) throw new Error('tf2ss: transfer function must be proper');
  const den = G.den; // monic
  const n = den.length - 1;
  const num = new Array<number>(n + 1 - G.num.length).fill(0).concat(G.num);
  const D = [[num[0]]];
  if (n === 0) return { A: [], B: [], C: [], D };
  const A = zeros(n);
  for (let j = 0; j < n; j++) A[0][j] = -den[j + 1];
  for (let i = 1; i < n; i++) A[i][i - 1] = 1;
  const B = zeros(n, 1);
  B[0][0] = 1;
  const C = [Array.from({ length: n }, (_, j) => num[j + 1] - num[0] * den[j + 1])];
  return { A, B, C, D };
}

/**
 * State space to transfer function for input j, output i. Uses the same identity as
 * scipy.signal.ss2tf: num(s) = det(sI - A + B C) - det(sI - A) + D det(sI - A),
 * which holds because det(I + (sI-A)^{-1} B C) = 1 + C (sI-A)^{-1} B for rank one B C.
 */
export function ss2tf(sys: StateSpace, out = 0, inp = 0): TransferFunction {
  const n = sys.A.length;
  const d = sys.D[out][inp];
  if (n === 0) return new TransferFunction([d], [1]);
  const b: Matrix = sys.B.map((r) => [r[inp]]);
  const c: Matrix = [sys.C[out].slice()];
  const den = pfromRoots(eigvals(sys.A));
  const denBC = pfromRoots(eigvals(matSub(sys.A, matMul(b, c))));
  const num = padd(psub(denBC, den), pscale(den, d));
  return new TransferFunction(cleanTiny(num), den);
}

/** Zero out coefficients that are pure rounding noise relative to the largest one. */
function cleanTiny(p: number[], rel = 1e-12): number[] {
  const big = Math.max(...p.map(Math.abs));
  return p.map((c) => (Math.abs(c) <= rel * big ? 0 : c));
}
