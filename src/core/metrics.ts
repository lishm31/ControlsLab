/** Step response metrics with the same definitions as python-control's step_info. */
export interface StepInfo {
  riseTime: number; // 10% to 90% of final value
  settlingTime: number; // last exit from the 2% band
  settlingMin: number;
  settlingMax: number;
  overshoot: number; // percent
  undershoot: number; // percent
  peak: number;
  peakTime: number;
  steadyState: number;
}

export interface StepInfoOptions {
  /** Final value. Defaults to the last sample (pass the DC gain when known). */
  yFinal?: number;
  settlingThreshold?: number; // default 0.02
  riseLimits?: [number, number]; // default [0.1, 0.9]
  /**
   * false: sample times only, exactly like python-control (used for golden tests).
   * true: linearly interpolate threshold crossings, better on coarse grids (used in the UI).
   */
  interpolate?: boolean;
}

export function stepInfo(t: number[], y: number[], opts: StepInfoOptions = {}): StepInfo {
  const yf = opts.yFinal ?? y[y.length - 1];
  const thr = opts.settlingThreshold ?? 0.02;
  const [rLo, rHi] = opts.riseLimits ?? [0.1, 0.9];
  const interp = opts.interpolate ?? false;
  const sgn = Math.sign(yf) || 1;

  // Rise time: first sample at or past each limit.
  const cross = (level: number): number => {
    for (let k = 0; k < y.length; k++) {
      if (sgn * (y[k] - level * yf) >= 0) {
        if (!interp || k === 0) return t[k];
        const y0 = y[k - 1];
        const y1 = y[k];
        const f = (level * yf - y0) / (y1 - y0);
        return t[k - 1] + f * (t[k] - t[k - 1]);
      }
    }
    return NaN;
  };
  const riseTime = cross(rHi) - cross(rLo);

  // Settling time: first sample after the last one outside the band.
  let lastOut = -1;
  for (let k = 0; k < y.length; k++) if (Math.abs(y[k] / yf - 1) >= thr) lastOut = k;
  let settlingTime: number;
  if (lastOut === -1) settlingTime = t[0];
  else if (lastOut + 1 >= y.length) settlingTime = NaN;
  else if (!interp) settlingTime = t[lastOut + 1];
  else {
    const y0 = y[lastOut];
    const y1 = y[lastOut + 1];
    const edge = y0 > yf ? yf * (1 + sgn * thr) : yf * (1 - sgn * thr);
    const f = y1 === y0 ? 1 : (edge - y0) / (y1 - y0);
    settlingTime = t[lastOut] + Math.min(1, Math.max(0, f)) * (t[lastOut + 1] - t[lastOut]);
  }

  // Overshoot uses the signed maximum, peak uses the magnitude (both as in python-control).
  let ymax = -Infinity;
  let ymin = Infinity;
  let kPeak = 0;
  for (let k = 0; k < y.length; k++) {
    ymax = Math.max(ymax, sgn * y[k]);
    ymin = Math.min(ymin, sgn * y[k]);
    if (Math.abs(y[k]) > Math.abs(y[kPeak])) kPeak = k;
  }
  const peak = Math.abs(y[kPeak]);
  const overshoot = Math.max(0, (100 * (Math.abs(ymax) - Math.abs(yf))) / Math.abs(yf));
  const undershoot = ymin < 0 ? Math.abs((100 * sgn * ymin) / yf) : 0;

  // Settling min/max over the response after it first reaches the upper rise limit.
  const kRise = y.findIndex((v) => sgn * (v - rHi * yf) >= 0);
  const tail = kRise >= 0 ? y.slice(kRise) : y;
  return {
    riseTime,
    settlingTime,
    settlingMin: Math.min(...tail, yf),
    settlingMax: Math.max(...tail, yf),
    overshoot,
    undershoot,
    peak,
    peakTime: t[kPeak],
    steadyState: yf,
  };
}

/** Steady-state error for a unit-normalized reference r: e_ss = r - y_final. */
export const steadyStateError = (r: number, yFinal: number) => r - yFinal;
