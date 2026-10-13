/**
 * C-1 practice problems, in the style of HW C-1: second order free response,
 * eigenvalues, and linearizing equations of motion about an equilibrium.
 */
import { makeRng } from '../../core/rng';
import { deg2rad } from '../../core/units';
import { computeProblem, sf } from '../../engine/compute';
import type { ProblemGenerator, ProblemInstance } from '../../engine/types';
import { DEFAULTS, type LSParams, freeResponse, settleTime, simulate } from './model';

const MOD = 'c01-linear-systems';
const G = 9.81;
type Gen = ProblemGenerator<LSParams>;
const base: Partial<LSParams> = { negStiffness: false, visual: 'msd', m: 1 };

// ---------------------------------------------------------------- 1. m, c, k to wn, zeta, wd
const msdParams: Gen = {
  id: 'c01-msd-params',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Mass-spring-damper parameters',
  difficulty: 1,
  generate(rng) {
    const m = rng.nice(0.5, 10, 0.5);
    const k = rng.nice(5, 400, 5);
    const zeta0 = rng.nice(0.05, 0.8, 0.05);
    const c = sf(2 * zeta0 * Math.sqrt(k * m));
    const wn = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return computeProblem<LSParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt: 'A mass on a spring and damper obeys $m\\ddot x + c\\dot x + kx = 0$. Find the natural frequency, the damping ratio, and the damped frequency.',
      given: [
        { label: 'Mass', tex: 'm', value: m, unit: 'kg' },
        { label: 'Damping', tex: 'c', value: c, unit: 'N s/m' },
        { label: 'Stiffness', tex: 'k', value: k, unit: 'N/m' },
      ],
      fields: [
        { key: 'wn', label: 'Natural frequency', tex: '\\omega_n', unit: 'rad/s', tol: { rel: 0.01 } },
        { key: 'zeta', label: 'Damping ratio', tex: '\\zeta', unit: '', tol: { rel: 0.01 } },
        { key: 'wd', label: 'Damped frequency', tex: '\\omega_d', unit: 'rad/s', tol: { rel: 0.01 } },
      ],
      answer: { wn, zeta, wd },
      steps: () => [
        { text: 'Divide by m to get the standard form.', tex: '\\ddot x + \\frac{c}{m}\\dot x + \\frac{k}{m}x = 0 \\;=\\; \\ddot x + 2\\zeta\\omega_n\\dot x + \\omega_n^2 x' },
        { text: 'Natural frequency.', tex: '\\omega_n = \\sqrt{k/m}', value: { v: wn, unit: 'rad/s' } },
        { text: 'Damping ratio.', tex: '\\zeta = \\frac{c}{2\\sqrt{km}}', value: { v: zeta, unit: '' } },
        { text: 'Damped frequency (the actual oscillation frequency).', tex: '\\omega_d = \\omega_n\\sqrt{1-\\zeta^2}', value: { v: wd, unit: 'rad/s' } },
      ],
      toSim: () => ({ ...base, zeta, wn, m, x0: 1, v0: 0 }),
    });
  },
};

