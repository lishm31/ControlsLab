import { useCallback, useEffect, useState } from 'react';
import { LOADERS, MODULES } from '../modules/manifest';
import type { ModuleDefinition } from '../modules/types';
import { ProblemPanel } from '../ui/ProblemPanel';
import { href } from './router';

export function ModulePage({ id }: { id: string }) {
  const manifest = MODULES.find((m) => m.id === id);
  const [def, setDef] = useState<ModuleDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDef(null);
    setError(null);
    const loader = LOADERS[id];
    if (!loader) return;
    let alive = true;
    loader()
      .then((d) => alive && setDef(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!manifest) {
    return (
      <div className="page">
        <p>
          Unknown module. <a href={href.home}>Back to modules</a>.
        </p>
      </div>
    );
  }
  if (!LOADERS[id]) {
    return (
      <div className="page">
        <div className="panel">
          <div className="panel__body">
            <p className="mono dim">
              {manifest.code} / lecture {manifest.lectureDate}
            </p>
            <h1 className="mod-title">{manifest.title}</h1>
            <p>{manifest.blurb}</p>
            <p className="dim">Not built yet. Modules get built in lecture order.</p>
            <a className="btn" href={href.home}>
              Back to modules
            </a>
          </div>
        </div>
      </div>
    );
  }
  if (error) return <div className="page">Failed to load module: {error}</div>;
  if (!def) return <div className="page mono dim">Loading {manifest.code}...</div>;
  return <LoadedModule key={id} def={def} />;
}

function LoadedModule({ def }: { def: ModuleDefinition }) {
  const [params, setParamsState] = useState(def.defaults);
  const setParams = useCallback((patch: object) => setParamsState((p: object) => ({ ...p, ...patch })), []);
  const { Lab } = def;
  return (
    <Lab
      params={params}
      setParams={setParams}
      problemSlot={<ProblemPanel generators={def.problems} onLoadSim={setParams} />}
    />
  );
}
