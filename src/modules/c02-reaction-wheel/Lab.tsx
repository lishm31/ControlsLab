import { useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../app/theme';
import { linspace, step } from '../../core/response';
import { tf } from '../../core/tf';
import { DEG, deg2rad, rad2deg, radps2rpm } from '../../core/units';
import { type PoleSet, SPlanePlot } from '../../plot/SPlanePlot';
import { type Series, TimePlot } from '../../plot/TimePlot';
import { GroupLabel, Segmented, Slider, Toggle } from '../../ui/Controls';
import { fix, sig } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { Status, type StatusLevel, TelemetryStrip } from '../../ui/Telemetry';
import { RichText } from '../../ui/Tex';
import { SpacecraftView } from '../../viz3d/SpacecraftView';
import type { LabProps } from '../types';
import { measureBang, measurePD } from './measure';
import { DEFAULTS, type Mode, type RWParams, bangTheory, pdPoles, pdTheory, trueInertia } from './model';
import { type RWRun, autoEnd, indexAt, simulate } from './sim';

const SPEEDS = [1, 2, 5, 10, 20, 50];
const MODE_LABEL: Record<Mode, string> = { pd: 'PD feedback', bangbang: 'Open loop bang-bang' };

/** Ideal reference curve: what the lecture formulas predict (nominal inertia, no limits, no disturbance). */
function idealTheta(p: RWParams, run: RWRun): number[] {
  if (p.mode === 'pd') {
    const { wn, zeta } = pdTheory(p);
    const t = run.t;
    // Uniform grid, so the exact discretized step response applies.
    const y = step(tf([wn * wn], [1, 2 * zeta * wn, wn * wn]), linspace(0, t[t.length - 1], t.length)).y;
    return y.map((v) => v * p.theta1Deg);
  }
  const nominal = simulate({ ...p, inertiaErr: 0, dist: 0 }, 'bangbang', run.t[run.t.length - 1]);
  return nominal.theta.map(rad2deg);
}

export function Lab({ params: p, setParams, problemSlot }: LabProps<RWParams>) {
  const reduced = useMemo(prefersReducedMotion, []);
  const other: Mode = p.mode === 'pd' ? 'bangbang' : 'pd';
  const tEnd = useMemo(() => (p.compare ? Math.max(autoEnd(p, 'pd'), autoEnd(p, 'bangbang')) : autoEnd(p, p.mode)), [p]);
  const run = useMemo(() => simulate(p, p.mode, tEnd), [p, tEnd]);
  const runOther = useMemo(() => (p.compare ? simulate(p, other, tEnd) : null), [p, other, tEnd]);
  const ideal = useMemo(() => idealTheta(p, run), [p, run]);
  const tMax = run.t[run.t.length - 1];

  // ------------------------------------------------------------ playback
  const autoSpeed = SPEEDS.find((s) => tMax / s <= 12) ?? SPEEDS[SPEEDS.length - 1];
  const [speed, setSpeed] = useState(autoSpeed);
  const [t, setT] = useState(reduced ? tMax : 0);
  const [playing, setPlaying] = useState(!reduced);
  const lastFrame = useRef<{ wall: number; sweep: number }>({ wall: 0, sweep: 0 });

  useEffect(() => {
    // New parameters: restart the maneuver (or jump to the end with reduced motion).
    setSpeed(SPEEDS.find((s) => tMax / s <= 12) ?? SPEEDS[SPEEDS.length - 1]);
    setT(reduced ? tMax : 0);
    setPlaying(!reduced);
  }, [run, tMax, reduced]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      lastFrame.current.wall = dt;
      setT((x) => {
        const nx = x + dt * speed;
        if (nx >= tMax) {
          setPlaying(false);
          return tMax;
        }
        return nx;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tMax]);

  const k = indexAt(run, t);
  const th = run.theta[k];
  const rate = run.rate[k];
  const u = run.u[Math.min(k, run.u.length - 1)];
  const wheel = run.wheel[k];
  const Hw = p.Iw * wheel;
  const th1 = deg2rad(p.theta1Deg);
  const err = th - th1;

  // Wheel sweep during one displayed frame (relative to the body), for the motion smear.
  const frameDt = playing ? lastFrame.current.wall || 1 / 60 : 0;
  const sweep = (wheel - rate) * frameDt * speed;

  const trail = useMemo(() => {
    const span = tMax * 0.2;
    const k0 = indexAt(run, Math.max(0, run.t[k] - span));
    const stepN = Math.max(1, Math.floor((k - k0) / 160));
    const out: number[] = [];
    for (let i = k0; i <= k; i += stepN) out.push(run.theta[i]);
    return out;
  }, [run, k, tMax]);

  const sceneState = useMemo(
    () => ({
      theta: th,
      theta1: th1,
      wheelAngle: run.wheelAngle[k],
      wheelSweep: sweep,
      thrust: p.actuator === 'thrusters' ? u / p.uMax : 0,
      trail: reduced ? [] : trail,
      showGhost: true,
    }),
    [th, th1, run, k, sweep, p.actuator, p.uMax, u, trail, reduced],
  );

  // ------------------------------------------------------------ status
  const settledBand = 0.02 * Math.abs(th1) + 1e-9;
  const target = p.mode === 'pd' ? th1 + p.dist / p.Kp : th1;
  const settled = Math.abs(th - target) <= settledBand && Math.abs(rate) < 0.02 * DEG;
  const satNow = p.mode === 'pd' && p.torqueLimit && Math.abs(run.uCmd[k] ?? 0) > p.uMax + 1e-12;
  let status: [StatusLevel, string];
  if (k === 0 && !playing) status = ['idle', 'STANDBY'];
  else if (p.mode === 'bangbang' && run.tSwitch && t > 2 * run.tSwitch && Math.abs(rate) > 1e-6) status = ['caution', 'DRIFTING'];
  else if (settled) status = ['ok', p.mode === 'pd' ? 'SETTLED' : 'COAST'];
  else status = ['caution', 'SLEWING'];

  // ------------------------------------------------------------ plots
  const series = useMemo(() => {
    const deg = (a: number[]) => a.map(rad2deg);
    const mk = (r: RWRun, label: string, color: 's1' | 's2') => ({
      theta: { id: `th-${r.mode}`, label, t: r.t, y: deg(r.theta), color } as Series,
      rate: { id: `rt-${r.mode}`, label, t: r.t, y: deg(r.rate), color } as Series,
      u: { id: `u-${r.mode}`, label, t: r.t, y: r.u, color } as Series,
      rpm: { id: `w-${r.mode}`, label, t: r.t, y: r.wheel.map(radps2rpm), color } as Series,
    });
    const a = mk(run, MODE_LABEL[run.mode], 's1');
    const b = runOther ? mk(runOther, MODE_LABEL[runOther.mode], 's2') : null;
    const theory: Series = {
      id: 'ideal',
      label: p.mode === 'pd' ? 'Ideal 2nd order (formula)' : 'Nominal plan',
      t: run.t,
      y: ideal,
      color: 'ink',
      dash: true,
    };
    return {
      theta: [a.theta, ...(b ? [b.theta] : []), theory],
      rate: [a.rate, ...(b ? [b.rate] : [])],
      u: [a.u, ...(b ? [b.u] : [])],
      rpm: [a.rpm, ...(b ? [b.rpm] : [])],
    };
  }, [run, runOther, ideal, p.mode]);

  // ------------------------------------------------------------ theory vs measured
  const pdT = pdTheory(p);
  const rows = useMemo(() => buildRows(p, run), [p, run]);
  const poleSets = useMemo((): PoleSet[] => {
    if (p.mode === 'bangbang') return [{ id: 'ol', label: 'Open loop 1/(Is²)', points: [{ re: 0, im: 0 }, { re: 0, im: 0 }], kind: 'pole', color: 's1' }];
    const sets: PoleSet[] = [{ id: 'cl', label: 'Closed loop, true I', points: pdPoles(p), kind: 'pole', color: 's1' }];
    if (p.inertiaErr !== 0) sets.push({ id: 'nom', label: 'Design, nominal I', points: pdPoles(p, p.I), kind: 'pole', color: 'ink' });
    return sets;
  }, [p]);

  const set = <K extends keyof RWParams>(key: K) => (v: RWParams[K]) => setParams({ [key]: v } as Partial<RWParams>);
  const isPD = p.mode === 'pd';

  return (
    <div className="page lab">
      <div className="lab__tele">
        <TelemetryStrip
          label="Live telemetry at the playhead"
          items={[
            { label: 'MET', value: fix(t, 1), unit: 's' },
            { label: 'Mode', value: isPD ? 'PD' : 'BANG' },
            { label: 'Attitude', value: fix(rad2deg(th), 2), unit: 'deg' },
            { label: 'Error', value: fix(rad2deg(err), 2), unit: 'deg' },
            { label: 'Rate', value: fix(rad2deg(rate), 3), unit: 'deg/s' },
            { label: 'Torque', value: fix(u, 3), unit: 'N m' },
            { label: 'Wheel', value: fix(radps2rpm(wheel), 0), unit: 'rpm' },
            { label: 'H wheel', value: fix(Hw, 3), unit: 'N m s' },
            { label: 'Torque lim', value: <Status level={satNow ? 'caution' : p.torqueLimit && isPD ? 'ok' : 'idle'}>{satNow ? 'SAT' : p.torqueLimit && isPD ? 'ARMED' : 'OFF'}</Status> },
            { label: 'Status', value: <Status level={status[0]}>{status[1]}</Status> },
          ]}
        />
      </div>

      <Panel title="Controls" className="lab__ctrl" id="rw-controls">
        <Segmented
          label="Control strategy"
          full
          value={p.mode}
          onChange={set('mode')}
          options={[
            { value: 'pd', label: 'PD feedback' },
            { value: 'bangbang', label: 'Bang-bang' },
          ]}
        />
        <div style={{ height: 10 }} />
        <Toggle label="Overlay the other strategy" checked={p.compare} onChange={set('compare')} />

        <GroupLabel>Command</GroupLabel>
        <Slider label="Target angle θ1" value={p.theta1Deg} min={-90} max={90} step={1} unit="deg" onChange={set('theta1Deg')} hardMin={-180} hardMax={180} />

        <GroupLabel>PD gains {isPD ? '' : '(not used open loop)'}</GroupLabel>
        <Slider label="Kp" value={p.Kp} min={0.01} max={20} log step={0.01} unit="N m/rad" onChange={set('Kp')} disabled={!isPD} hardMax={1e4} />
        <Slider label="KD" value={p.KD} min={0.05} max={200} log step={0.01} unit="N m s/rad" onChange={set('KD')} disabled={!isPD} hardMax={1e5} />
        <p className="lab__derived mono">
          ωn {sig(pdT.wn, 3)} rad/s · ζ {sig(pdT.zeta, 3)}
        </p>

        <GroupLabel>Plant</GroupLabel>
        <Slider label="Inertia I (nominal)" value={p.I} min={5} max={500} log step={1} unit="kg m²" onChange={set('I')} hardMax={1e5} />
        <Slider
          label="Inertia error e"
          value={Math.round(p.inertiaErr * 1000) / 10}
          min={-50}
          max={50}
          step={1}
          unit="%"
          onChange={(v) => setParams({ inertiaErr: v / 100 })}
          hint={`True inertia ${sig(trueInertia(p), 4)} kg m²`}
        />
        <Slider label="Disturbance torque d" value={p.dist} min={-0.02} max={0.02} step={0.0005} unit="N m" onChange={set('dist')} hardMin={-1} hardMax={1} />

        <GroupLabel>Actuator</GroupLabel>
        <Segmented
          label="Actuator"
          full
          value={p.actuator}
          onChange={set('actuator')}
          options={[
            { value: 'wheel', label: 'Reaction wheel' },
            { value: 'thrusters', label: 'Thrusters' },
          ]}
        />
        <div style={{ height: 10 }} />
        <Slider label={isPD ? 'Torque limit' : 'Torque u*'} value={p.uMax} min={0.01} max={2} log step={0.01} unit="N m" onChange={set('uMax')} hardMax={100} />
        <Toggle label="Enforce torque limit (PD)" checked={p.torqueLimit} onChange={set('torqueLimit')} />
        <Slider label="Wheel inertia Iw" value={p.Iw} min={0.005} max={0.2} log step={0.001} unit="kg m²" onChange={set('Iw')} disabled={p.actuator !== 'wheel'} hardMax={10} />

        <button type="button" className="btn btn--ghost lab__reset" onClick={() => setParams({ ...DEFAULTS })}>
          Reset all
        </button>
      </Panel>

      <section className="lab__view" aria-label="3D view and playback">
        <SpacecraftView
          state={sceneState}
          label={`Spacecraft at ${fix(rad2deg(th), 1)} degrees, target ${p.theta1Deg} degrees, wheel at ${fix(radps2rpm(wheel), 0)} rpm`}
        />
        <div className="timeline">
          <button
            type="button"
            className="btn btn--primary timeline__play"
            onClick={() => {
              if (t >= tMax) setT(0);
              setPlaying(!playing);
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? 'Pause' : t >= tMax ? 'Replay' : 'Play'}
          </button>
          <input
            className="range timeline__scrub"
            type="range"
            min={0}
            max={tMax}
            step={tMax / 1000}
            value={t}
            aria-label="Scrub time"
            aria-valuetext={`${fix(t, 1)} seconds`}
            style={{ ['--fill' as string]: `${(100 * t) / tMax}%` }}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
          />
          <span className="timeline__time mono">
            {fix(t, 1)} / {fix(tMax, 1)} s
          </span>
          <Segmented label="Playback speed (times real time)" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={SPEEDS.map((s) => ({ value: String(s), label: `${s}x` }))} />
        </div>
        <p className="lab__caption dim">
          Amber ghost and marker: commanded attitude. White marker: current attitude. The wheel in the cutaway turns at the simulated wheel speed;
          past about 0.6 rad per frame it is drawn as a smear, like a camera shutter would.
        </p>
      </section>

      <div className="lab__side">
        <Panel title="Poles" meta={isPD ? 'I s² + KD s + Kp = 0' : 'I s² = 0'} id="rw-poles">
          <SPlanePlot
            sets={poleSets}
            height={200}
            minExtent={isPD ? 0.05 : 1}
            zetaLines={isPD && pdT.zeta < 1 ? [pdT.zeta] : undefined}
            summary={poleSets.map((s) => `${s.label}: ${s.points.map((z) => `${sig(z.re, 3)} ${z.im < 0 ? '-' : '+'} ${sig(Math.abs(z.im), 3)}j`).join(', ')}`).join('. ')}
          />
          {!isPD && <p className="dim lab__note">Two poles at the origin. Open loop there is nothing pulling the attitude back, which is why errors and disturbances stick.</p>}
        </Panel>
        <Panel title="Theory vs measured" meta={isPD ? 'formulas use nominal I' : 'plan uses nominal I'} flush id="rw-table">
          <table className="dtable tvm">
            <thead>
              <tr>
                <th>Quantity</th>
                <th className="num">Theory</th>
                <th className="num">Sim</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.flag ? 'is-off' : ''}>
                  <td>
                    <RichText text={r.label} />
                  </td>
                  <td className="num mono">
                    {r.theory} <span className="unit">{r.unit}</span>
                  </td>
                  <td className="num mono">
                    {r.measured} <span className="unit">{r.unit}</span>
                  </td>
                  <td className="tvm__note">
                    {r.flag ? <Status level="caution">{r.flag}</Status> : r.theory === 'n/a' || r.measured === 'n/a' ? <span className="faint">-</span> : <span className="faint">match</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="lab__plots">
        <Panel title="Attitude" meta="deg" flush>
          <div className="plotpad">
            <TimePlot
              series={series.theta}
              yLabel="θ"
              yUnit="deg"
              playhead={t}
              refLines={[{ y: p.theta1Deg, label: 'θ1' }]}
              band={isPD ? { y0: rad2deg(target) - rad2deg(settledBand), y1: rad2deg(target) + rad2deg(settledBand), label: '2% settling band' } : undefined}
              summary={`Attitude goes from 0 to ${fix(rad2deg(run.theta.at(-1)!), 2)} degrees over ${fix(tMax, 0)} seconds`}
            />
          </div>
        </Panel>
        <Panel title="Body rate" meta="deg/s" flush>
          <div className="plotpad">
            <TimePlot series={series.rate} yLabel="θ̇" yUnit="deg/s" playhead={t} summary={`Peak rate ${fix(Math.max(...run.rate.map((v) => Math.abs(rad2deg(v)))), 3)} deg/s`} />
          </div>
        </Panel>
        <Panel title="Control torque" meta="N m" flush>
          <div className="plotpad">
            <TimePlot
              series={series.u}
              yLabel="u"
              yUnit="N m"
              playhead={t}
              refLines={p.torqueLimit || !isPD ? [{ y: p.uMax, label: '+u max' }, { y: -p.uMax, label: '−u max' }] : undefined}
              summary={`Peak torque ${fix(Math.max(...run.u.map(Math.abs)), 3)} newton meters`}
            />
          </div>
        </Panel>
        <Panel title="Wheel speed" meta="rpm" flush>
          <div className="plotpad">
            <TimePlot
              series={series.rpm}
              yLabel="ωw"
              yUnit="rpm"
              playhead={t}
              summary={p.actuator === 'wheel' ? `Peak wheel speed ${fix(Math.max(...run.wheel.map((w) => Math.abs(radps2rpm(w)))), 0)} rpm` : 'Thrusters selected, wheel stays at zero'}
            />
          </div>
        </Panel>
      </div>

      <div className="lab__prac">{problemSlot}</div>
    </div>
  );
}

interface Row {
  label: string;
  unit: string;
  theory: string;
  measured: string;
  flag?: string;
}

function buildRows(p: RWParams, run: RWRun): Row[] {
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
  if (p.mode === 'pd') {
    const th = pdTheory(p);
    const m = measurePD(run, p);
    const sat = run.saturated;
    const ie = p.inertiaErr !== 0;
    const over = th.zeta >= 1;
    const why = (base?: string) => (sat ? 'torque limit hit' : ie ? 'true I differs' : base);
    const rows: Row[] = [
      {
        label: 'Overshoot $M_p$',
        unit: '%',
        theory: fix(th.overshoot, 2),
        measured: fix(m.overshoot, 2),
        flag: Math.abs(m.overshoot - th.overshoot) > 0.25 ? why(p.dist !== 0 ? 'final value shifted by d' : undefined) : undefined,
      },
      {
        label: 'Peak time $t_p$',
        unit: 's',
        theory: over ? 'none' : fix(th.peakTime, 2),
        measured: m.overshoot > 0.01 ? fix(m.peakTime, 2) : 'none',
        flag: !over && m.overshoot > 0.01 && rel(m.peakTime, th.peakTime) > 0.02 ? why() : undefined,
      },
      {
        label: 'Settling (2%) $t_s$',
        unit: 's',
        theory: fix(th.settlingTime, 1),
        measured: Number.isFinite(m.settlingTime) ? fix(m.settlingTime, 1) : 'not yet',
        flag: !Number.isFinite(m.settlingTime) ? 'did not settle in window' : rel(m.settlingTime, th.settlingTime) > 0.05 ? (sat || ie ? why() : over ? 'overdamped, 4/(ζωn) is off' : '4/(ζωn) is an estimate') : undefined,
      },
      {
        label: 'Final angle',
        unit: 'deg',
        theory: fix(th.finalAngleDeg, 3),
        measured: fix(m.finalAngleDeg, 3),
        flag: Math.abs(m.finalAngleDeg - th.finalAngleDeg) > 0.01 * Math.abs(p.theta1Deg) + 1e-3 ? 'still moving at window end' : undefined,
      },
      {
        label: 'Offset $\\theta_{ss}-\\theta_1$',
        unit: 'deg',
        theory: fix(th.offsetDeg, 3),
        measured: fix(m.offsetDeg, 3),
        flag: Math.abs(m.offsetDeg - th.offsetDeg) > 0.01 * Math.abs(p.theta1Deg) + 1e-3 ? 'still moving at window end' : undefined,
      },
      {
        label: 'Peak torque',
        unit: 'N m',
        theory: fix(th.initialTorque, 3),
        measured: fix(m.peakTorque, 3),
        flag: sat ? 'clipped at limit' : rel(m.peakTorque, th.initialTorque) > 0.02 ? 'disturbance adds torque' : undefined,
      },
      {
        label: 'Peak body rate',
        unit: 'deg/s',
        theory: over ? 'n/a' : fix(rad2deg(th.peakRate), 3),
        measured: fix(m.peakRateDegS, 3),
        flag: !over && rel(m.peakRateDegS, rad2deg(th.peakRate)) > 0.02 ? why('disturbance') : undefined,
      },
      {
        label: 'Peak wheel speed',
        unit: 'rpm',
        theory: over || p.actuator !== 'wheel' ? 'n/a' : fix(th.peakWheelRpm, 0),
        measured: p.actuator === 'wheel' ? fix(m.peakWheelRpm, 0) : 'n/a',
        flag: !over && p.actuator === 'wheel' && rel(m.peakWheelRpm, th.peakWheelRpm) > 0.02 ? why('disturbance') : undefined,
      },
    ];
    return rows;
  }
  const th = bangTheory(p);
  const m = measureBang(run);
  return [
    { label: 'Switch time $t_s$', unit: 's', theory: fix(th.ts, 2), measured: fix(run.tSwitch ?? NaN, 2) },
    {
      label: 'Peak rate',
      unit: 'deg/s',
      theory: fix(rad2deg(th.peakRateNominal), 3),
      measured: fix(m.peakRateDegS, 3),
      flag: rel(m.peakRateDegS, rad2deg(th.peakRateNominal)) > 0.005 ? (p.inertiaErr !== 0 ? 'true I differs' : 'disturbance') : undefined,
    },
    {
      label: 'Peak wheel speed',
      unit: 'rpm',
      theory: fix(th.peakWheelRpm, 0),
      measured: p.actuator === 'wheel' ? fix(m.peakWheelRpm, 0) : 'n/a',
      flag: p.actuator === 'wheel' && rel(m.peakWheelRpm, th.peakWheelRpm) > 0.005 ? 'disturbance' : undefined,
    },
    {
      label: 'Angle at $2t_s$',
      unit: 'deg',
      theory: fix(p.theta1Deg, 3),
      measured: fix(m.finalAngleDeg, 3),
      flag: Math.abs(m.finalAngleDeg - p.theta1Deg) > 0.005 * Math.abs(p.theta1Deg) ? (p.inertiaErr !== 0 ? `θ1/(1+e) = ${fix(th.finalAngleDeg, 2)}` : 'disturbance') : undefined,
    },
    {
      label: 'Rate at $2t_s$',
      unit: 'deg/s',
      theory: fix(0, 4),
      measured: fix(m.finalRateDegS, 4),
      flag: Math.abs(m.finalRateDegS) > 1e-4 ? 'drift, no feedback' : undefined,
    },
    {
      label: 'Angle at window end',
      unit: 'deg',
      theory: fix(p.theta1Deg, 3),
      measured: fix(m.angleAtEndDeg, 3),
      flag: Math.abs(m.angleAtEndDeg - p.theta1Deg) > 0.005 * Math.abs(p.theta1Deg) ? 'open loop cannot correct' : undefined,
    },
  ];
}