// ---------------------------------------------------------------- 2. eigenvalues of A
const eigs: Gen = {
  id: 'c01-eigs',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Eigenvalues of the state matrix',
  difficulty: 1,
  generate(rng) {
    const complexCase = rng.next() < 0.5;
    let a0: number;
    let a1: number;
    if (complexCase) {
      const sig = rng.nice(0.2, 3, 0.1);
      const w = rng.nice(0.5, 6, 0.1);
      a1 = sf(2 * sig, 4);
      a0 = sf(sig * sig + w * w, 4);
    } else {
      const l1 = -rng.nice(0.2, 3, 0.1);
      const l2 = l1 - rng.nice(0.5, 5, 0.1);
      a1 = sf(-(l1 + l2), 4);
      a0 = sf(l1 * l2, 4);
    }
    const disc = a1 * a1 - 4 * a0;
    const answer = complexCase || disc < 0 ? { re: -a1 / 2, im: Math.sqrt(Math.max(0, -disc)) / 2 } : { re: (-a1 + Math.sqrt(disc)) / 2, im: (-a1 - Math.sqrt(disc)) / 2 };
    const isComplex = disc < 0;
    const fields = isComplex
      ? [
          { key: 're', label: 'Real part', tex: '\\sigma', unit: '1/s', tol: { rel: 0.01, abs: 0.005 } },
          { key: 'im', label: 'Imaginary part (positive)', tex: '\\omega', unit: 'rad/s', tol: { rel: 0.01, abs: 0.005 } },
        ]
      : [
          { key: 're', label: 'Larger eigenvalue', tex: '\\lambda_1', unit: '1/s', tol: { rel: 0.01, abs: 0.005 } },
          { key: 'im', label: 'Smaller eigenvalue', tex: '\\lambda_2', unit: '1/s', tol: { rel: 0.01, abs: 0.005 } },
        ];
    const wn = Math.sqrt(a0);
    const zeta = a1 / (2 * wn);
    return computeProblem<LSParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt: isComplex
        ? `Write $\\ddot x + ${a1}\\dot x + ${a0}x = 0$ as $\\dot{\\mathbf x} = A\\mathbf x$ with $\\mathbf x = [x,\\ \\dot x]^T$. The eigenvalues of A are a complex pair $\\sigma \\pm j\\omega$. Find them.`
        : `Write $\\ddot x + ${a1}\\dot x + ${a0}x = 0$ as $\\dot{\\mathbf x} = A\\mathbf x$ with $\\mathbf x = [x,\\ \\dot x]^T$. Find the two (real) eigenvalues of A.`,
      given: [],
      fields,
      answer,
      steps: () => [
        { text: 'State matrix in companion form.', tex: `A = \\begin{bmatrix} 0 & 1 \\\\ -${a0} & -${a1} \\end{bmatrix}` },
        { text: 'Eigenvalues solve det(lambda I - A) = 0, which is the characteristic equation of the ODE.', tex: `\\lambda^2 + ${a1}\\lambda + ${a0} = 0` },
        { text: 'Quadratic formula.', tex: `\\lambda = \\frac{-${a1} \\pm \\sqrt{${a1}^2 - 4(${a0})}}{2}` },
        isComplex
          ? { text: 'Negative discriminant, so a complex pair.', tex: `\\lambda = ${sf(answer.re, 4)} \\pm ${sf(answer.im, 4)}j` }
          : { text: 'Positive discriminant, so two real eigenvalues.', tex: `\\lambda_1 = ${sf(answer.re, 4)},\\quad \\lambda_2 = ${sf(answer.im, 4)}` },
      ],
      toSim: () => ({ ...base, wn, zeta, x0: 1, v0: 0 }),
    });
  },
};

// ---------------------------------------------------------------- 3. free response at a time
const freeAt: Gen = {
  id: 'c01-free-response',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Free response at a time',
  difficulty: 2,
  generate(rng) {
    const wn = rng.nice(0.5, 4, 0.5);
    const zeta = rng.nice(0.05, 0.6, 0.05);
    const x0 = rng.nice(-2, 2, 0.5) || 1;
    const v0 = rng.nice(-3, 3, 0.5);
    const t1 = sf(rng.uniform(0.3, 3) * ((2 * Math.PI) / wn) * 0.5, 2);
    const p = { ...DEFAULTS, ...base, wn, zeta, x0, v0 };
    const [x1] = freeResponse(p, t1);
    const sig = zeta * wn;
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const B = (v0 + sig * x0) / wd;
    return computeProblem<LSParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt: `An underdamped system $\\ddot x + 2\\zeta\\omega_n\\dot x + \\omega_n^2 x = 0$ starts at $x(0) = x_0$, $\\dot x(0) = v_0$. Find $x(t_1)$.`,
      given: [
        { label: 'Natural frequency', tex: '\\omega_n', value: wn, unit: 'rad/s' },
        { label: 'Damping ratio', tex: '\\zeta', value: zeta, unit: '' },
        { label: 'Initial position', tex: 'x_0', value: x0, unit: 'm' },
        { label: 'Initial velocity', tex: 'v_0', value: v0, unit: 'm/s' },
        { label: 'Time', tex: 't_1', value: t1, unit: 's' },
      ],
      fields: [{ key: 'x', label: 'Position', tex: 'x(t_1)', unit: 'm', tol: { rel: 0.02, abs: 0.005 } }],
      answer: { x: x1 },
      steps: () => [
        { text: 'Complex roots give a decaying sinusoid.', tex: 'x(t) = e^{-\\zeta\\omega_n t}\\left(A\\cos\\omega_d t + B\\sin\\omega_d t\\right)' },
        { text: 'Decay rate and damped frequency.', tex: `\\zeta\\omega_n = ${sf(sig, 4)},\\quad \\omega_d = \\omega_n\\sqrt{1-\\zeta^2} = ${sf(wd, 4)}` },
        { text: 'x(0) gives A directly.', tex: `A = x_0 = ${x0}` },
        { text: 'Differentiate and set t = 0 for B.', tex: 'B = \\frac{v_0 + \\zeta\\omega_n x_0}{\\omega_d}', value: { v: B, unit: 'm' } },
        { text: 'Evaluate at t1 (radians in the trig functions).', tex: `x(${t1}) = e^{-${sf(sig, 4)}\\cdot ${t1}}\\left(${x0}\\cos(${sf(wd * t1, 4)}) + ${sf(B, 4)}\\sin(${sf(wd * t1, 4)})\\right)`, value: { v: x1, unit: 'm' } },
      ],
      toSim: () => ({ ...base, wn, zeta, x0, v0 }),
    });
  },
};

