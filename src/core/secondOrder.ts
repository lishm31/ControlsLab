/**
 * Standard second order system G(s) = wn^2 / (s^2 + 2 zeta wn s + wn^2) and the
 * classic closed-form approximations. These are the formulas from lecture; tests
 * check each one against the exact simulated response.
 */
import { type Complex, cx } from './complex';

export const wnZetaFromPD = (Kp: number, KD: number, I: number) => ({
  wn: Math.sqrt(Kp / I),
  zeta: KD / (2 * Math.sqrt(Kp * I)),
});

export const gainsFromWnZeta = (wn: number, zeta: number, I: number) => ({ Kp: I * wn * wn, KD: 2 * zeta * wn * I });

/** Percent overshoot for 0 <= zeta < 1, 0 when zeta >= 1. */
export const overshootPct = (zeta: number) => (zeta >= 1 ? 0 : 100 * Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)));

/** Damping ratio that gives a target percent overshoot (inverse of overshootPct). */
export function zetaFromOvershoot(pct: number): number {
  if (pct <= 0) return 1;
  const L = Math.log(pct / 100);
  return -L / Math.sqrt(Math.PI * Math.PI + L * L);
}

export const peakTime = (wn: number, zeta: number) => (zeta >= 1 ? Infinity : Math.PI / (wn * Math.sqrt(1 - zeta * zeta)));
/** 2% settling time approximation 4 / (zeta wn). */
export const settlingTime2pct = (wn: number, zeta: number) => 4 / (zeta * wn);
/** Rise time (10-90%) approximation, (1 - 0.4167 zeta + 2.917 zeta^2) / wn, from Nise. */
export const riseTimeApprox = (wn: number, zeta: number) => (1 - 0.4167 * zeta + 2.917 * zeta * zeta) / wn;

export function poles2(wn: number, zeta: number): [Complex, Complex] {
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return [cx(-zeta * wn, wd), cx(-zeta * wn, -wd)];
  }
  const r = wn * Math.sqrt(zeta * zeta - 1);
  return [cx(-zeta * wn + r), cx(-zeta * wn - r)];
}

/** Exact unit step response of the standard form, for 0 < zeta < 1. */
export function underdampedStep(wn: number, zeta: number, t: number): number {
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  const phi = Math.acos(zeta);
  return 1 - (Math.exp(-zeta * wn * t) / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t + phi);
}
