/**
 * Eigenvalues of a real general matrix: balance, reduce to Hessenberg form with
 * stabilized elementary similarity transforms, then Francis double shift QR.
 * This is the classic EISPACK / Numerical Recipes pipeline (balanc, elmhes, hqr),
 * written 1-based internally to stay close to the reference so it is easy to audit.
 */
import { type Complex, cx } from './complex';
import type { Matrix } from './linalg';
import { cleanConjugates, sortRoots } from './roots';

const EPS = Number.EPSILON;

function balance(a: number[][], n: number) {
  const RADIX = 2;
  const sqrdx = RADIX * RADIX;
  let done = false;
  while (!done) {
    done = true;
    for (let i = 1; i <= n; i++) {
      let r = 0;
      let c = 0;
      for (let j = 1; j <= n; j++)
        if (j !== i) {
          c += Math.abs(a[j][i]);
          r += Math.abs(a[i][j]);
        }
      if (c !== 0 && r !== 0) {
        let g = r / RADIX;
        let f = 1;
        const s = c + r;
        while (c < g) {
          f *= RADIX;
          c *= sqrdx;
        }
        g = r * RADIX;
        while (c > g) {
          f /= RADIX;
          c /= sqrdx;
        }
        if ((c + r) / f < 0.95 * s) {
          done = false;
          g = 1 / f;
          for (let j = 1; j <= n; j++) a[i][j] *= g;
          for (let j = 1; j <= n; j++) a[j][i] *= f;
        }
      }
    }
  }
}

function hessenberg(a: number[][], n: number) {
  for (let m = 2; m < n; m++) {
    let x = 0;
    let i = m;
    for (let j = m; j <= n; j++)
      if (Math.abs(a[j][m - 1]) > Math.abs(x)) {
        x = a[j][m - 1];
        i = j;
      }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) [a[i][j], a[m][j]] = [a[m][j], a[i][j]];
      for (let j = 1; j <= n; j++) [a[j][i], a[j][m]] = [a[j][m], a[j][i]];
    }
    if (x !== 0)
      for (let ii = m + 1; ii <= n; ii++) {
        let y = a[ii][m - 1];
        if (y !== 0) {
          y /= x;
          a[ii][m - 1] = y;
          for (let j = m; j <= n; j++) a[ii][j] -= y * a[m][j];
          for (let j = 1; j <= n; j++) a[j][m] += y * a[j][ii];
        }
      }
  }
  // Clear the stored multipliers so the matrix is exactly upper Hessenberg.
  for (let i = 3; i <= n; i++) for (let j = 1; j <= i - 2; j++) a[i][j] = 0;
}

const SIGN = (a: number, b: number) => (b >= 0 ? Math.abs(a) : -Math.abs(a));

function hqr(a: number[][], n: number, wr: number[], wi: number[]) {
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  let nn = n;
  let t = 0;
  let p = 0, q = 0, r = 0, s = 0, w = 0, x = 0, y = 0, z = 0;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) <= EPS * s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + SIGN(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn] = z;
            wi[nn - 1] = -z;
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eig: QR iteration did not converge');
          if (its === 10 || its === 20 || its === 40) {
            // Exceptional shift to break cycles.
            t += x;
            for (let i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u <= EPS * v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = SIGN(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
}

/** Eigenvalues of a square real matrix, sorted by real part then imaginary part. */
export function eigvals(A: Matrix): Complex[] {
  const n = A.length;
  if (n === 0) return [];
  if (A.some((row) => row.length !== n)) throw new Error('eigvals: matrix must be square');
  if (n === 1) return [cx(A[0][0])];
  // 1-based working copy.
  const a: number[][] = [new Array(n + 1).fill(0)];
  for (let i = 0; i < n; i++) a.push([0, ...A[i]]);
  balance(a, n);
  hessenberg(a, n);
  const wr = new Array(n + 1).fill(0);
  const wi = new Array(n + 1).fill(0);
  hqr(a, n, wr, wi);
  const out: Complex[] = [];
  for (let i = 1; i <= n; i++) out.push(cx(wr[i], wi[i]));
  return sortRoots(cleanConjugates(out));
}