// ---------------------------------------------------------------- 4. linearize a pendulum
const linearize: Gen = {
  id: 'c01-linearize',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Linearize a pendulum',
  difficulty: 2,
  generate(rng) {
    const m = rng.nice(0.2, 3, 0.1);
    const L = rng.nice(0.2, 2, 0.1);
    const c = sf(rng.uniform(0.02, 0.4) * m * L * L * Math.sqrt(G / L), 2);
    const inverted = rng.next() < 0.5;
    const J = m * L * L;
    const wn = Math.sqrt(G / L);
    const zeta = c / (2 * J * wn);
    const a = c / J;
    const lamPlus = (-a + Math.sqrt(a * a + (4 * G) / L)) / 2;
    const common = {
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      given: [
        { label: 'Mass', tex: 'm', value: m, unit: 'kg' },
        { label: 'Rod length', tex: 'L', value: L, unit: 'm' },
        { label: 'Pivot damping', tex: 'c', value: c, unit: 'N m s/rad' },
        { label: 'Gravity', tex: 'g', value: G, unit: 'm/s²' },
      ],
    };
    if (!inverted)
      return computeProblem<LSParams>({
        ...common,
        prompt:
          'A point mass on a massless rod swings about a pivot with viscous damping: $mL^2\\ddot\\theta + c\\dot\\theta + mgL\\sin\\theta = 0$. Linearize about the hanging equilibrium $\\theta = 0$ and find $\\omega_n$ and $\\zeta$.',
        fields: [
          { key: 'wn', label: 'Natural frequency', tex: '\\omega_n', unit: 'rad/s', tol: { rel: 0.01 } },
          { key: 'zeta', label: 'Damping ratio', tex: '\\zeta', unit: '', tol: { rel: 0.02 } },
        ],
        answer: { wn, zeta },
        steps: () => [
          { text: 'Small angle about 0: sin(theta) is about delta theta.', tex: 'mL^2\\,\\delta\\ddot\\theta + c\\,\\delta\\dot\\theta + mgL\\,\\delta\\theta = 0' },
          { text: 'Divide by mL^2.', tex: '\\delta\\ddot\\theta + \\frac{c}{mL^2}\\delta\\dot\\theta + \\frac{g}{L}\\delta\\theta = 0' },
          { text: 'Match the stiffness term.', tex: '\\omega_n = \\sqrt{g/L}', value: { v: wn, unit: 'rad/s' } },
          { text: 'Match the damping term.', tex: '\\zeta = \\frac{c}{2mL^2\\omega_n}', value: { v: zeta, unit: '' } },
        ],
        toSim: () => ({ ...base, visual: 'pendulum', wn, zeta, x0: deg2rad(10), v0: 0 }),
      });
    return computeProblem<LSParams>({
      ...common,
      prompt:
        'Same pendulum, $mL^2\\ddot\\theta + c\\dot\\theta + mgL\\sin\\theta = 0$, but linearize about the inverted equilibrium $\\theta = \\pi$. Find the positive (unstable) eigenvalue of the linearized system and its time constant $1/\\lambda$.',
      fields: [
        { key: 'lam', label: 'Unstable eigenvalue', tex: '\\lambda_+', unit: '1/s', tol: { rel: 0.01 } },
        { key: 'tau', label: 'Time constant', tex: '1/\\lambda_+', unit: 's', tol: { rel: 0.01 } },
      ],
      answer: { lam: lamPlus, tau: 1 / lamPlus },
      steps: () => [
        { text: 'Let theta = pi + delta theta. Then sin(pi + delta theta) = -sin(delta theta), about -delta theta.', tex: 'mL^2\\,\\delta\\ddot\\theta + c\\,\\delta\\dot\\theta - mgL\\,\\delta\\theta = 0' },
        { text: 'The stiffness flipped sign. Characteristic equation:', tex: '\\lambda^2 + \\frac{c}{mL^2}\\lambda - \\frac{g}{L} = 0' },
        { text: 'One root is always positive (the product of the roots is negative).', tex: '\\lambda_+ = \\frac{-\\frac{c}{mL^2} + \\sqrt{\\left(\\frac{c}{mL^2}\\right)^2 + \\frac{4g}{L}}}{2}', value: { v: lamPlus, unit: '1/s' } },
        { text: 'Time constant: how long for a small tilt to grow by a factor of e.', tex: '\\tau = 1/\\lambda_+', value: { v: 1 / lamPlus, unit: 's' } },
      ],
      toSim: () => ({ ...base, visual: 'pendulum', negStiffness: true, wn, zeta, x0: deg2rad(2), v0: 0 }),
    });
  },
};

