/** Linear scales and "nice" ticks for the SVG plot system. */
export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  invert(px: number): number;
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain;
  f.range = range;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  return f;
}

export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  return (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1) * mag;
}

export function ticks(a: number, b: number, count = 5): number[] {
  if (!(b > a)) return [a];
  const step = niceStep(b - a, count);
  const out: number[] = [];
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Expand a data extent to nice tick boundaries with optional padding. */
export function niceDomain(lo: number, hi: number, count = 5, pad = 0.05): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-12) {
    const d = Math.abs(hi) * 0.1 || 1;
    lo -= d;
    hi += d;
  }
  const span = hi - lo;
  lo -= span * pad;
  hi += span * pad;
  const step = niceStep(hi - lo, count);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export function tickLabel(v: number, step: number): string {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = v.toFixed(Math.min(d, 6));
  return s.startsWith('-') && Number(s) !== 0 ? '−' + s.slice(1) : s.replace(/^-/, '');
}

/** Index of the sample nearest to x in a sorted array. */
export function nearestIndex(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

/**
 * Min/max decimation per pixel column so long series render fast without losing
 * peaks (overshoot must never get smoothed away).
 */
export function decimate(t: number[], y: number[], sx: Scale, sy: Scale): string {
  const n = t.length;
  if (n === 0) return '';
  const pts: string[] = [];
  const px = (i: number) => `${sx(t[i]).toFixed(1)},${sy(y[i]).toFixed(1)}`;
  const width = Math.abs(sx.range[1] - sx.range[0]);
  if (n <= width * 2) {
    for (let i = 0; i < n; i++) if (Number.isFinite(y[i])) pts.push(px(i));
    return 'M' + pts.join('L');
  }
  let col = Math.floor(sx(t[0]));
  let iMin = 0;
  let iMax = 0;
  let iFirst = 0;
  const flush = (iLast: number) => {
    const idx = [iFirst, iMin, iMax, iLast].filter((v, k, a) => a.indexOf(v) === k).sort((a, b) => a - b);
    for (const i of idx) if (Number.isFinite(y[i])) pts.push(px(i));
  };
  for (let i = 1; i < n; i++) {
    const c = Math.floor(sx(t[i]));
    if (c !== col) {
      flush(i - 1);
      col = c;
      iFirst = iMin = iMax = i;
    } else {
      if (y[i] < y[iMin]) iMin = i;
      if (y[i] > y[iMax]) iMax = i;
    }
  }
  flush(n - 1);
  return 'M' + pts.join('L');
}
