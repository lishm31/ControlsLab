import { memo, useMemo } from 'react';
import type { Complex } from '../core/complex';
import { sig } from '../ui/format';
import { linear, niceStep, tickLabel, ticks } from './scale';
import { useWidth } from './useSize';

export interface PoleSet {
  id: string;
  label: string;
  points: Complex[];
  kind: 'pole' | 'zero';
  color: 's1' | 's2' | 'ink';
}

interface Props {
  sets: PoleSet[];
  height?: number;
  /** Optional constant damping rays to draw, e.g. the zeta that meets an overshoot spec. */
  zetaLines?: number[];
  /** Minimum half-extent of the view, so the axes do not jump around for small changes. */
  minExtent?: number;
  /** Loci to draw under the markers, e.g. where the eigenvalues go as a parameter sweeps. */
  paths?: { id: string; label: string; points: Complex[] }[];
  /** Fixed half-extent (overrides auto fit). */
  extent?: number;
  summary: string;
}

const M = 26;
const colorVar = (c: string) => (c === 'ink' ? 'var(--s-ink)' : `var(--${c})`);

function SPlaneImpl({ sets, height = 220, zetaLines, minExtent = 1, summary, paths, extent }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(300);
  const W = Math.max(200, width);
  const H = height;
  const g = useMemo(() => {
    const pts = sets.flatMap((s) => s.points).filter((z) => Number.isFinite(z.re) && Number.isFinite(z.im));
    let ext = minExtent;
    for (const z of pts) ext = Math.max(ext, Math.abs(z.re) * 1.15, Math.abs(z.im) * 1.15);
    ext = extent ?? niceStep(ext, 1) * Math.ceil(ext / niceStep(ext, 1));
    // Equal scaling on both axes so angles (damping) read correctly.
    const pxPerUnit = Math.min((W - 2 * M) / (2 * ext), (H - 2 * M) / (2 * ext));
    const cx = W / 2;
    const cy = H / 2;
    const xr = (W - 2 * M) / 2 / pxPerUnit;
    const yr = (H - 2 * M) / 2 / pxPerUnit;
    const sx = linear([-xr, xr], [cx - xr * pxPerUnit, cx + xr * pxPerUnit]);
    const sy = linear([-yr, yr], [cy + yr * pxPerUnit, cy - yr * pxPerUnit]);
    const step = niceStep(xr, 3);
    return { sx, sy, xr, yr, xt: ticks(-xr, xr, Math.max(4, Math.floor(W / 70))), yt: ticks(-yr, yr, 4), step };
  }, [sets, W, H, minExtent, extent]);
  const { sx, sy } = g;
  return (
    <div className="splane" ref={ref}>
      <ul className="tplot__legend" aria-label="Legend">
        {sets.map((s) => (
          <li key={s.id}>
            <svg width="12" height="12" aria-hidden="true">
              {s.kind === 'pole' ? (
                <path d="M2 2L10 10M10 2L2 10" stroke={colorVar(s.color)} strokeWidth="2" />
              ) : (
                <circle cx="6" cy="6" r="4" fill="none" stroke={colorVar(s.color)} strokeWidth="2" />
              )}
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <svg width={W} height={H} role="img" aria-label={`s-plane. ${summary}`}>
        {/* RHP: unstable region */}
        <rect x={sx(0)} y={sy(g.yr)} width={sx(g.xr) - sx(0)} height={sy(-g.yr) - sy(g.yr)} fill="var(--hatch)" />
        {g.xt.map((v) => (
          <line key={`x${v}`} x1={sx(v)} x2={sx(v)} y1={sy(g.yr)} y2={sy(-g.yr)} stroke="var(--plot-grid)" />
        ))}
        {g.yt.map((v) => (
          <line key={`y${v}`} x1={sx(-g.xr)} x2={sx(g.xr)} y1={sy(v)} y2={sy(v)} stroke="var(--plot-grid)" />
        ))}
        {zetaLines?.map((z) => {
          const th = Math.acos(Math.min(1, Math.max(0, z)));
          const r = Math.hypot(g.xr, g.yr);
          return (
            <g key={z}>
              {[1, -1].map((sg) => (
                <line
                  key={sg}
                  x1={sx(0)}
                  y1={sy(0)}
                  x2={sx(-r * Math.cos(th))}
                  y2={sy(sg * r * Math.sin(th))}
                  stroke="var(--accent)"
                  strokeDasharray="3 3"
                  strokeOpacity="0.8"
                />
              ))}
              <text x={sx(-g.xr) + 4} y={sy(g.yr) + 12} className="tplot__ref" textAnchor="start">
                {`ζ = ${sig(z, 2)}`}
              </text>
            </g>
          );
        })}
        <line x1={sx(-g.xr)} x2={sx(g.xr)} y1={sy(0)} y2={sy(0)} stroke="var(--plot-axis)" />
        <line x1={sx(0)} x2={sx(0)} y1={sy(g.yr)} y2={sy(-g.yr)} stroke="var(--plot-axis)" />
        {g.xt
          .filter((v) => v !== 0)
          .map((v) => (
            <text key={`tx${v}`} x={sx(v)} y={sy(0) + 13} textAnchor="middle" className="tplot__tick">
              {tickLabel(v, g.step)}
            </text>
          ))}
        <text x={sx(g.xr) - 2} y={sy(0) - 5} textAnchor="end" className="tplot__axislabel">
          Re [1/s]
        </text>
        <text x={sx(0) + 5} y={sy(g.yr) + 10} className="tplot__axislabel">
          Im [rad/s]
        </text>
        {paths?.map((pa) => (
          <polyline
            key={pa.id}
            points={pa.points
              .filter((z) => Math.abs(z.re) <= g.xr && Math.abs(z.im) <= g.yr)
              .map((z) => `${sx(z.re).toFixed(1)},${sy(z.im).toFixed(1)}`)
              .join(' ')}
            fill="none"
            stroke="var(--s-ink)"
            strokeOpacity="0.45"
            strokeDasharray="3 3"
          >
            <title>{pa.label}</title>
          </polyline>
        ))}
        {sets.map((s) =>
          s.points.map((z, i) => {
            const x = sx(z.re);
            const y = sy(z.im);
            const c = colorVar(s.color);
            const label = `${s.label}: ${sig(z.re, 3)} ${z.im < 0 ? '−' : '+'} ${sig(Math.abs(z.im), 3)}j`;
            return (
              <g key={`${s.id}${i}`}>
                <title>{label}</title>
                {s.kind === 'pole' ? (
                  <>
                    <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}`} stroke="var(--bg-1)" strokeWidth="5" />
                    <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}`} stroke={c} strokeWidth="2" />
                  </>
                ) : (
                  <circle cx={x} cy={y} r="5" fill="var(--bg-1)" stroke={c} strokeWidth="2" />
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

export const SPlanePlot = memo(SPlaneImpl);
