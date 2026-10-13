/**
 * C-2 practice problems, in the style of HW C-1 (Oct 23): a spacecraft with given
 * inertia and actuator numbers, find quantities with units. Six types.
 */
import { makeRng } from '../../core/rng';
import { overshootPct, settlingTime2pct, zetaFromOvershoot } from '../../core/secondOrder';
import { deg2rad, rad2deg, radps2rpm } from '../../core/units';
import { computeProblem, sf } from '../../engine/compute';
import type { ProblemGenerator, ProblemInstance } from '../../engine/types';
import { measurePD } from './measure';
import { DEFAULTS, type RWParams } from './model';
import { simulate } from './sim';

const MOD = 'c02-reaction-wheel';
const clean: Partial<RWParams> = { inertiaErr: 0, dist: 0, torqueLimit: false, compare: false, actuator: 'wheel' };
type Gen = ProblemGenerator<RWParams>;

// ---------------------------------------------------------------- 1. read the gains
const readGains: Gen = {
  id: 'c02-read-gains',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Read the gains',
  difficulty: 1,
  generate(rng) {
    const I = rng.nice(20, 120, 5);
    const wn0 = rng.nice(0.05, 0.4, 0.01);
    const z0 = rng.nice(0.2, 0.85, 0.05);
    const Kp = sf(I * wn0 * wn0);
    const KD = sf(2 * z0 * wn0 * I);
    const wn = Math.sqrt(Kp / I);
    const zeta = KD / (2 * Math.sqrt(Kp * I));
    const answer = { wn, zeta, os: overshootPct(zeta), ts: settlingTime2pct(wn, zeta) };
    return computeProblem<RWParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt:
        'A spacecraft slews about one axis, $I\\ddot\\theta = u$, with PD control $u = K_p(\\theta_1 - \\theta) - K_D\\dot\\theta$. Find the natural frequency, damping ratio, percent overshoot, and the 2% settling time estimate $4/(\\zeta\\omega_n)$.',
      given: [
        { label: 'Inertia', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'Proportional gain', tex: 'K_p', value: Kp, unit: 'N m/rad' },
        { label: 'Derivative gain', tex: 'K_D', value: KD, unit: 'N m s/rad' },
      ],
      fields: [
        { key: 'wn', label: 'Natural frequency', tex: '\\omega_n', unit: 'rad/s', tol: { rel: 0.02 } },
        { key: 'zeta', label: 'Damping ratio', tex: '\\zeta', unit: '', tol: { rel: 0.02 } },
        { key: 'os', label: 'Overshoot', tex: 'M_p', unit: '%', tol: { rel: 0.03, abs: 0.3 } },
        { key: 'ts', label: 'Settling time', tex: 't_s', unit: 's', tol: { rel: 0.03 } },
      ],
      answer,
      steps: () => [
        { text: 'Closed loop: $I\\ddot\\theta + K_D\\dot\\theta + K_p\\theta = K_p\\theta_1$. Match to $s^2 + 2\\zeta\\omega_n s + \\omega_n^2$.', tex: '\\omega_n = \\sqrt{K_p/I}', value: { v: answer.wn, unit: 'rad/s' } },
        { text: 'Damping from the middle coefficient.', tex: '\\zeta = \\frac{K_D}{2\\sqrt{K_p I}}', value: { v: answer.zeta, unit: '' } },
        { text: 'Overshoot of a standard second order step.', tex: 'M_p = 100\\, e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}}', value: { v: answer.os, unit: '%' } },
        { text: 'Envelope estimate for 2% settling. Load it into the sim to see how close the estimate is.', tex: 't_s \\approx \\frac{4}{\\zeta\\omega_n}', value: { v: answer.ts, unit: 's' } },
      ],
      toSim: () => ({ ...clean, mode: 'pd', I, Kp, KD, theta1Deg: 30 }),
    });
  },
};