// ---------------------------------------------------------------- 5. time constants from eigenvalues
const timescales: Gen = {
  id: 'c01-timescales',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Envelope and period',
  difficulty: 1,
  generate(rng) {
    const sig = rng.nice(0.1, 2, 0.05);
    const w = rng.nice(0.5, 8, 0.1);
    const Td = (2 * Math.PI) / w;
    const ts = 4 / sig;
    const wn = Math.hypot(sig, w);
    const zeta = sig / wn;
    return computeProblem<LSParams>({
      generatorId: this.id,
      seed: rng.seed,
      title: this.title,
      prompt: `A free response has eigenvalues $\\lambda = -${sig} \\pm ${w}j$. Find the damped period, the time for the envelope to shrink to 2% of its start, and the damping ratio.`,
      given: [],
      fields: [
        { key: 'Td', label: 'Damped period', tex: 'T_d', unit: 's', tol: { rel: 0.01 } },
        { key: 'ts', label: '2% envelope time', tex: 't_s', unit: 's', tol: { rel: 0.03 } },
        { key: 'zeta', label: 'Damping ratio', tex: '\\zeta', unit: '', tol: { rel: 0.01 } },
      ],
      answer: { Td, ts, zeta },
      steps: () => [
        { text: 'The imaginary part is the damped frequency.', tex: `T_d = \\frac{2\\pi}{\\omega_d} = \\frac{2\\pi}{${w}}`, value: { v: Td, unit: 's' } },
        { text: 'The envelope is e^{-sigma t}. It hits 2% when sigma t = ln 50, about 3.9, usually rounded to 4.', tex: `t_s \\approx \\frac{4}{\\sigma} = \\frac{4}{${sig}}`, value: { v: ts, unit: 's' } },
        { text: 'Distance from the origin is wn, and sigma = zeta wn.', tex: `\\omega_n = \\sqrt{\\sigma^2 + \\omega_d^2},\\quad \\zeta = \\sigma/\\omega_n`, value: { v: zeta, unit: '' } },
      ],
      toSim: () => ({ ...base, wn, zeta, x0: 1, v0: 0 }),
    });
  },
};

