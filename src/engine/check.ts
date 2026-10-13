import type { AnswerField, CheckResult, FieldHint, Tolerance } from './types';

export function withinTol(x: number, ref: number, tol: Tolerance): boolean {
  if (!Number.isFinite(x)) return false;
  const lim = Math.max(tol.abs ?? 0, (tol.rel ?? 0) * Math.abs(ref));
  return Math.abs(x - ref) <= lim;
}

/** Common slips worth pointing out without giving the answer away. */
export function diagnose(x: number, ref: number, tol: Tolerance): FieldHint {
  const near = (v: number) => withinTol(v, ref, { rel: Math.max(tol.rel ?? 0, 0.01), abs: tol.abs });
  if (ref !== 0 && near(-x)) return 'sign';
  if (near(2 * x) || near(x / 2)) return 'factor-2';
  if (near((x * Math.PI) / 180) || near((x * 180) / Math.PI)) return 'deg-rad';
  return 'off';
}

/** Tolerance check of every field against a reference answer. */
export function checkFields(fields: AnswerField[], input: Record<string, number>, ref: Record<string, number>): CheckResult {
  const perField: CheckResult['perField'] = {};
  let pass = true;
  for (const f of fields) {
    const x = input[f.key];
    if (x === undefined || !Number.isFinite(x)) {
      perField[f.key] = { pass: false, missing: true };
      pass = false;
      continue;
    }
    const ok = withinTol(x, ref[f.key], f.tol);
    perField[f.key] = ok ? { pass: true } : { pass: false, hint: diagnose(x, ref[f.key], f.tol) };
    pass &&= ok;
  }
  return { pass, perField };
}

export const HINT_TEXT: Record<FieldHint, string> = {
  sign: 'Right size, wrong sign.',
  'factor-2': 'Off by a factor of 2.',
  'deg-rad': 'Looks like a degrees / radians mix-up.',
  off: 'Not within tolerance.',
};
