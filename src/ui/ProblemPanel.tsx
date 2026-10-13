import { useMemo, useState } from 'react';
import { makeRng, randomSeed } from '../core/rng';
import { HINT_TEXT } from '../engine/check';
import type { CheckResult, ProblemGenerator } from '../engine/types';
import { recordAttempt, useProgress } from '../engine/useProgress';
import { sig } from './format';
import { Panel } from './Panel';
import { RichText, Tex } from './Tex';
import { Status } from './Telemetry';

interface Props<P> {
  generators: ProblemGenerator<P>[];
  onLoadSim: (patch: Partial<P>) => void;
}

export function ProblemPanel<P>({ generators, onLoadSim }: Props<P>) {
  const progress = useProgress();
  const [genIdx, setGenIdx] = useState(0);
  const [seed, setSeed] = useState(() => randomSeed());
  const gen = generators[genIdx];
  const inst = useMemo(() => gen.generate(makeRng(seed)), [gen, seed]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [revealState, setRevealState] = useState<'hidden' | 'confirm' | 'shown'>('hidden');
  const [loaded, setLoaded] = useState<string | null>(null);

  const reset = () => {
    setInputs({});
    setResult(null);
    setRevealState('hidden');
    setLoaded(null);
  };
  const newProblem = (idx = genIdx) => {
    setGenIdx(idx);
    setSeed(randomSeed());
    reset();
  };
  const parsed = () => {
    const out: Record<string, number> = {};
    for (const f of inst.fields) {
      const raw = (inputs[f.key] ?? '').trim().replace('−', '-');
      if (raw !== '') out[f.key] = Number(raw);
    }
    return out;
  };
  const check = () => {
    const r = inst.check(parsed());
    setResult(r);
    recordAttempt(gen, { correct: r.pass, revealed: false });
  };
  const reveal = () => {
    setRevealState('shown');
    recordAttempt(gen, { correct: false, revealed: true });
  };
  const load = (withAnswer: boolean) => {
    onLoadSim(inst.toSim(withAnswer ? parsed() : undefined));
    setLoaded(withAnswer ? 'Loaded your answer into the sim.' : 'Loaded the problem setup into the sim.');
  };
  const rec = progress.generators[gen.id];
  const anyInput = inst.fields.some((f) => (inputs[f.key] ?? '').trim() !== '');

  return (
    <Panel title="Practice" meta={`${rec?.solved ?? 0} solved / ${rec?.tries ?? 0} tries`} id="practice">
      <div className="pp">
        <label className="pp__pick">
          <span className="visually-hidden">Problem type</span>
          <select value={genIdx} onChange={(e) => newProblem(Number(e.target.value))}>
            {generators.map((g, i) => (
              <option key={g.id} value={i}>
                {`${i + 1}. ${g.title}${g.difficulty > 1 ? ' ' + '+'.repeat(g.difficulty - 1) : ''}`}
              </option>
            ))}
          </select>
        </label>

        <div className="pp__card">
          <div className="pp__kind mono">
            {inst.kind === 'design' ? 'DESIGN / judged by sim' : 'COMPUTE'} <span className="faint">seed {inst.seed}</span>
          </div>
          <p className="pp__prompt">
            <RichText text={inst.prompt} />
          </p>
          {inst.given.length > 0 && (
            <table className="dtable pp__given">
              <caption className="visually-hidden">Given values</caption>
              <tbody>
                {inst.given.map((g) => (
                  <tr key={g.label}>
                    <td>
                      {g.label} {g.tex && <Tex tex={g.tex} />}
                    </td>
                    <td className="num mono">
                      {sig(g.value, 4)} <span className="unit">{g.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form
          className="pp__answers"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          {inst.fields.map((f) => {
            const fr = result?.perField[f.key];
            return (
              <div className="pp__field" key={f.key}>
                <label htmlFor={`ans-${f.key}`}>
                  {f.label} {f.tex && <Tex tex={f.tex} />}
                </label>
                <span className="pp__inputwrap">
                  <input
                    id={`ans-${f.key}`}
                    className="numinput"
                    inputMode="decimal"
                    autoComplete="off"
                    value={inputs[f.key] ?? ''}
                    aria-invalid={fr ? !fr.pass : undefined}
                    onChange={(e) => {
                      setInputs({ ...inputs, [f.key]: e.target.value });
                      setResult(null);
                    }}
                  />
                  <span className="unit">{f.unit}</span>
                </span>
                {fr && (
                  <span className="pp__fb">
                    {fr.pass ? (
                      <Status level="ok">OK</Status>
                    ) : fr.missing ? (
                      <Status level="caution">MISSING</Status>
                    ) : (
                      <Status level="alarm">{HINT_TEXT[fr.hint ?? 'off']}</Status>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          <div className="pp__actions">
            <button type="submit" className="btn btn--primary" disabled={!anyInput}>
              Check
            </button>
            <button type="button" className="btn" onClick={() => load(false)}>
              Load into sim
            </button>
            <button type="button" className="btn" onClick={() => newProblem()}>
              New problem
            </button>
          </div>
        </form>

        {result && (
          <div className="pp__result" role="status">
            {result.pass ? (
              <Status level="ok">CORRECT</Status>
            ) : (
              <Status level="alarm">NOT YET</Status>
            )}
            {result.simEvidence && (
              <table className="dtable pp__evidence">
                <caption className="visually-hidden">Sim judgement</caption>
                <thead>
                  <tr>
                    <th>Spec</th>
                    <th className="num">Limit</th>
                    <th className="num">Sim</th>
                    <th className="num">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.simEvidence.specs.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="num mono">{s.limit}</td>
                      <td className="num mono">
                        {sig(s.measured, 3)} <span className="unit">{s.unit}</span>
                      </td>
                      <td className="num">{s.pass ? <Status level="ok">PASS</Status> : <Status level="alarm">FAIL</Status>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {result.simEvidence?.note && <p className="dim pp__note">{result.simEvidence.note}</p>}
            <button type="button" className="btn btn--ghost" onClick={() => load(true)}>
              Load my answer into sim
            </button>
          </div>
        )}
        {loaded && (
          <p className="dim pp__note" role="status">
            {loaded}
          </p>
        )}

        <div className="pp__reveal">
          {revealState === 'hidden' && (
            <button type="button" className="btn btn--ghost" onClick={() => setRevealState('confirm')}>
              Show solution
            </button>
          )}
          {revealState === 'confirm' && (
            <div className="pp__confirm" role="alertdialog" aria-label="Confirm reveal">
              <span>Revealing counts this one as not solved. Show the solution?</span>
              <span className="pp__actions">
                <button type="button" className="btn" onClick={reveal} autoFocus>
                  Show it
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setRevealState('hidden')}>
                  Keep working
                </button>
              </span>
            </div>
          )}
          {revealState === 'shown' && (
            <ol className="pp__steps">
              {inst.steps().map((s, i) => (
                <li key={i}>
                  <span>{s.text}</span>
                  {s.tex && <Tex tex={s.tex} display />}
                  {s.value && (
                    <span className="mono pp__val">
                      = {sig(s.value.v, 4)} <span className="unit">{s.value.unit}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Panel>
  );
}