// ---------------------------------------------------------------- 2. design from wn and zeta
const designWnZeta: Gen = {
  id: 'c02-design-wn-zeta',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Gains from wn and zeta',
  difficulty: 1,
  generate(rng) {
    const I = rng.nice(20, 150, 5);
    const wn = rng.nice(0.05, 0.4, 0.01);
    const zeta = rng.nice(0.3, 1.0, 0.05);
    const answer = { Kp: I * wn * wn, KD: 2 * zeta * wn * I };
    return computeProblem<RWParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt: 'Pick PD gains so the closed loop slew has the given natural frequency and damping ratio.',
      given: [
        { label: 'Inertia', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'Natural frequency', tex: '\\omega_n', value: wn, unit: 'rad/s' },
        { label: 'Damping ratio', tex: '\\zeta', value: zeta, unit: '' },
      ],
      fields: [
        { key: 'Kp', label: 'Proportional gain', tex: 'K_p', unit: 'N m/rad', tol: { rel: 0.02 } },
        { key: 'KD', label: 'Derivative gain', tex: 'K_D', unit: 'N m s/rad', tol: { rel: 0.02 } },
      ],
      answer,
      steps: () => [
        { text: 'Divide the closed loop by I and match coefficients.', tex: 's^2 + \\frac{K_D}{I}s + \\frac{K_p}{I} = s^2 + 2\\zeta\\omega_n s + \\omega_n^2' },
        { text: 'Stiffness term.', tex: 'K_p = I\\omega_n^2', value: { v: answer.Kp, unit: 'N m/rad' } },
        { text: 'Damping term.', tex: 'K_D = 2\\zeta\\omega_n I', value: { v: answer.KD, unit: 'N m s/rad' } },
      ],
      toSim: (input) => ({
        ...clean,
        mode: 'pd',
        I,
        theta1Deg: 30,
        ...(input?.Kp && input.Kp > 0 ? { Kp: input.Kp } : {}),
        ...(input?.KD && input.KD > 0 ? { KD: input.KD } : {}),
      }),
    });
  },
};

// ---------------------------------------------------------------- 3. meet a spec (design, judged by the sim)
const meetSpec: Gen = {
  id: 'c02-meet-spec',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Meet a spec',
  difficulty: 2,
  generate(rng) {
    const I = rng.nice(20, 120, 5);
    const theta1Deg = rng.nice(10, 60, 5);
    const zRef = rng.nice(0.5, 0.8, 0.05);
    const wnRef = rng.nice(0.08, 0.3, 0.01);
    const osMax = Math.ceil(overshootPct(zRef) + 2);
    const tsMax = Math.ceil(1.15 * settlingTime2pct(wnRef, zRef));
    // A valid design derived from the specs alone, the way you would on paper.
    const zSpec = zetaFromOvershoot(osMax);
    const zPick = Math.min(0.95, zSpec + 0.05);
    const wnPick = (1.2 * 4) / (zPick * tsMax);
    const ref = { Kp: sf(I * wnPick * wnPick), KD: sf(2 * zPick * wnPick * I) };
    const base = { ...DEFAULTS, ...clean, mode: 'pd' as const, I, theta1Deg };
    const judge = (input: Record<string, number>) => {
      const Kp = input.Kp;
      const KD = input.KD;
      const ok = Number.isFinite(Kp) && Number.isFinite(KD) && Kp > 0 && KD > 0;
      if (!ok)
        return {
          pass: false,
          perField: { Kp: { pass: Kp > 0, missing: !Number.isFinite(Kp) }, KD: { pass: KD > 0, missing: !Number.isFinite(KD) } },
          simEvidence: { specs: [], note: 'Both gains need to be positive numbers.' },
        };
      const p = { ...base, Kp, KD };
      const m = measurePD(simulate(p), p);
      const ts = Number.isFinite(m.settlingTime) ? m.settlingTime : Infinity;
      const specs = [
        { label: 'Overshoot', limit: `<= ${osMax} %`, measured: m.overshoot, unit: '%', pass: m.overshoot <= osMax },
        { label: 'Settling time (2%)', limit: `<= ${tsMax} s`, measured: ts, unit: 's', pass: ts <= tsMax },
      ];
      const pass = specs.every((s) => s.pass);
      return { pass, perField: { Kp: { pass }, KD: { pass } }, simEvidence: { specs } };
    };
    const inst: ProblemInstance<RWParams> = {
      generatorId: this.id,
      seed: rng.seed,
      kind: 'design',
      title: this.title,
      prompt: `Design PD gains for a ${theta1Deg} deg slew. The sim runs your gains and checks both specs, so any design that meets them passes. No torque limit.`,
      given: [
        { label: 'Inertia', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'Slew angle', tex: '\\theta_1', value: theta1Deg, unit: 'deg' },
        { label: 'Max overshoot', tex: 'M_p', value: osMax, unit: '%' },
        { label: 'Max 2% settling time', tex: 't_s', value: tsMax, unit: 's' },
      ],
      fields: [
        { key: 'Kp', label: 'Proportional gain', tex: 'K_p', unit: 'N m/rad', tol: {} },
        { key: 'KD', label: 'Derivative gain', tex: 'K_D', unit: 'N m s/rad', tol: {} },
      ],
      solve: () => ({ ...ref }),
      steps: () => [
        { text: 'Overshoot spec sets a minimum damping ratio.', tex: '\\zeta \\ge \\frac{-\\ln(M_p/100)}{\\sqrt{\\pi^2 + \\ln^2(M_p/100)}}', value: { v: zSpec, unit: '' } },
        { text: 'Add a little margin.', tex: `\\zeta = ${zPick.toFixed(3)}` },
        { text: 'Settling spec with the 4/(zeta wn) estimate, plus 20% margin because the estimate is rough.', tex: '\\omega_n = 1.2\\cdot\\frac{4}{\\zeta t_s}', value: { v: wnPick, unit: 'rad/s' } },
        { text: 'Convert to gains.', tex: 'K_p = I\\omega_n^2,\\quad K_D = 2\\zeta\\omega_n I' },
        { text: 'One valid answer (yours can differ):', tex: `K_p = ${ref.Kp},\\quad K_D = ${ref.KD}` },
      ],
      check: judge,
      toSim: (input) => ({
        ...clean,
        mode: 'pd',
        I,
        theta1Deg,
        ...(input?.Kp && input.Kp > 0 ? { Kp: input.Kp } : {}),
        ...(input?.KD && input.KD > 0 ? { KD: input.KD } : {}),
      }),
    };
    return inst;
  },
};

