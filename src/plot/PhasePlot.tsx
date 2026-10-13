import { memo, useMemo, type PointerEvent } from 'react';
import { linear, niceStep, tickLabel, ticks } from './scale';
import { useWidth } from './useSize';

interface Props {
  /** Linear 2D field x' = A x. */
  A: number[][];
  traj: { x: number[]; y: number[] };
  current?: [number, number];
  extent: number; // half-width of the square view, same units on both axes
  xLabel: string;
  yLabel: string;
  /** Real eigenvector directions to draw as invariant lines. */
  eigLines?: [number, number][];
  onPick?: (x: number, y: number) => void;
  height?: number;
  summary: string;
}

const M = { l: 44, r: 10, t: 10, b: 28 };

function PhaseImpl({ A, traj, current, extent, xLabel, yLabel, eigLines, onPick, height = 300, summary }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const W = Math.max(220, width);
  const H = height;
  const g = useMemo(() => {
    // Equal scaling so the geometry (spirals, eigen-directions) is not distorted.
    const pw = W - M.l - M.r;
    const ph = H - M.t - M.b;
    const ppu = Math.min(pw, ph) / (2 * extent);
    const xr = pw / 2 / ppu;
    const yr = ph / 2 / ppu;
    const cx = M.l + pw / 2;
    const cy = M.t + ph / 2;
    const sx = linear([-xr, xr], [cx - xr * ppu, cx + xr * ppu]);
    const sy = linear([-yr, yr], [cy + yr * ppu, cy - yr * ppu]);
    // Direction field: arrows normalized in screen space, length shows nothing (only direction).
    const arrows: string[] = [];
    const n = Math.max(9, Math.round(pw / 34));
    const stepPx = pw / n;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= Math.round(ph / stepPx); j++) {
        const px = M.l + i * stepPx;
        const py = M.t + j * stepPx;
        const x = sx.invert(px);
        const y = sy.invert(py);
        const dx = A[0][0] * x + A[0][1] * y;
        const dy = A[1][0] * x + A[1][1] * y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-12) continue;
        const ux = (dx / len) * stepPx * 0.32;
        const uy = (-dy / len) * stepPx * 0.32;
        arrows.push(`M${(px - ux).toFixed(1)} ${(py - uy).toFixed(1)}L${(px + ux).toFixed(1)} ${(py + uy).toFixed(1)}`);
        // small head
        const hx = px + ux;
        const hy = py + uy;
        const a = Math.atan2(uy, ux);
        arrows.push(
          `M${hx.toFixed(1)} ${hy.toFixed(1)}L${(hx - 4 * Math.cos(a - 0.5)).toFixed(1)} ${(hy - 4 * Math.sin(a - 0.5)).toFixed(1)}M${hx.toFixed(1)} ${hy.toFixed(1)}L${(hx - 4 * Math.cos(a + 0.5)).toFixed(1)} ${(hy - 4 * Math.sin(a + 0.5)).toFixed(1)}`,
        );
      }
    const step = niceStep(xr, 3);
    return { sx, sy, xr, yr, arrows: arrows.join(''), xt: ticks(-xr, xr, Math.max(4, Math.floor(W / 80))), yt: ticks(-yr, yr, 4), step };
  }, [A, extent, W, H]);
  const { sx, sy } = g;
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < traj.x.length; i++) {
      const x = traj.x[i];
      const y = traj.y[i];
      if (Math.abs(x) > g.xr * 4 || Math.abs(y) > g.yr * 4) break;
      pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
    }
    return pts.length ? 'M' + pts.join('L') : '';
  }, [traj, sx, sy, g.xr, g.yr]);

  const pick = (e: PointerEvent<SVGRectElement>) => {
    if (!onPick) return;
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    // Round to 3 significant figures. (Not via the display formatter: it uses a real minus sign.)
    const r3 = (v: number) => Number(v.toPrecision(3));
    onPick(r3(sx.invert(e.clientX - box.left)), r3(sy.invert(e.clientY - box.top)));
  };

  return (
    <div className="tplot" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Phase portrait. ${summary}`}>
        <defs>
          <clipPath id="phaseclip">
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>
        {g.xt.map((v) => (
          <line key={`x${v}`} x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke="var(--plot-grid)" />
        ))}
        {g.yt.map((v) => (
          <line key={`y${v}`} x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--plot-grid)" />
        ))}
        <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} stroke="var(--plot-axis)" />
        <line x1={sx(0)} x2={sx(0)} y1={M.t} y2={H - M.b} stroke="var(--plot-axis)" />
        <g clipPath="url(#phaseclip)">
          <path d={g.arrows} stroke="var(--text-faint)" strokeWidth="1" fill="none" opacity="0.7" />
          {eigLines?.map(([ex, ey], i) => {
            const L = 10 * extent;
            return (
              <line key={i} x1={sx(-L * ex)} y1={sy(-L * ey)} x2={sx(L * ex)} y2={sy(L * ey)} stroke="var(--accent)" strokeDasharray="5 4" strokeOpacity="0.8">
                <title>Eigenvector direction</title>
              </line>
            );
          })}
          <path d={path} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />
          {traj.x.length > 0 && <circle cx={sx(traj.x[0])} cy={sy(traj.y[0])} r="4" fill="none" stroke="var(--s1)" strokeWidth="2" />}
          {current && <circle cx={sx(current[0])} cy={sy(current[1])} r="5" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2" />}
        </g>
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--plot-axis)" />
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--plot-axis)" />
        {g.xt.map((v) => (
          <text key={`tx${v}`} x={sx(v)} y={H - M.b + 14} textAnchor="middle" className="tplot__tick">
            {tickLabel(v, g.step)}
          </text>
        ))}
        {g.yt.map((v) => (
          <text key={`ty${v}`} x={M.l - 6} y={sy(v) + 3.5} textAnchor="end" className="tplot__tick">
            {tickLabel(v, niceStep(g.yr, 2))}
          </text>
        ))}
        <text x={W - M.r} y={H - 3} textAnchor="end" className="tplot__axislabel">
          {xLabel}
        </text>
        <text x={9} y={(M.t + H - M.b) / 2} textAnchor="middle" dominantBaseline="middle" className="tplot__axislabel" transform={`rotate(-90 9 ${(M.t + H - M.b) / 2})`}>
          {yLabel}
        </text>
        {onPick && (
          <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={pick}>
            <title>Click to start a trajectory here</title>
          </rect>
        )}
      </svg>
    </div>
  );
}

export const PhasePlot = memo(PhaseImpl);
