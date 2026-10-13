/**
 * C-2 Reaction Wheel Slew: single axis rigid body, I theta'' = u (+ disturbance).
 *
 * The wheel produces the control torque by spinning the other way:
 *   Iw w_w' = -u   and   Ia theta'' = u + d,
 * so Iw w_w + Ia theta_dot = integral of d. With no disturbance, Iw w_w = -Ia theta_dot.
 *
 * Ia = I (1 + e) is the true inertia. The controller and the bang-bang schedule only
 * know the nominal I, which is the whole point of the inertia error experiment.
 */
import { deg2rad, radps2rpm } from '../../core/units';
import { overshootPct, peakTime, settlingTime2pct, wnZetaFromPD } from '../../core/secondOrder';

export type Mode = 'pd' | 'bangbang';
/** Wheel: torque comes from spinning the wheel the other way. Thrusters: expelled mass, no stored momentum. */
export type Actuator = 'wheel' | 'thrusters';

export interface RWParams {
  mode: Mode;
  /** Overlay the other strategy on the plots. */
  compare: boolean;
  I: number; // nominal inertia [kg m^2]
  Iw: number; // wheel inertia [kg m^2]
  theta1Deg: number; // commanded slew [deg]
  Kp: number; // [N m / rad]
  KD: number; // [N m s / rad]
  uMax: number; // torque limit, and u* for bang-bang [N m]
  torqueLimit: boolean;
  inertiaErr: number; // e, as a fraction (0.1 = true inertia 10% high)
  dist: number; // constant disturbance torque [N m]
  actuator: Actuator;
}

/** Small-sat scale numbers: a ~200 kg spacecraft and a 4 N m s class wheel. */
export const DEFAULTS: RWParams = {
  mode: 'pd',
  compare: false,
  I: 50,
  Iw: 0.02,
  theta1Deg: 30,
  Kp: 0.5,
  KD: 7,
  uMax: 0.2,
  torqueLimit: false,
  inertiaErr: 0,
  dist: 0,
  actuator: 'wheel',
};

export const trueInertia = (p: RWParams) => p.I * (1 + p.inertiaErr);

// ---------------------------------------------------------------- open loop bang-bang
/** Switch time for a rest-to-rest bang-bang slew: accelerate for ts, brake for ts. */
export const bangSwitchTime = (I: number, theta1: number, uStar: number) => Math.sqrt((I * Math.abs(theta1)) / uStar);

export function bangTheory(p: RWParams) {
  const th1 = deg2rad(p.theta1Deg);
  const ts = bangSwitchTime(p.I, th1, p.uMax);
  const Ia = trueInertia(p);
  const peakRate = (p.uMax * ts) / Ia; // rad/s, reached at the switch
  return {
    ts,
    tFinal: 2 * ts,
    peakRateNominal: (p.uMax * ts) / p.I,
    peakRate,
    // Iw w = Ia * peakRate = u* ts, so the peak wheel speed does not depend on the inertia.
    peakWheelRpm: radps2rpm((p.uMax * ts) / p.Iw),
    finalAngleDeg: p.theta1Deg / (1 + p.inertiaErr),
  };
}

// ---------------------------------------------------------------- PD
export function pdTheory(p: RWParams) {
  const { wn, zeta } = wnZetaFromPD(p.Kp, p.KD, p.I);
  const offsetRad = p.dist / p.Kp; // theta_ss - theta1
  return {
    wn,
    zeta,
    overshoot: overshootPct(zeta),
    peakTime: peakTime(wn, zeta),
    settlingTime: settlingTime2pct(wn, zeta),
    offsetDeg: (offsetRad * 180) / Math.PI,
    finalAngleDeg: p.theta1Deg + (offsetRad * 180) / Math.PI,
    // Torque at t = 0+ before the rate builds up.
    initialTorque: p.Kp * deg2rad(p.theta1Deg),
    ...pdPeakRate(p, wn, zeta),
  };
}

/**
 * Peak body rate of the ideal underdamped response. The rate is
 * theta1 wn / sqrt(1 - z^2) e^{-z wn t} sin(wd t); setting its derivative to zero gives
 * tan(wd t*) = sqrt(1 - z^2) / z. The wheel holds the opposite momentum: Iw w = -I theta_dot.
 */
function pdPeakRate(p: RWParams, wn: number, zeta: number) {
  if (!(zeta < 1)) return { peakRate: NaN, peakWheelRpm: NaN };
  const s = Math.sqrt(1 - zeta * zeta);
  const wd = wn * s;
  const tStar = Math.atan2(s, zeta) / wd;
  const peakRate = ((Math.abs(deg2rad(p.theta1Deg)) * wn) / s) * Math.exp(-zeta * wn * tStar) * Math.sin(wd * tStar);
  return { peakRate, peakWheelRpm: radps2rpm((p.I * peakRate) / p.Iw) };
}

/** Closed loop poles with the true inertia: Ia s^2 + KD s + Kp = 0. */
export function pdPoles(p: RWParams, inertia = trueInertia(p)) {
  const a = inertia;
  const b = p.KD;
  const c = p.Kp;
  const disc = b * b - 4 * a * c;
  if (disc >= 0) {
    const r = Math.sqrt(disc);
    return [
      { re: (-b + r) / (2 * a), im: 0 },
      { re: (-b - r) / (2 * a), im: 0 },
    ];
  }
  const im = Math.sqrt(-disc) / (2 * a);
  return [
    { re: -b / (2 * a), im },
    { re: -b / (2 * a), im: -im },
  ];
}
