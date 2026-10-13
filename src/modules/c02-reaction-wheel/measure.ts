/** Measured quantities from a sim run, for the theory vs measured table and for judging design problems. */
import { stepInfo } from '../../core/metrics';
import { rad2deg, radps2rpm, deg2rad } from '../../core/units';
import { type RWParams } from './model';
import { type RWRun, indexAt } from './sim';

export interface PDMeasured {
  overshoot: number;
  peakTime: number;
  settlingTime: number;
  riseTime: number;
  finalAngleDeg: number;
  offsetDeg: number;
  peakTorque: number;
  peakRateDegS: number;
  peakWheelRpm: number;
}

export function measurePD(run: RWRun, p: RWParams): PDMeasured {
  const th1 = deg2rad(p.theta1Deg);
  const yFinal = th1 + p.dist / p.Kp;
  const info = stepInfo(run.t, run.theta, { yFinal, interpolate: true });
  const last = run.theta[run.theta.length - 1];
  return {
    overshoot: info.overshoot,
    peakTime: info.peakTime,
    settlingTime: info.settlingTime,
    riseTime: info.riseTime,
    finalAngleDeg: rad2deg(last),
    offsetDeg: rad2deg(last - th1),
    peakTorque: Math.max(...run.u.map(Math.abs)),
    peakRateDegS: rad2deg(Math.max(...run.rate.map(Math.abs))),
    peakWheelRpm: Math.max(...run.wheel.map((w) => Math.abs(radps2rpm(w)))),
  };
}

export interface BangMeasured {
  finalAngleDeg: number; // at t = 2 ts
  finalRateDegS: number;
  peakRateDegS: number;
  peakWheelRpm: number;
  angleAtEndDeg: number; // at the end of the window (shows drift)
}

export function measureBang(run: RWRun): BangMeasured {
  const k = indexAt(run, 2 * (run.tSwitch ?? 0));
  return {
    finalAngleDeg: rad2deg(run.theta[k]),
    finalRateDegS: rad2deg(run.rate[k]),
    peakRateDegS: rad2deg(Math.max(...run.rate.slice(0, k + 1).map(Math.abs))),
    peakWheelRpm: Math.max(...run.wheel.slice(0, k + 1).map((w) => Math.abs(radps2rpm(w)))),
    angleAtEndDeg: rad2deg(run.theta[run.theta.length - 1]),
  };
}
