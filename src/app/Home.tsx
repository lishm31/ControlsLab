import { useEffect, useState } from 'react';
import { TOPIC_LABELS } from '../engine/types';
import { moduleSolved, topicSummaries } from '../engine/progress';
import { useProgress } from '../engine/useProgress';
import { COURSE_DATES, MODULES } from '../modules/manifest';
import { Panel } from '../ui/Panel';
import { Status } from '../ui/Telemetry';
import { href } from './router';

const DAY = 86400000;
const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
const daysUntil = (iso: string, now: Date) =>
  Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(now.toDateString() + ' 12:00').getTime()) / DAY);

export function Home() {
  const progress = useProgress();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const topics = topicSummaries(progress);
  const weak = topics.filter((t) => t.weak);
  const upcoming = COURSE_DATES.filter((d) => daysUntil(d.date, now) >= 0);

  return (
    <div className="page home">
      <div className="home__intro">
        <h1 className="home__title">Controls Lab</h1>
        <p className="dim">
          One module per lecture for the control half of Dynamics and Control. Each one has a sim, a visual, and practice problems you work by
          hand and then check against the sim.
        </p>
      </div>
      <div className="home__grid">
        <Panel title="Modules" meta={`${MODULES.filter((m) => m.status === 'live').length} / ${MODULES.length} live`} flush className="home__modules">
          <table className="dtable modtable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Lecture</th>
                <th>Module</th>
                <th className="num">Solved</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const live = m.status === 'live';
                const d = daysUntil(m.lectureDate, now);
                return (
                  <tr key={m.id} className={live ? 'is-live' : ''}>
                    <td className="mono">{m.code}</td>
                    <td className="mono dim">{fmtDate(m.lectureDate)}</td>
                    <td>
                      <a className="modtable__link" href={href.module(m.id)}>
                        {m.title}
                      </a>
                      <span className="modtable__blurb dim">{m.blurb}</span>
                    </td>
                    <td className="num mono">{live ? moduleSolved(progress, m.id) : ''}</td>
                    <td>
                      {live ? (
                        <Status level="ok">LIVE</Status>
                      ) : (
                        <Status level="idle">{d > 0 ? `T${'−'}${d}D` : 'QUEUED'}</Status>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <div className="home__side">
          <Panel title="Schedule" meta={now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}>
            <table className="dtable">
              <tbody>
                {upcoming.map((d) => {
                  const n = daysUntil(d.date, now);
                  return (
                    <tr key={d.label}>
                      <td className="mono dim">{fmtDate(d.date)}</td>
                      <td>{d.label}</td>
                      <td className="num mono">
                        {n === 0 ? (
                          <Status level="alarm">TODAY</Status>
                        ) : (
                          <Status level={n <= 3 ? 'caution' : 'idle'}>{`${n}D`}</Status>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          <Panel title="Weak topics" meta={weak.length ? `${weak.length} flagged` : 'none flagged'}>
            {topics.length === 0 ? (
              <p className="dim home__empty">No practice yet. Solve a few problems and this fills in.</p>
            ) : (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th className="num">Solved</th>
                    <th className="num">Recent</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((t) => (
                    <tr key={t.topic}>
                      <td>{TOPIC_LABELS[t.topic]}</td>
                      <td className="num mono">{t.solved}</td>
                      <td className="num mono">{Math.round(t.accuracy * 100)}%</td>
                      <td>{t.weak ? <Status level="caution">WEAK</Status> : <Status level="ok">OK</Status>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
