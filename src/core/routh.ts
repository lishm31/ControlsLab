/**
 * Routh-Hurwitz array with the two textbook special cases:
 *  1. a zero in the first column (replace it by a small epsilon and keep going),
 *  2. an entire row of zeros (use the derivative of the auxiliary polynomial from the row above).
 */
import { type Poly, ptrim } from './poly';

export type RouthEvent =
  | { kind: 'epsilon'; row: number; power: number }
  | { kind: 'zero-row'; row: number; power: number; auxiliary: Poly };

export interface RouthResult {
  rows: number[][]; // rows[i] belongs to s^(n - i)
  powers: number[];
  firstColumn: number[];
  signChanges: number; // = number of RHP roots
  events: RouthEvent[];
  verdict: 'stable' | 'marginal' | 'unstable';
}

export function routh(p: Poly, epsilon = 1e-9): RouthResult {
  const a = ptrim(p);
  const n = a.length - 1;
  if (n < 1) throw new Error('routh: need degree >= 1');
  const width = Math.floor(n / 2) + 1;
  const rows: number[][] = [];
  const r0 = new Array(width).fill(0);
  const r1 = new Array(width).fill(0);
  a.forEach((c, i) => (i % 2 === 0 ? (r0[i / 2] = c) : (r1[(i - 1) / 2] = c)));
  rows.push(r0, r1);
  const scale = Math.max(...a.map(Math.abs));
  const eps = epsilon * scale;
  const tiny = 1e-12 * scale;
  const events: RouthEvent[] = [];

  const fixRow = (i: number) => {
    const row = rows[i];
    const power = n - i;
    if (row.every((v) => Math.abs(v) <= tiny)) {
      // Row of zeros: auxiliary polynomial from the row above, A(s) = sum prev[k] s^(power+1-2k).
      const prev = rows[i - 1];
      const pa = power + 1;
      const aux: Poly = new Array(pa + 1).fill(0);
      prev.forEach((c, k) => {
        if (pa - 2 * k >= 0) aux[2 * k] = c;
      });
      // Derivative coefficients go into this row.
      for (let k = 0; k < row.length; k++) row[k] = pa - 2 * k >= 1 ? prev[k] * (pa - 2 * k) : 0;
      events.push({ kind: 'zero-row', row: i, power, auxiliary: aux });
    }
    if (Math.abs(row[0]) <= tiny) {
      row[0] = eps;
      events.push({ kind: 'epsilon', row: i, power });
    }
  };

  if (n >= 1) fixRow(1);
  for (let i = 2; i <= n; i++) {
    const up = rows[i - 2];
    const mid = rows[i - 1];
    const row = new Array(width).fill(0);
    for (let j = 0; j < width - 1; j++) row[j] = (mid[0] * up[j + 1] - up[0] * mid[j + 1]) / mid[0];
    rows.push(row);
    fixRow(i);
  }
  const firstColumn = rows.map((r) => r[0]);
  let signChanges = 0;
  for (let i = 1; i < firstColumn.length; i++) if (Math.sign(firstColumn[i]) !== Math.sign(firstColumn[i - 1])) signChanges++;
  const hasZeroRow = events.some((e) => e.kind === 'zero-row');
  const hasEps = events.some((e) => e.kind === 'epsilon');
  const verdict = signChanges > 0 ? 'unstable' : hasZeroRow || hasEps ? 'marginal' : 'stable';
  return { rows, powers: rows.map((_, i) => n - i), firstColumn, signChanges, events, verdict };
}
