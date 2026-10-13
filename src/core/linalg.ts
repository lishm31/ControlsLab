/** Small dense real matrices as row-major number[][]. Sizes here are <= 12, so clarity beats speed. */
export type Matrix = number[][];
export type Vector = number[];

export const zeros = (n: number, m = n): Matrix => Array.from({ length: n }, () => new Array<number>(m).fill(0));
export const eye = (n: number): Matrix => zeros(n).map((r, i) => ((r[i] = 1), r));
export const clone = (A: Matrix): Matrix => A.map((r) => r.slice());
export const shape = (A: Matrix): [number, number] => [A.length, A.length ? A[0].length : 0];
export const transpose = (A: Matrix): Matrix => (A.length ? A[0].map((_, j) => A.map((r) => r[j])) : []);
export const colVec = (v: Vector): Matrix => v.map((x) => [x]);
export const rowVec = (v: Vector): Matrix => [v.slice()];

export function matMul(A: Matrix, B: Matrix): Matrix {
  const [n, k] = shape(A);
  const [k2, m] = shape(B);
  if (k !== k2) throw new Error(`matMul: ${n}x${k} times ${k2}x${m}`);
  const C = zeros(n, m);
  for (let i = 0; i < n; i++)
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[p][j];
    }
  return C;
}

export function matVec(A: Matrix, x: Vector): Vector {
  return A.map((r) => r.reduce((s, a, j) => s + a * x[j], 0));
}

export const matAdd = (A: Matrix, B: Matrix): Matrix => A.map((r, i) => r.map((a, j) => a + B[i][j]));
export const matSub = (A: Matrix, B: Matrix): Matrix => A.map((r, i) => r.map((a, j) => a - B[i][j]));
export const matScale = (A: Matrix, k: number): Matrix => A.map((r) => r.map((a) => a * k));
export const hstack = (A: Matrix, B: Matrix): Matrix => A.map((r, i) => r.concat(B[i]));
export const vstack = (A: Matrix, B: Matrix): Matrix => A.concat(B).map((r) => r.slice());
export const trace = (A: Matrix): number => A.reduce((s, r, i) => s + r[i], 0);
export const norm1 = (A: Matrix): number =>
  A.length ? Math.max(...A[0].map((_, j) => A.reduce((s, r) => s + Math.abs(r[j]), 0))) : 0;
export const normFro = (A: Matrix): number => Math.sqrt(A.reduce((s, r) => s + r.reduce((t, a) => t + a * a, 0), 0));

/** LU with partial pivoting. Returns packed LU, the row permutation, and its sign. */
export function lu(A: Matrix): { LU: Matrix; perm: number[]; sign: number; singular: boolean } {
  const n = A.length;
  const LU = clone(A);
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(LU[i][k]) > Math.abs(LU[p][k])) p = i;
    if (LU[p][k] === 0) {
      singular = true;
      continue;
    }
    if (p !== k) {
      [LU[p], LU[k]] = [LU[k], LU[p]];
      [perm[p], perm[k]] = [perm[k], perm[p]];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      const f = (LU[i][k] /= LU[k][k]);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) LU[i][j] -= f * LU[k][j];
    }
  }
  return { LU, perm, sign, singular };
}

export function det(A: Matrix): number {
  const { LU, sign } = lu(A);
  return LU.reduce((d, r, i) => d * r[i], sign);
}

/** Solve A X = B for a matrix right-hand side. Throws if A is singular. */
export function solve(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const { LU, perm, singular } = lu(A);
  if (singular) throw new Error('solve: matrix is singular');
  const m = B[0].length;
  const X = perm.map((p) => B[p].slice());
  for (let c = 0; c < m; c++) {
    for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) X[i][c] -= LU[i][k] * X[k][c];
    for (let i = n - 1; i >= 0; i--) {
      for (let k = i + 1; k < n; k++) X[i][c] -= LU[i][k] * X[k][c];
      X[i][c] /= LU[i][i];
    }
  }
  return X;
}

export const solveVec = (A: Matrix, b: Vector): Vector => solve(A, colVec(b)).map((r) => r[0]);
export const inv = (A: Matrix): Matrix => solve(A, eye(A.length));

/** Singular values by one-sided Jacobi. Accurate for small matrices, descending order. */
export function singularValues(A: Matrix): number[] {
  // Work on the taller orientation so columns are the shorter dimension.
  let U = shape(A)[0] >= shape(A)[1] ? clone(A) : transpose(A);
  const [m, n] = shape(U);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += U[i][p] * U[i][p];
          beta += U[i][q] * U[i][q];
          gamma += U[i][p] * U[i][q];
        }
        if (gamma === 0) continue;
        off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta));
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const up = U[i][p];
          const uq = U[i][q];
          U[i][p] = c * up - s * uq;
          U[i][q] = s * up + c * uq;
        }
      }
    if (off < 1e-15) break;
  }
  U = transpose(U);
  return U.map((col) => Math.hypot(...col)).sort((a, b) => b - a);
}

/** Numerical rank with the numpy default tolerance: max(m,n) * eps * sigma_max. */
export function rank(A: Matrix, tol?: number): number {
  const sv = singularValues(A);
  if (sv.length === 0) return 0;
  const t = tol ?? Math.max(...shape(A)) * Number.EPSILON * sv[0];
  return sv.filter((s) => s > t).length;
}

export function matClose(A: Matrix, B: Matrix, rel = 1e-9, abs = 1e-12): boolean {
  if (A.length !== B.length) return false;
  return A.every((r, i) => r.length === B[i].length && r.every((a, j) => Math.abs(a - B[i][j]) <= Math.max(abs, rel * Math.abs(B[i][j]))));
}