// ---------------------------------------------------------------- 4. bang-bang plan
const bangPlan: Gen = {
  id: 'c02-bang-plan',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Plan a bang-bang slew',
  difficulty: 2,
  generate(rng) {
    const I = rng.nice(20, 150, 5);
    const Iw = rng.nice(0.01, 0.05, 0.005);
    const theta1Deg = rng.nice(10, 90, 5);
    const u = rng.nice(0.05, 0.3, 0.01);
    const th1 = deg2rad(theta1Deg);
    const ts = Math.sqrt((I * th1) / u);
    const rate = (u * ts) / I;
    const answer = { ts, rate: rad2deg(rate), rpm: radps2rpm((I * rate) / Iw) };
    return computeProblem<RWParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt:
        'Open loop rest-to-rest slew with one reaction wheel: torque $+u^*$ until the switch time $t_s$, then $-u^*$ for another $t_s$. Find the switch time, the peak body rate, and the peak wheel speed.',
      given: [
        { label: 'Spacecraft inertia', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'Wheel inertia', tex: 'I_w', value: Iw, unit: 'kg m²' },
        { label: 'Slew angle', tex: '\\theta_1', value: theta1Deg, unit: 'deg' },
        { label: 'Wheel torque', tex: 'u^*', value: u, unit: 'N m' },
      ],
      fields: [
        { key: 'ts', label: 'Switch time', tex: 't_s', unit: 's', tol: { rel: 0.02 } },
        { key: 'rate', label: 'Peak body rate', tex: '\\dot\\theta_{max}', unit: 'deg/s', tol: { rel: 0.02 } },
        { key: 'rpm', label: 'Peak wheel speed', tex: '\\omega_{w,max}', unit: 'rpm', tol: { rel: 0.02 } },
      ],
      answer,
      steps: () => [
        { text: 'Convert the slew to radians.', tex: `\\theta_1 = ${theta1Deg}\\cdot\\pi/180`, value: { v: th1, unit: 'rad' } },
        { text: 'By symmetry half the angle is covered while accelerating.', tex: '\\frac{\\theta_1}{2} = \\frac{1}{2}\\frac{u^*}{I}t_s^2 \;\\Rightarrow\; t_s = \\sqrt{\\frac{I\\theta_1}{u^*}}', value: { v: ts, unit: 's' } },
        { text: 'Peak rate at the switch.', tex: '\\dot\\theta_{max} = \\frac{u^* t_s}{I}', value: { v: answer.rate, unit: 'deg/s' } },
        { text: 'Total momentum stays zero, so the wheel holds the opposite momentum.', tex: 'I_w\\omega_w = -I\\dot\\theta \;\\Rightarrow\; |\\omega_w| = \\frac{I\\dot\\theta_{max}}{I_w}\\cdot\\frac{60}{2\\pi}', value: { v: answer.rpm, unit: 'rpm' } },
      ],
      toSim: () => ({ ...clean, mode: 'bangbang', I, Iw, theta1Deg, uMax: u }),
    });
  },
};

