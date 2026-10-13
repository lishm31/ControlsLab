/**
 * The physical system behind the equation, drawn from the simulated state:
 * a mass-spring-damper (x in m) or a pendulum (x is the angle in rad).
 */
import { fix } from '../../../ui/format';
import { useWidth } from '../../../plot/useSize';
import { rad2deg } from '../../../core/units';

interface Props {
  kind: 'msd' | 'pendulum';
  x: number;
  scale: number; // largest |x| in the run, for framing the mass-spring
  inverted: boolean;
  label: string;
}

export function Mechanism({ kind, x, scale, inverted, label }: Props) {
  const [ref, w] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, w);
  const H = kind === 'msd' ? 200 : 260;
  return (
    <div className="mech" ref={ref} role="img" aria-label={label}>
      <svg width={W} height={H}>
        {kind === 'msd' ? <Msd W={W} H={H} x={x} scale={scale} /> : <Pendulum W={W} H={H} th={x} inverted={inverted} />}
      </svg>
    </div>
  );
}

function zigzag(x0: number, x1: number, y: number, n: number, amp: number) {
  const pts = [`${x0},${y}`];
  const lead = 10;
  const span = Math.max(4, x1 - x0 - 2 * lead);
  pts.push(`${x0 + lead},${y}`);
  for (let i = 0; i < n; i++) pts.push(`${x0 + lead + ((i + 0.5) * span) / n},${y + (i % 2 ? amp : -amp)}`);
  pts.push(`${x0 + lead + span},${y}`, `${x1},${y}`);
  return pts.join(' ');
}

function Msd({ W, H, x, scale }: { W: number; H: number; x: number; scale: number }) {
  const wallX = 24;
  const ground = H - 40;
  const eqX = W * 0.55;
  const px = (W * 0.28) / Math.max(scale, 1e-9);
  const mx = eqX + x * px;
  const bw = 64;
  const bh = 56;
  const yS = ground - bh + 16;
  const yD = ground - 16;
  const left = mx - bw / 2;
  return (
    <g>
      <rect x={0} y={ground} width={W} height={1} fill="var(--plot-axis)" />
      {Array.from({ length: Math.ceil(W / 12) }, (_, i) => (
        <line key={i} x1={i * 12} y1={ground + 1} x2={i * 12 - 8} y2={ground + 9} stroke="var(--rule-strong)" />
      ))}
      <rect x={wallX - 6} y={ground - 110} width={6} height={110} fill="var(--rule-strong)" />
      {/* spring */}
      <polyline points={zigzag(wallX, left, yS, 10, 8)} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />
      <text x={(wallX + left) / 2} y={yS - 14} textAnchor="middle" className="tplot__axislabel">
        k
      </text>
      {/* dashpot: cylinder fixed to wall, piston on the mass */}
      <line x1={wallX} y1={yD} x2={wallX + 40} y2={yD} stroke="var(--text-dim)" strokeWidth="2" />
      <path d={`M${wallX + 40} ${yD - 9}H${wallX + 110}M${wallX + 40} ${yD + 9}H${wallX + 110}M${wallX + 40} ${yD - 9}V${yD + 9}`} stroke="var(--text-dim)" strokeWidth="2" fill="none" />
      <line x1={Math.max(wallX + 50, Math.min(left - 2, wallX + 100))} y1={yD - 7} x2={Math.max(wallX + 50, Math.min(left - 2, wallX + 100))} y2={yD + 7} stroke="var(--text-dim)" strokeWidth="3" />
      <line x1={Math.max(wallX + 50, Math.min(left - 2, wallX + 100))} y1={yD} x2={left} y2={yD} stroke="var(--text-dim)" strokeWidth="2" />
      <text x={wallX + 75} y={yD + 24} textAnchor="middle" className="tplot__axislabel">
        c
      </text>
      {/* mass */}
      <rect x={left} y={ground - bh} width={bw} height={bh} fill="var(--bg-3)" stroke="var(--text)" strokeWidth="1.5" />
      <text x={mx} y={ground - bh / 2 + 4} textAnchor="middle" className="mech__m">
        m
      </text>
      {/* equilibrium and displacement */}
      <line x1={eqX} y1={ground - bh - 26} x2={eqX} y2={ground + 2} stroke="var(--accent)" strokeDasharray="3 3" />
      <text x={eqX} y={ground - bh - 30} textAnchor="middle" className="tplot__ref">
        x = 0
      </text>
      <line x1={eqX} y1={ground - bh - 12} x2={mx} y2={ground - bh - 12} stroke="var(--text-faint)" />
      <text x={mx + (x >= 0 ? 6 : -6)} y={ground - bh - 8} textAnchor={x >= 0 ? 'start' : 'end'} className="tplot__tick">
        x = {fix(x, 3)} m
      </text>
    </g>
  );
}

function Pendulum({ W, H, th, inverted }: { W: number; H: number; th: number; inverted: boolean }) {
  const cx = W / 2;
  const L = Math.min(H * 0.62, W * 0.4);
  const cy = inverted ? H - 36 : 30;
  // absolute angle measured from hanging-down; inverted uses pi + delta
  const ang = (inverted ? Math.PI : 0) + th;
  const bx = cx + L * Math.sin(ang);
  const by = cy + L * Math.cos(ang);
  const big = Math.abs(rad2deg(th)) > 30;
  const refY = inverted ? cy - L : cy + L;
  return (
    <g>
      <line x1={cx - 50} y1={cy} x2={cx + 50} y2={cy} stroke="var(--rule-strong)" strokeWidth="3" />
      <line x1={cx} y1={cy} x2={cx} y2={refY} stroke="var(--accent)" strokeDasharray="3 3" />
      <text x={cx + 6} y={inverted ? refY + 12 : refY - 4} className="tplot__ref">
        {inverted ? 'θ = π' : 'θ = 0'}
      </text>
      <line x1={cx} y1={cy} x2={bx} y2={by} stroke="var(--text)" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="5" fill="var(--bg-1)" stroke="var(--text)" strokeWidth="2" />
      <circle cx={bx} cy={by} r="15" fill="var(--bg-3)" stroke="var(--text)" strokeWidth="1.5" />
      <text x={12} y={18} className="tplot__tick">
        δθ = {fix(rad2deg(th), 2)} deg
      </text>
      {big && (
        <text x={12} y={34} className="mech__warn">
          Past 30 deg: sin θ ≈ θ is getting poor. This is the linear model.
        </text>
      )}
    </g>
  );
}
