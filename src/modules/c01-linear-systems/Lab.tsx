import { useMemo } from 'react';
import { rad2deg } from '../../core/units';
import { PhasePlot } from '../../plot/PhasePlot';
import { type PoleSet, SPlanePlot } from '../../plot/SPlanePlot';
import { type Series, TimePlot } from '../../plot/TimePlot';
import { nearestIndex } from '../../plot/scale';
import { GroupLabel, Segmented, Slider, Toggle } from '../../ui/Controls';
import { fix, sig } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { Status, TelemetryStrip } from '../../ui/Telemetry';
import { Tex } from '../../ui/Tex';
import { Timeline } from '../../ui/Timeline';
import { usePlayback } from '../../ui/usePlayback';
import type { LabProps } from '../types';
import { DEFAULTS, type LSParams, REGIME_TEXT, eigenDirections, eigenLocus, eigenvalues, regime, simulate, stateMatrix, stiffSign } from './model';
import { Mechanism } from './visual/Mechanism';

const PRESETS: { label: string; patch: Partial<LSParams> }[] = [
  { label: 'Underdamped', patch: { zeta: 0.2, negStiffness: false } },
  { label: 'Critical', patch: { zeta: 1, negStiffness: false } },
  { label: 'Overdamped', patch: { zeta: 2, negStiffness: false } },
  { label: 'Undamped', patch: { zeta: 0, negStiffness: false } },
  { label: 'Neg. damping', patch: { zeta: -0.1, negStiffness: false } },
  { label: 'Saddle', patch: { zeta: 0.2, negStiffness: true, x0: 0.05, v0: 0 } },
];

