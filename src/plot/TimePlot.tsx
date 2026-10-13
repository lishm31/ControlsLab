import { memo, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { sig } from '../ui/format';
import { decimate, linear, nearestIndex, niceDomain, niceStep, tickLabel, ticks } from './scale';
import { useWidth } from './useSize';

export type SeriesColor = 's1' | 's2' | 'ink' | 'accent';

export interface Series {
  id: string;
  label: string;
  t: number[];
  y: number[];
  color: SeriesColor;
  dash?: boolean;
}

/** Forbidden region for spec boxes: the response must stay out of it. */
export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  label?: string;
}

export interface TimePlotProps {
  series: Series[];
  yLabel: string;
  yUnit: string;
  xLabel?: string;
  xUnit?: string;
  height?: number;
  playhead?: number;
  refLines?: { y: number; label: string }[];
  band?: { y0: number; y1: number; label: string };
  forbidden?: Region[];
  yDomain?: [number, number];
  /** Accessible summary read by screen readers. */
  summary: string;
}

const M = { l: 48, r: 12, t: 10, b: 30 };
const colorVar = (c: SeriesColor) => (c === 'ink' ? 'var(--s-ink)' : c === 'accent' ? 'var(--accent)' : `var(--${c})`);

function TimePlotImpl(p: TimePlotProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = p.height ?? 180;
  const W = Math.max(200, width);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const geom = useMemo(() => {
    let tMax = 0;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of p.series) {
      tMax = Math.max(tMax, s.t[s.t.length - 1] ?? 0);
      for (const v of s.y)
        if (Number.isFinite(v)) {
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        }
    }
    for (const r of p.refLines ?? []) {
      yMin = Math.min(yMin, r.y);
      yMax = Math.max(yMax, r.y);
    }
    const yd = p.yDomain ?? niceDomain(yMin, yMax, 4, 0.06);
    const sx = linear([0, tMax || 1], [M.l, W - M.r]);
    const sy = linear(yd, [H - M.b, M.t]);
    const xt = ticks(0, tMax || 1, Math.max(3, Math.floor(W / 90)));
    const yt = ticks(yd[0], yd[1], 4);
    const paths = p.series.map((s) => ({ s, d: decimate(s.t, s.y, sx, sy) }));
    return { sx, sy, xt, yt, paths, xStep: niceStep(tMax || 1, Math.max(3, Math.floor(W / 90))), yStep: niceStep(yd[1] - yd[0], 4), tMax };
  }, [p.series, p.refLines, p.yDomain, W, H]);

  const { sx, sy } = geom;
  const clampY = (v: number) => Math.min(sy.range[0], Math.max(sy.range[1], v));
  const first = p.series[0];
  const hoverIdx = hoverT !== null && first ? nearestIndex(first.t, hoverT) : null;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setHoverT(Math.min(geom.tMax, Math.max(0, sx.invert(e.clientX - box.left))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = geom.tMax / 100;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverT((h) => Math.min(geom.tMax, Math.max(0, (h ?? 0) + (e.key === 'ArrowRight' ? step : -step))));
    } else if (e.key === 'Escape') setHoverT(null);
  };

  const tipX = hoverT !== null ? sx(hoverT) : 0;
  const tipLeft = tipX > W / 2;

  return (
    <div className="tplot" ref={ref}>
      {p.series.length > 1 && (
        <ul className="tplot__legend" aria-label="Legend">
          {p.series.map((s) => (
            <li key={s.id}>
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" stroke={colorVar(s.color)} strokeWidth="2" strokeDasharray={s.dash ? '4 3' : undefined} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`${p.yLabel} versus time. ${p.summary}. Focus and use arrow keys to read values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setHoverT(null)}
        className="tplot__svg"
      >
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--alarm)" strokeWidth="1" opacity="0.35" />
          </pattern>
          <clipPath id={`clip-${p.yLabel.replace(/\W/g, '')}`}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>
        {/* grid */}
        {geom.yt.map((v) => (
          <line key={`gy${v}`} x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--plot-grid)" />
        ))}
        {geom.xt.map((v) => (
          <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke="var(--plot-grid)" />
        ))}
        {sy.domain[0] < 0 && sy.domain[1] > 0 && <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} stroke="var(--plot-axis)" />}
        <g clipPath={`url(#clip-${p.yLabel.replace(/\W/g, '')})`}>
          {p.band && (
            <rect
              x={M.l}
              width={W - M.l - M.r}
              y={clampY(sy(p.band.y1))}
              height={Math.max(0, clampY(sy(p.band.y0)) - clampY(sy(p.band.y1)))}
              fill="var(--accent-dim)"
            >
              <title>{p.band.label}</title>
            </rect>
          )}
          {p.forbidden?.map((r, i) => (
            <rect
              key={i}
              x={sx(r.x0)}
              width={Math.max(0, sx(Math.min(r.x1, geom.tMax)) - sx(r.x0))}
              y={clampY(sy(r.y1))}
              height={Math.max(0, clampY(sy(r.y0)) - clampY(sy(r.y1)))}
              fill="url(#hatch)"
              stroke="var(--alarm)"
              strokeOpacity="0.5"
              strokeDasharray="2 3"
            >
              {r.label && <title>{r.label}</title>}
            </rect>
          ))}
          {p.refLines?.map((r) => (
            <g key={r.label}>
              <line x1={M.l} x2={W - M.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--accent)" strokeDasharray="1 3" strokeWidth="1.5" />
              <text x={W - M.r - 4} y={sy(r.y) - 4} textAnchor="end" className="tplot__ref">
                {r.label}
              </text>
            </g>
          ))}
          {geom.paths.map(({ s, d }) => (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke={colorVar(s.color)}
              strokeWidth={s.dash ? 1.5 : 2}
              strokeDasharray={s.dash ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
        {/* axes */}
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--plot-axis)" />
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--plot-axis)" />
        {geom.yt.map((v) => (
          <text key={`ty${v}`} x={M.l - 6} y={sy(v) + 3.5} textAnchor="end" className="tplot__tick">
            {tickLabel(v, geom.yStep)}
          </text>
        ))}
        {geom.xt.map((v) => (
          <text key={`tx${v}`} x={sx(v)} y={H - M.b + 14} textAnchor="middle" className="tplot__tick">
            {tickLabel(v, geom.xStep)}
          </text>
        ))}
        <text x={W - M.r} y={H - 3} textAnchor="end" className="tplot__axislabel">
          {(p.xLabel ?? 'time') + ' [' + (p.xUnit ?? 's') + ']'}
        </text>
        <text
          x={9}
          y={(M.t + H - M.b) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="tplot__axislabel"
          transform={`rotate(-90 9 ${(M.t + H - M.b) / 2})`}
        >
          {`${p.yLabel} [${p.yUnit}]`}
        </text>
        {/* playhead */}
        {p.playhead !== undefined && p.playhead > 0 && p.playhead < geom.tMax && (
          <line x1={sx(p.playhead)} x2={sx(p.playhead)} y1={M.t} y2={H - M.b} stroke="var(--accent)" strokeWidth="1" />
        )}
        {/* hover layer */}
        {hoverIdx !== null && hoverT !== null && (
          <g pointerEvents="none">
            <line x1={tipX} x2={tipX} y1={M.t} y2={H - M.b} stroke="var(--text-faint)" strokeDasharray="2 2" />
            {p.series.map((s) => {
              const i = s === first ? hoverIdx : nearestIndex(s.t, hoverT);
              const v = s.y[i];
              return Number.isFinite(v) ? (
                <circle key={s.id} cx={sx(s.t[i])} cy={clampY(sy(v))} r="3.5" fill={colorVar(s.color)} stroke="var(--bg-1)" strokeWidth="2" />
              ) : null;
            })}
          </g>
        )}
        <rect
          x={M.l}
          y={M.t}
          width={W - M.l - M.r}
          height={H - M.t - M.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverT(null)}
        />
      </svg>
      {hoverIdx !== null && hoverT !== null && first && (
        <div className="tplot__tip mono" style={tipLeft ? { right: W - tipX + 10 } : { left: tipX + 10 }} aria-live="polite">
          <div className="tplot__tiphead">t = {sig(first.t[hoverIdx], 4)} s</div>
          {p.series.map((s) => {
            const v = s.y[s === first ? hoverIdx : nearestIndex(s.t, hoverT)];
            return (
              <div key={s.id} className="tplot__tiprow">
                <svg width="10" height="10" aria-hidden="true">
                  <rect width="10" height="3" y="3.5" fill={colorVar(s.color)} />
                </svg>
                <span>{s.label}</span>
                <b>{sig(v, 4)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const TimePlot = memo(TimePlotImpl);
