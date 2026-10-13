/** Number formatting for readouts. Uses a real minus sign so columns line up in mono. */
const MINUS = '−';

export function fix(x: number, d = 2): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '---' : x > 0 ? 'inf' : `${MINUS}inf`;
  const s = (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Significant figures without exponent notation for everyday magnitudes. */
export function sig(x: number, n = 4): string {
  if (!Number.isFinite(x)) return fix(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-4) return x.toExponential(n - 1).replace('-', MINUS);
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
  return fix(x, Math.min(d, 8));
}

/** Signed with an explicit plus, for telemetry deltas. */
export const signed = (x: number, d = 2) => (x > 0 ? '+' : '') + fix(x, d);
