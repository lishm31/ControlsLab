import { type ReactNode, useEffect, useId, useState } from 'react';
import { sig } from './format';

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Range the typed value may take (defaults to min..max). Lets problems load values off the slider scale. */
  hardMin?: number;
  hardMax?: number;
  log?: boolean;
  digits?: number;
  disabled?: boolean;
  hint?: string;
}

const LOG_STEPS = 1000;

export function Slider(p: SliderProps) {
  const id = useId();
  const [text, setText] = useState(sig(p.value, p.digits ?? 4));
  useEffect(() => setText(sig(p.value, p.digits ?? 4)), [p.value, p.digits]);

  const toPos = (v: number) =>
    p.log ? (Math.log(Math.max(v, p.min) / p.min) / Math.log(p.max / p.min)) * LOG_STEPS : Math.min(p.max, Math.max(p.min, v));
  const fromPos = (x: number) => {
    if (!p.log) return x;
    const v = p.min * (p.max / p.min) ** (x / LOG_STEPS);
    // Snap log values to 3 significant figures so readouts stay clean.
    return Number(v.toPrecision(3));
  };
  const pos = toPos(p.value);
  const lo = p.log ? 0 : p.min;
  const hi = p.log ? LOG_STEPS : p.max;
  const fill = `${(100 * (Math.min(hi, Math.max(lo, pos)) - lo)) / (hi - lo)}%`;

  const commit = () => {
    const v = Number(text.replace('−', '-'));
    const hmin = p.hardMin ?? p.min;
    const hmax = p.hardMax ?? p.max;
    if (Number.isFinite(v)) p.onChange(Math.min(hmax, Math.max(hmin, v)));
    else setText(sig(p.value, p.digits ?? 4));
  };

  return (
    <div className="field">
      <div className="field__row">
        <label className="field__label" htmlFor={id}>
          {p.label}
        </label>
        <span className="field__value">
          <input
            className="numinput"
            aria-label={typeof p.label === 'string' ? `${p.label} value` : 'value'}
            inputMode="decimal"
            value={text}
            disabled={p.disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <span className="unit">{p.unit ?? ''}</span>
        </span>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={lo}
        max={hi}
        step={p.log ? 1 : p.step}
        value={pos}
        disabled={p.disabled}
        style={{ ['--fill' as string]: fill }}
        aria-valuetext={`${sig(p.value)} ${p.unit ?? ''}`}
        onChange={(e) => p.onChange(fromPos(Number(e.target.value)))}
      />
      {p.hint && <span className="faint" style={{ fontSize: 11 }}>{p.hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>(p: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`seg ${p.full ? 'seg--full' : ''}`} role="group" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === p.value} onClick={() => p.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(p: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; on?: string; off?: string }) {
  return (
    <label className="toggle">
      <span>{p.label}</span>
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span className="toggle__box" aria-hidden="true">
        {p.checked ? (p.on ?? 'ON') : (p.off ?? 'OFF')}
      </span>
    </label>
  );
}

export const GroupLabel = ({ children }: { children: ReactNode }) => <div className="group-label">{children}</div>;
