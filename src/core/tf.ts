/** SISO transfer functions G(s) = num(s) / den(s), coefficients highest power first. */
import { type Complex, cabs, cdiv, csub } from './complex';
import { type Poly, padd, pformat, pfromRoots, pevalc, pmul, pscale, ptrim, peval } from './poly';
import { roots } from './roots';

export class TransferFunction {
  readonly num: Poly;
  readonly den: Poly;

  constructor(num: Poly | number, den: Poly | number = 1) {
    const n = ptrim(typeof num === 'number' ? [num] : num);
    const d = ptrim(typeof den === 'number' ? [den] : den);
    if (d.length === 1 && d[0] === 0) throw new Error('TransferFunction: zero denominator');
    // Store with a monic denominator so equal systems have equal coefficients.
    const lead = d[0];
    this.num = n.map((c) => c / lead);
    this.den = d.map((c) => c / lead);
  }

  static gain(k: number) {
    return new TransferFunction([k], [1]);
  }
  /** The Laplace variable s itself. */
  static s() {
    return new TransferFunction([1, 0], [1]);
  }
  static fromPolesZeros(zeros: Complex[], poles: Complex[], k = 1) {
    return new TransferFunction(pfromRoots(zeros, k), pfromRoots(poles));
  }

  get order() {
    return this.den.length - 1;
  }
  get relativeDegree() {
    return this.den.length - this.num.length;
  }
  isProper() {
    return this.relativeDegree >= 0;
  }
  isStrictlyProper() {
    return this.relativeDegree > 0;
  }

  /** Series connection: this * other. */
  series(other: TransferFunction) {
    return new TransferFunction(pmul(this.num, other.num), pmul(this.den, other.den));
  }
  /** Parallel connection: this + other. */
  parallel(other: TransferFunction) {
    return new TransferFunction(padd(pmul(this.num, other.den), pmul(other.num, this.den)), pmul(this.den, other.den));
  }
  /**
   * Closed loop with H in the feedback path. sign = -1 (default) is negative feedback:
   * T = G / (1 + G H).
   */
  feedback(H: TransferFunction = TransferFunction.gain(1), sign: -1 | 1 = -1) {
    const num = pmul(this.num, H.den);
    const den = padd(pmul(this.den, H.den), pscale(pmul(this.num, H.num), -sign));
    return new TransferFunction(num, den);
  }
  scale(k: number) {
    return new TransferFunction(pscale(this.num, k), this.den);
  }
  neg() {
    return this.scale(-1);
  }

  poles(): Complex[] {
    return roots(this.den);
  }
  zeros(): Complex[] {
    return roots(this.num);
  }
  /** Leading gain k in G = k * prod(s - z) / prod(s - p). */
  get zpkGain() {
    return this.num[0];
  }
  evalAt(s: Complex): Complex {
    return cdiv(pevalc(this.num, s), pevalc(this.den, s));
  }
  /** G(0). Infinite when there is a pole at the origin. */
  dcGain(): number {
    const d = peval(this.den, 0);
    const n = peval(this.num, 0);
    if (d === 0) return n === 0 ? NaN : Infinity * Math.sign(n);
    return n / d;
  }

  /** Cancel pole-zero pairs closer than tol (relative). Useful after block diagram algebra. */
  minreal(tol = 1e-7) {
    const z = this.zeros();
    const p = this.poles();
    const keepZ: Complex[] = [];
    for (const zi of z) {
      const k = p.findIndex((pi) => cabs(csub(pi, zi)) <= tol * Math.max(1, cabs(zi)));
      if (k >= 0) p.splice(k, 1);
      else keepZ.push(zi);
    }
    return new TransferFunction(pfromRoots(keepZ, this.num[0]), pfromRoots(p));
  }

  toString(v = 's') {
    return `(${pformat(this.num, v)}) / (${pformat(this.den, v)})`;
  }
}

export const tf = (num: Poly | number, den: Poly | number = 1) => new TransferFunction(num, den);
