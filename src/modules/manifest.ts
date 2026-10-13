import type { ModuleDefinition, ModuleManifest } from './types';

const m = (x: ModuleManifest) => x;

export const MODULES: ModuleManifest[] = [
  m({ id: 'c01-linear-systems', code: 'C-1', title: 'Linear Systems Explorer', lecture: 'Linear dynamical systems and solutions', lectureDate: '2026-10-13', topics: ['linear-systems'], status: 'planned', blurb: 'Second order free response, phase portrait, eigenvalues in the plane.' }),
  m({ id: 'c02-reaction-wheel', code: 'C-2', title: 'Reaction Wheel Slew', lecture: 'Feedback control basics', lectureDate: '2026-10-15', topics: ['feedback-basics'], status: 'live', blurb: 'Single axis slew. Open loop bang-bang vs PD, inertia error, disturbance torque.' }),
  m({ id: 'c03-laplace', code: 'C-3', title: 'Laplace Workbench', lecture: 'Laplace transforms', lectureDate: '2026-10-20', topics: ['laplace'], status: 'planned', blurb: 'ODE to s-domain, partial fractions step by step, pole location to time response.' }),
  m({ id: 'c04-block-diagrams', code: 'C-4', title: 'Block Diagram Builder', lecture: 'Block diagrams', lectureDate: '2026-10-22', topics: ['block-diagrams'], status: 'planned', blurb: 'Series, parallel, feedback. Reduce to one TF with the steps shown.' }),
  m({ id: 'c05-transfer-functions', code: 'C-5', title: 'Transfer Function Lab', lecture: 'Transfer functions', lectureDate: '2026-10-27', topics: ['transfer-functions'], status: 'planned', blurb: 'Editable pole-zero map with step and impulse responses.' }),
  m({ id: 'c06-stability', code: 'C-6', title: 'Stability Arena', lecture: 'Dynamical stability', lectureDate: '2026-10-29', topics: ['stability'], status: 'planned', blurb: 'Routh arrays, gain sweeps, and a break-it mode with replay.' }),
  m({ id: 'c07-spec-meter', code: 'C-7', title: 'Spec Meter', lecture: 'Dynamical response characterization', lectureDate: '2026-11-03', topics: ['response-specs'], status: 'planned', blurb: 'Rise, peak, settling, overshoot, steady-state error measured against spec boxes.' }),
  m({ id: 'c08-design', code: 'C-8', title: 'Design Challenges', lecture: 'Feedback design', lectureDate: '2026-11-05', topics: ['feedback-design'], status: 'planned', blurb: 'Hit specs by tuning gains. Drag poles and watch the response.' }),
  m({ id: 'c09-spacecraft', code: 'C-9', title: 'Spacecraft Attitude Lab', lecture: 'Control design, spacecraft', lectureDate: '2026-11-10', topics: ['spacecraft-attitude'], status: 'planned', blurb: 'Wheels and thrusters, noise, saturation, delay, disturbances.' }),
  m({ id: 'c10-quadrotor', code: 'C-10', title: 'Quadrotor Lab', lecture: 'Control design, quadrotors', lectureDate: '2026-11-12', topics: ['quadrotor'], status: 'planned', blurb: 'Cascaded pitch control, then linear vs nonlinear 12 state comparison.' }),
  m({ id: 'c11-state-space', code: 'C-11', title: 'State Space Studio', lecture: 'State space formulations', lectureDate: '2026-11-17', topics: ['state-space'], status: 'planned', blurb: 'Edit A, B, C, D. Eigenvalues are the poles. Controllability, pole placement.' }),
  m({ id: 'c12-exam', code: 'C-12', title: 'Exam Mode', lecture: 'Control exam', lectureDate: '2026-11-19', topics: [], status: 'planned', blurb: 'Timed, randomized, mixed topics with a weak topic breakdown.' }),
  m({ id: 'c13-tf-ss', code: 'C-13', title: 'TF to SS Converter', lecture: 'State space and classical control equivalence', lectureDate: '2026-12-01', topics: ['tf-ss-equivalence'], status: 'planned', blurb: 'Convert both ways and prove the responses overlay.' }),
  m({ id: 'c14-failures', code: 'C-14', title: 'Failure Replays', lecture: 'Mission failure case studies', lectureDate: '2026-12-03', topics: ['failures'], status: 'planned', blurb: 'Simplified reconstructions of real control failures. Find and fix the bug.' }),
];

/** Lazy loaders, one chunk per module, so Three.js only loads where it is used. */
export const LOADERS: Record<string, () => Promise<ModuleDefinition>> = {
  'c02-reaction-wheel': () => import('./c02-reaction-wheel').then((x) => x.default),
};

export const COURSE_DATES = [
  { date: '2026-10-23', label: 'HW C-1 due', kind: 'hw' as const },
  { date: '2026-10-30', label: 'HW C-2 due', kind: 'hw' as const },
  { date: '2026-11-06', label: 'HW C-3 due', kind: 'hw' as const },
  { date: '2026-11-13', label: 'HW C-4 due', kind: 'hw' as const },
  { date: '2026-12-04', label: 'HW C-5 due', kind: 'hw' as const },
  { date: '2026-12-08', label: 'Final exam, 4:30 to 7:00 pm', kind: 'exam' as const },
];