export function Lab({ params: p, setParams, problemSlot }: LabProps<LSParams>) {
  const run = useMemo(() => simulate(p), [p]);
  const pb = usePlayback(run.t[run.t.length - 1], run, 10);
  const k = Math.min(run.t.length - 1, nearestIndex(run.t, pb.t));
  const x = run.x[k];
  const v = run.v[k];
  const ev = useMemo(() => eigenvalues(p), [p]);
  const reg = regime(p);
  const rt = REGIME_TEXT[reg];
  const sigma = -Math.max(...ev.map((e) => e.re));
  const wd = Math.max(...ev.map((e) => Math.abs(e.im)));
  const A = useMemo(() => stateMatrix(p), [p]);
  const isPend = p.visual === 'pendulum' || p.negStiffness;
  const xUnit = isPend ? 'rad' : 'm';
  const vUnit = isPend ? 'rad/s' : 'm/s';

  const scale = useMemo(() => Math.max(1e-6, ...run.x.map(Math.abs)), [run]);
  const extent = useMemo(() => {
    const m = Math.max(...run.x.map(Math.abs), ...run.v.map(Math.abs), Math.abs(p.x0), Math.abs(p.v0), 1e-3);
    return m * 1.1;
  }, [run, p.x0, p.v0]);

  const series = useMemo((): Series[] => {
    const s: Series[] = [
      { id: 'x', label: `x [${xUnit}]`, t: run.t, y: run.x, color: 's1' },
      { id: 'v', label: `ẋ [${vUnit}]`, t: run.t, y: run.v, color: 's2' },
    ];
    if (wd > 1e-9 && Math.abs(sigma) > 1e-9 && ev.every((e) => Math.abs(e.im) > 1e-9)) {
      // Envelope of x: amplitude of the sinusoid times e^{-sigma t}
      const B = (p.v0 + sigma * p.x0) / wd;
      const amp = Math.hypot(p.x0, B);
      s.push({ id: 'env', label: 'Envelope ±R e^(−σt)', t: run.t, y: run.t.map((t) => amp * Math.exp(-sigma * t)), color: 'ink', dash: true });
      s.push({ id: 'env2', label: 'Envelope', hideInLegend: true, t: run.t, y: run.t.map((t) => -amp * Math.exp(-sigma * t)), color: 'ink', dash: true });
    }
    return s;
  }, [run, wd, sigma, ev, p.v0, p.x0, xUnit, vUnit]);

  const poleSets = useMemo((): PoleSet[] => [{ id: 'ev', label: 'Eigenvalues of A', points: ev, kind: 'pole', color: 's1' }], [ev]);
  const locus = useMemo(() => {
    const [a, b] = eigenLocus(p);
    return [
      { id: 'l1', label: 'Path as zeta sweeps -0.5 to 2.5', points: a },
      { id: 'l2', label: 'Path as zeta sweeps -0.5 to 2.5', points: b },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.wn, p.negStiffness]);
  const set = <K extends keyof LSParams>(key: K) => (val: LSParams[K]) => setParams({ [key]: val } as Partial<LSParams>);
  const stableLevel = rt.stable === 'stable' ? 'ok' : rt.stable === 'marginal' ? 'caution' : 'alarm';
  const evText = (i: number) => {
    const e = ev[i];
    return Math.abs(e.im) < 1e-9 ? fix(e.re, 3) : `${fix(e.re, 3)}${e.im < 0 ? '−' : '+'}${fix(Math.abs(e.im), 3)}j`;
  };
  const evPair = Math.abs(ev[0].im) > 1e-9 ? `${fix(ev[0].re, 3)} ± ${fix(Math.abs(ev[0].im), 3)}j` : `${fix(ev[0].re, 3)}, ${fix(ev[1].re, 3)}`;

  return (
    <div className="page lab lab--c01">
      <div className="lab__tele">
        <TelemetryStrip
          label="State at the playhead"
          items={[
            { label: 'Time', value: fix(pb.t, 2), unit: 's' },
            { label: isPend ? 'δθ' : 'x', value: fix(x, 4), unit: xUnit },
            { label: isPend ? 'δθ dot' : 'ẋ', value: fix(v, 4), unit: vUnit },
            { label: 'Eigenvalues λ1,2', value: evPair, unit: '1/s', wide: true },
            { label: 'ωn', value: fix(p.wn, 3), unit: 'rad/s' },
            { label: 'ζ', value: p.negStiffness ? 'n/a' : fix(p.zeta, 3) },
            { label: 'Period Td', value: wd > 1e-9 ? fix((2 * Math.PI) / wd, 3) : 'none', unit: wd > 1e-9 ? 's' : undefined },
            { label: 'Portrait', value: <span className="telemetry__text">{rt.portrait}</span> },
            { label: 'Stability', value: <Status level={stableLevel}>{rt.stable.toUpperCase()}</Status> },
          ]}
        />
      </div>

      <Panel title="System" className="lab__ctrl" id="ls-controls">
        <div className="presets" role="group" aria-label="Presets">
          {PRESETS.map((pr) => (
            <button key={pr.label} type="button" className="btn" onClick={() => setParams(pr.patch)}>
              {pr.label}
            </button>
          ))}
        </div>
        <GroupLabel>Equation</GroupLabel>
        <p className="lab__eq">
          <Tex tex={`\\ddot x + 2\\zeta\\omega_n\\dot x ${p.negStiffness ? '-' : '+'} \\omega_n^2 x = 0`} />
        </p>
        <Slider label="Damping ratio ζ" value={p.zeta} min={-0.5} max={2.5} step={0.01} onChange={set('zeta')} hardMin={-5} hardMax={20} digits={3} />
        <Slider label="Natural frequency ωn" value={p.wn} min={0.2} max={6} step={0.05} unit="rad/s" onChange={set('wn')} hardMax={100} />
        <Toggle label="Negative stiffness (unstable equilibrium)" checked={p.negStiffness} onChange={set('negStiffness')} />

        <GroupLabel>Initial conditions</GroupLabel>
        <Slider label="x(0)" value={p.x0} min={-2} max={2} step={0.01} unit={xUnit} onChange={set('x0')} hardMin={-100} hardMax={100} />
        <Slider label="ẋ(0)" value={p.v0} min={-5} max={5} step={0.01} unit={vUnit} onChange={set('v0')} hardMin={-100} hardMax={100} />
        <p className="dim lab__note">Or click anywhere on the phase portrait to start there.</p>

        <GroupLabel>Picture</GroupLabel>
        <Segmented
          label="Physical system"
          full
          value={isPend ? 'pendulum' : 'msd'}
          onChange={set('visual')}
          options={[
            { value: 'msd', label: 'Mass-spring-damper' },
            { value: 'pendulum', label: 'Pendulum' },
          ]}
        />
        <div style={{ height: 10 }} />
        <dl className="kv">
          <dt>With m = {p.m} kg: k</dt>
          <dd>
            {sig(stiffSign(p) * p.wn * p.wn * p.m, 4)} N/m
          </dd>
          <dt>c</dt>
          <dd>{sig(2 * p.zeta * p.wn * p.m, 4)} N s/m</dd>
          <dt>A</dt>
          <dd>
            [0, 1; {sig(A[1][0], 3)}, {sig(A[1][1], 3)}]
          </dd>
        </dl>
        <button type="button" className="btn btn--ghost lab__reset" onClick={() => setParams({ ...DEFAULTS })}>
          Reset all
        </button>
      </Panel>

      <section className="lab__view" aria-label="Physical system and playback">
        <Mechanism
          kind={isPend ? 'pendulum' : 'msd'}
          x={x}
          scale={scale}
          inverted={p.negStiffness}
          label={isPend ? `Pendulum at ${fix(rad2deg(x), 1)} degrees from equilibrium` : `Mass at x = ${fix(x, 3)} m`}
        />
        <Timeline pb={pb} />
        <p className="lab__caption dim">
          {rt.name}. {regimeBlurb(reg)}
        </p>
        <div className="lab__stack">
          <Panel title="Free response" meta={`${xUnit}, ${vUnit}`} flush>
            <div className="plotpad">
              <TimePlot series={series} yLabel="state" yUnit={`${xUnit}, ${vUnit}`} playhead={pb.t} height={260} summary={`${rt.name} free response`} />
            </div>
          </Panel>
        </div>
      </section>

      <div className="lab__side">
        <Panel title="Eigenvalues" meta={`λ² + ${sig(2 * p.zeta * p.wn, 3)}λ ${p.negStiffness ? '−' : '+'} ${sig(p.wn * p.wn, 3)} = 0`} id="ls-eig">
          <SPlanePlot
            sets={poleSets}
            paths={locus}
            height={220}
            extent={Math.max(1, p.wn * (p.negStiffness ? 2.2 : 1.6))}
            summary={`Eigenvalues ${evText(0)} and ${evText(1)}`}
          />
          <p className="dim lab__note">Dashed: where the eigenvalues go as ζ sweeps from −0.5 to 2.5 at this ωn.</p>
        </Panel>
        <Panel title="Phase portrait" meta={rt.portrait} id="ls-phase">
          <PhasePlot
            A={A}
            traj={{ x: run.x, y: run.v }}
            current={[x, v]}
            extent={extent}
            xLabel={`x [${xUnit}]`}
            yLabel={`ẋ [${vUnit}]`}
            eigLines={eigenDirections(p)}
            onPick={(nx, nv) => setParams({ x0: nx, v0: nv })}
            height={280}
            summary={`${rt.portrait}, trajectory from x = ${sig(p.x0, 3)}, v = ${sig(p.v0, 3)}`}
          />
        </Panel>
      </div>

      <div className="lab__prac">{problemSlot}</div>
    </div>
  );
}

function regimeBlurb(r: ReturnType<typeof regime>): string {
  switch (r) {
    case 'underdamped':
      return 'Complex eigenvalues in the left half plane: it oscillates at ωd while the envelope decays at σ = ζωn.';
    case 'critical':
      return 'A double real eigenvalue: the fastest return to zero without crossing it (from rest).';
    case 'overdamped':
      return 'Two real eigenvalues: no oscillation, the slow one sets how long it takes. Trajectories hug the slow eigenvector.';
    case 'undamped':
      return 'Eigenvalues on the imaginary axis: it oscillates forever. Energy is conserved, so the phase portrait is a closed ellipse.';
    case 'unstable-osc':
      return 'Complex eigenvalues in the right half plane: the oscillation grows.';
    case 'unstable-node':
      return 'Real positive eigenvalues: it runs away without oscillating.';
    case 'saddle':
      return 'One positive and one negative real eigenvalue. Almost every start runs away along the unstable eigenvector.';
  }
}
