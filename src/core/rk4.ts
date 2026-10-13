/** Fixed-step RK4 for nonlinear sims (saturation, delays, switching) where exact discretization does not apply. */
export type Deriv = (t: number, x: number[], u: number) => number[];
export type Control = (t: number, x: number[]) => number;

export function rk4Step(f: (t: number, x: number[]) => number[], t: number, x: number[], h: number): number[] {
  const n = x.length;
  const k1 = f(t, x);
  const x2 = new Array(n);
  for (let i = 0; i < n; i++) x2[i] = x[i] + 0.5 * h * k1[i];
  const k2 = f(t + 0.5 * h, x2);
  for (let i = 0; i < n; i++) x2[i] = x[i] + 0.5 * h * k2[i];
  const k3 = f(t + 0.5 * h, x2);
  for (let i = 0; i < n; i++) x2[i] = x[i] + h * k3[i];
  const k4 = f(t + h, x2);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

export interface SimResult {
  t: number[];
  x: number[][]; // x[k] is the state at t[k]
  u: number[]; // control applied over [t[k], t[k+1])
}

export interface IntegrateOptions {
  dt: number;
  tEnd: number;
  /**
   * 'zoh' (default): control computed once at the start of each step and held, like a
   * digital flight computer running at 1/dt Hz. Exact for switching laws like bang-bang
   * when switch times land on the grid.
   * 'continuous': control evaluated inside every RK stage, matching the analog model.
   */
  controlMode?: 'zoh' | 'continuous';
}

export function integrate(f: Deriv, control: Control, x0: number[], opts: IntegrateOptions): SimResult {
  const { dt, tEnd } = opts;
  const steps = Math.round(tEnd / dt);
  const t: number[] = [0];
  const x: number[][] = [x0.slice()];
  const u: number[] = [];
  let xk = x0.slice();
  for (let k = 0; k < steps; k++) {
    const tk = k * dt;
    let uk: number;
    if (opts.controlMode === 'continuous') {
      uk = control(tk, xk);
      xk = rk4Step((tt, xx) => f(tt, xx, control(tt, xx)), tk, xk, dt);
    } else {
      uk = control(tk, xk);
      xk = rk4Step((tt, xx) => f(tt, xx, uk), tk, xk, dt);
    }
    u.push(uk);
    t.push((k + 1) * dt);
    x.push(xk);
  }
  u.push(control(steps * dt, xk));
  return { t, x, u };
}
