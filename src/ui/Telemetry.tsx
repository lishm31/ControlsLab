import type { ReactNode } from 'react';

export interface TelemetryItem {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Span two cells, for long values like a complex pair. */
  wide?: boolean;
}

export function TelemetryStrip({ items, label }: { items: TelemetryItem[]; label: string }) {
  return (
    <div className="telemetry" role="group" aria-label={label}>
      {items.map((it) => (
        <div className={`telemetry__cell${it.wide ? ' telemetry__cell--wide' : ''}`} key={it.label}>
          <span className="telemetry__label">{it.label}</span>
          <span className="telemetry__value">
            {it.value}
            {it.unit && <span className="unit">{it.unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export type StatusLevel = 'ok' | 'caution' | 'alarm' | 'idle';
export const Status = ({ level, children }: { level: StatusLevel; children: ReactNode }) => (
  <span className={`status status--${level}`}>{children}</span>
);
