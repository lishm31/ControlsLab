import type { ReactNode } from 'react';

export function Panel(props: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const headId = props.id ? `${props.id}-title` : undefined;
  return (
    <section className={`panel ${props.className ?? ''}`} aria-labelledby={headId} id={props.id}>
      <header className="panel__head">
        <h2 className="panel__title" id={headId}>
          {props.title}
        </h2>
        {props.meta !== undefined && <span className="panel__meta">{props.meta}</span>}
        {props.actions}
      </header>
      <div className={`panel__body ${props.flush ? 'panel__body--flush' : ''}`}>{props.children}</div>
    </section>
  );
}
