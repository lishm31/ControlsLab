/**
 * Real polynomials as coefficient arrays, highest power first.
 * [1, 3, 2] means s^2 + 3s + 2. Same convention as numpy and MATLAB.
 */
import { type Complex, cadd, cmul, cx, ZERO } from './complex';

export type Poly = number[];

/** Drop leading coefficients that are zero (or below tol relative to the largest). */
export function ptrim(p: Poly, tol = 0): Poly {
  if (p.length === 0) return [0];
  const big = Math.max(...p.map(Math.abs));
  const cut = tol * big;
  let i = 0;
  while (i < p.length - 1 && Math.abs(p[i]) <= cut) i++;
  return p.slice(i);
}

export const pdegree = (p: Poly): number => ptrim(p).length - 1;

export function padd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < a.length; i++) out[n - a.length + i] += a[i];
  for (let i = 0; i < b.length; i++) out[n - b.length + i] += b[i];
  return ptrim(out);
}

export const pscale = (a: Poly, k: number): Poly => a.map((c) => c * k);
export const psub = (a: Poly, b: Poly): Poly => padd(a, pscale(b, -1));

/** Polynomial product (coefficient convolution). */
export function pmul(a: Poly, b: Poly): Poly {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}

/** Horner evaluation at a real point. */
export function peval(p: Poly, x: number): number {
  let y = 0;
  for (const c of p) y = y * x + c;
  return y;
}

/** Horner evaluation at a complex point. */
export function pevalc(p: Poly, z: Complex): Complex {
  let y: Complex = ZERO;
  for (const c of p) y = cadd(cmul(y, z), cx(c));
  return y;
}

export function pderiv(p: Poly): Poly {
  const n = p.length - 1;
  if (n <= 0) return [0];
  return p.slice(0, n).map((c, i) => c * (n - i));
}

/** Long division a = q*b + r. */
export function pdiv(a: Poly, b: Poly): { q: Poly; r: Poly } {
  const bt = ptrim(b);
  if (bt.length === 1 && bt[0] === 0) throw new Error('pdiv: division by zero polynomial');
  const r = ptrim(a).slice();
  const nq = r.length - bt.length + 1;
  if (nq <= 0) return { q: [0], r };
  const q = new Array<number>(nq).fill(0);
  for (let i = 0; i < nq; i++) {
    const k = r[i] / bt[0];
    q[i] = k;
    for (let j = 0; j < bt.length; j++) r[i + j] -= k * bt[j];
  }
  return { q, r: ptrim(r.slice(nq).length ? r.slice(nq) : [0]) };
}

/** Build a real polynomial from roots (complex roots must come in conjugate pairs). */
export function pfromRoots(roots: Complex[], gain = 1): Poly {
  let p: Complex[] = [cx(1)];
  for (const z of roots) {
    const next: Complex[] = new Array(p.length + 1).fill(ZERO);
    for (let i = 0; i < p.length; i++) {
      next[i] = cadd(next[i], p[i]);
      next[i + 1] = cadd(next[i + 1], cmul(p[i], { re: -z.re, im: -z.im }));
    }
    p = next;
  }
  return p.map((c) => c.re * gain);
}

/** Make the leading coefficient 1. Returns the monic poly and the factor removed. */
export function pmonic(p: Poly): { p: Poly; lead: number } {
  const t = ptrim(p);
  const lead = t[0];
  return { p: t.map((c) => c / lead), lead };
}

export function pclose(a: Poly, b: Poly, tol = 1e-9): boolean {
  const d = psub(a, b);
  const scale = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  return d.every((c) => Math.abs(c) <= tol * scale);
}

/** Pretty string in s, e.g. "s^2 + 3s + 2". */
export function pformat(p: Poly, v = 's', digits = 4): string {
  const t = ptrim(p);
  const n = t.length - 1;
  const terms: string[] = [];
  t.forEach((c, i) => {
    if (c === 0) return;
    const pow = n - i;
    const mag = Math.abs(c);
    const num = Number(mag.toPrecision(digits)).toString();
    const coef = pow > 0 && mag === 1 ? '' : num;
    const sv = pow === 0 ? '' : pow === 1 ? v : `${v}^${pow}`;
    const sign = c < 0 ? '-' : '+';
    terms.push(`${sign} ${coef}${sv}`);
  });
  if (terms.length === 0) return '0';
  const s = terms.join(' ');
  return s.startsWith('+ ') ? s.slice(2) : '-' + s.slice(2);
}