// ---------------------------------------------------------------- 6. choose damping (design, judged by the sim)
const chooseDamping: Gen = {
  id: 'c01-choose-damping',
  moduleId: MOD,
  topic: 'linear-systems',
  title: 'Choose the damper',
  difficulty: 2,
  generate(rng) {
    const m = rng.nice(0.5, 5, 0.5);
    const k = rng.nice(10, 300, 10);
    const wn = Math.sqrt(k / m);
    const zRef = rng.nice(0.35, 0.75, 0.05);
    const x0 = rng.nice(0.05, 0.5, 0.05);
    const overPct = Math.ceil(100 * Math.exp((-Math.PI * zRef) / Math.sqrt(1 - zRef * zRef)) + 2);
    const refRun = simulate({ ...DEFAULTS, ...base, wn, zeta: zRef, x0, v0: 0 }, 40 / (zRef * wn), 4000);
    const tSpec = sf(1.25 * settleTime(refRun, x0), 2);
    const cRef = sf(2 * zRef * Math.sqrt(k * m), 3);

    const judge = (input: Record<string, number>) => {
      const c = input.c;
      if (!Number.isFinite(c) || c < 0)
        return { pass: false, perField: { c: { pass: false, missing: !Number.isFinite(c) } }, simEvidence: { specs: [], note: 'Damping has to be a non-negative number.' } };
      const zeta = c / (2 * Math.sqrt(k * m));
      const run = simulate({ ...DEFAULTS, ...base, wn, zeta, x0, v0: 0 }, Math.max(4 * tSpec, 20 / wn), 4000);
      const minX = Math.min(...run.x);
      const under = Math.max(0, (-100 * minX) / x0);
      const ts = settleTime(run, x0);
      const specs = [
        { label: 'Swing past zero', limit: `<= ${overPct} %`, measured: under, unit: '%', pass: under <= overPct },
        { label: 'Inside 2% by', limit: `<= ${tSpec} s`, measured: ts, unit: 's', pass: ts <= tSpec },
      ];
      const pass = specs.every((s) => s.pass);
      return { pass, perField: { c: { pass } }, simEvidence: { specs } };
    };
    const inst: ProblemInstance<LSParams> = {
      generatorId: this.id,
      seed: rng.seed,
      kind: 'design',
      title: this.title,
      prompt: `A ${m} kg mass on a ${k} N/m spring is pulled to $x_0$ and released from rest. Pick a damper c so it swings past zero by at most ${overPct}% of $x_0$, and stays within 2% of zero after ${tSpec} s. The sim checks your c, so any value that meets both passes.`,
      given: [
        { label: 'Mass', tex: 'm', value: m, unit: 'kg' },
        { label: 'Stiffness', tex: 'k', value: k, unit: 'N/m' },
        { label: 'Release point', tex: 'x_0', value: x0, unit: 'm' },
        { label: 'Max swing past zero', value: overPct, unit: '%' },
        { label: 'Settle by', tex: 't_s', value: tSpec, unit: 's' },
      ],
      fields: [{ key: 'c', label: 'Damping', tex: 'c', unit: 'N s/m', tol: {} }],
      solve: () => ({ c: cRef }),
      steps: () => {
        const L = Math.log(overPct / 100);
        const zMin = -L / Math.sqrt(Math.PI * Math.PI + L * L);
        return [
          { text: 'Released from rest, the first swing past zero is the same formula as step overshoot.', tex: '\\frac{|x_{min}|}{x_0} = e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}} \\;\\Rightarrow\\; \\zeta \\ge \\frac{-\\ln(p)}{\\sqrt{\\pi^2 + \\ln^2 p}}', value: { v: zMin, unit: '' } },
          { text: 'Settling: the envelope estimate 4/(zeta wn) should come in under the limit. Too much damping is also bad, an overdamped mass creeps in slowly.', tex: `\\omega_n = \\sqrt{k/m} = ${sf(wn, 4)}\\ \\text{rad/s}` },
          { text: `Pick something in between, for example zeta = ${zRef}.`, tex: 'c = 2\\zeta\\sqrt{km}', value: { v: cRef, unit: 'N s/m' } },
          { text: 'Load it into the sim to check both specs.' },
        ];
      },
      check: judge,
      toSim: (input) => ({
        ...base,
        m,
        wn,
        x0,
        v0: 0,
        ...(Number.isFinite(input?.c) && input!.c >= 0 ? { zeta: input!.c / (2 * Math.sqrt(k * m)) } : {}),
      }),
    };
    return inst;
  },
};

export const PROBLEMS: Gen[] = [msdParams, eigs, freeAt, linearize, timescales, chooseDamping];
export const instance = (g: Gen, seed: number) => g.generate(makeRng(seed));