// ---------------------------------------------------------------- 5. inertia error
const inertiaError: Gen = {
  id: 'c02-inertia-error',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Inertia error, open loop',
  difficulty: 1,
  generate(rng) {
    const I = rng.nice(20, 120, 5);
    const e = rng.pick([-0.25, -0.2, -0.15, -0.1, 0.1, 0.15, 0.2, 0.25, 0.3]);
    const Ia = I * (1 + e);
    const theta1Deg = rng.nice(20, 90, 5);
    const u = rng.nice(0.05, 0.3, 0.01);
    const thf = (theta1Deg * I) / Ia;
    const answer = { thf, err: theta1Deg - thf };
    return computeProblem<RWParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt:
        'A bang-bang slew is planned with the nominal inertia, but the real spacecraft inertia is different (propellant mass, deployed hardware). Where does it actually stop, and what is the pointing error $\\theta_1 - \\theta_f$?',
      given: [
        { label: 'Nominal inertia (used for the plan)', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'True inertia', tex: 'I_a', value: sf(Ia, 4), unit: 'kg m²' },
        { label: 'Commanded slew', tex: '\\theta_1', value: theta1Deg, unit: 'deg' },
        { label: 'Wheel torque', tex: 'u^*', value: u, unit: 'N m' },
      ],
      fields: [
        { key: 'thf', label: 'Final angle', tex: '\\theta_f', unit: 'deg', tol: { rel: 0.01, abs: 0.05 } },
        { key: 'err', label: 'Pointing error', tex: '\\theta_1 - \\theta_f', unit: 'deg', tol: { rel: 0.02, abs: 0.05 } },
      ],
      answer,
      steps: () => [
        { text: 'The switch time comes from the nominal inertia.', tex: 't_s = \\sqrt{I\\theta_1/u^*}' },
        { text: 'The real body accelerates at u*/Ia. Accel and brake phases are still symmetric, so the rate still ends at zero.', tex: '\\theta_f = 2\\cdot\\frac{1}{2}\\frac{u^*}{I_a}t_s^2 = \\frac{I}{I_a}\\theta_1 = \\frac{\\theta_1}{1+e}', value: { v: thf, unit: 'deg' } },
        { text: 'Error. Open loop has no way to notice it.', tex: '\\theta_1 - \\theta_f', value: { v: answer.err, unit: 'deg' } },
      ],
      toSim: () => ({ ...clean, mode: 'bangbang', I, inertiaErr: e, theta1Deg, uMax: u }),
    });
  },
};

// ---------------------------------------------------------------- 6. disturbance steady-state error
const disturbance: Gen = {
  id: 'c02-disturbance',
  moduleId: MOD,
  topic: 'feedback-basics',
  title: 'Disturbance steady-state error',
  difficulty: 2,
  generate(rng) {
    const I = rng.nice(20, 120, 5);
    const wn = rng.nice(0.05, 0.25, 0.01);
    const z = rng.nice(0.5, 0.9, 0.05);
    const Kp = sf(I * wn * wn);
    const KD = sf(2 * z * wn * I);
    const d = rng.nice(0.0005, 0.005, 0.0005) * (rng.next() < 0.5 ? -1 : 1);
    const offset = rad2deg(d / Kp);
    const eps = sf(Math.abs(offset) * rng.uniform(0.2, 0.6), 2);
    const KpMin = Math.abs(d) / deg2rad(eps);
    const answer = { offset, KpMin };
    return computeProblem<RWParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt:
        'A constant disturbance torque $d$ (solar pressure, gravity gradient) acts on the PD controlled spacecraft: $I\\ddot\\theta = u + d$. Find the steady-state offset $\\theta_{ss} - \\theta_1$ (signed), then the smallest $K_p$ that keeps $|\\theta_{ss} - \\theta_1| \\le \\varepsilon$.',
      given: [
        { label: 'Inertia', tex: 'I', value: I, unit: 'kg m²' },
        { label: 'Proportional gain', tex: 'K_p', value: Kp, unit: 'N m/rad' },
        { label: 'Derivative gain', tex: 'K_D', value: KD, unit: 'N m s/rad' },
        { label: 'Disturbance torque', tex: 'd', value: d, unit: 'N m' },
        { label: 'Allowed error', tex: '\\varepsilon', value: eps, unit: 'deg' },
      ],
      fields: [
        { key: 'offset', label: 'Steady-state offset', tex: '\\theta_{ss} - \\theta_1', unit: 'deg', tol: { rel: 0.02 } },
        { key: 'KpMin', label: 'Minimum gain', tex: 'K_{p,min}', unit: 'N m/rad', tol: { rel: 0.02 } },
      ],
      answer,
      steps: () => [
        { text: 'At steady state the rate and acceleration are zero, so the controller torque cancels the disturbance.', tex: '0 = K_p(\\theta_1 - \\theta_{ss}) + d' },
        { text: 'Solve for the offset and convert to degrees. KD does not matter here.', tex: '\\theta_{ss} - \\theta_1 = \\frac{d}{K_p}', value: { v: offset, unit: 'deg' } },
        { text: 'Require the offset to fit in the allowed error (in radians).', tex: 'K_p \\ge \\frac{|d|}{\\varepsilon}', value: { v: KpMin, unit: 'N m/rad' } },
      ],
      toSim: () => ({ ...clean, mode: 'pd', I, Kp, KD, dist: d, theta1Deg: 30 }),
    });
  },
};

export const PROBLEMS: Gen[] = [readGains, designWnZeta, meetSpec, bangPlan, inertiaError, disturbance];

/** For tests and debugging: generate a specific instance. */
export const instance = (g: Gen, seed: number) => g.generate(makeRng(seed));
