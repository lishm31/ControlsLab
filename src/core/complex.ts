/** Minimal immutable complex arithmetic. */
export interface Complex {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Complex => ({ re, im });
export const ZERO: Complex = Object.freeze({ re: 0, im: 0 });
export const ONE: Complex = Object.freeze({ re: 1, im: 0 });

export const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const cscale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });
export const cconj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
export const cneg = (a: Complex): Complex => ({ re: -a.re, im: -a.im });
export const cabs = (a: Complex): number => Math.hypot(a.re, a.im);
export const carg = (a: Complex): number => Math.atan2(a.im, a.re);

/** Division using Smith's algorithm to avoid overflow. */
export function cdiv(a: Complex, b: Complex): Complex {
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re;
    const d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im;
  const d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
}

export function cexp(a: Complex): Complex {
  const m = Math.exp(a.re);
  return { re: m * Math.cos(a.im), im: m * Math.sin(a.im) };
}

/** Principal square root. */
export function csqrt(a: Complex): Complex {
  const r = cabs(a);
  if (r === 0) return { re: 0, im: 0 };
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sqrt((r - a.re) / 2);
  return { re, im: a.im < 0 ? -im : im };
}

export const cinv = (a: Complex): Complex => cdiv(ONE, a);

export function cclose(a: Complex, b: Complex, tol = 1e-9): boolean {
  return cabs(csub(a, b)) <= tol * Math.max(1, cabs(a), cabs(b));
}

export function cformat(a: Complex, digits = 4): string {
  const re = a.re.toFixed(digits);
  if (Math.abs(a.im) < 10 ** -digits) return re;
  const sign = a.im < 0 ? '-' : '+';
  return `${re} ${sign} ${Math.abs(a.im).toFixed(digits)}j`;
}
