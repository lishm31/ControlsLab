import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../app/theme';
import { type SlewState, SlewScene, webglAvailable } from './SlewScene';

export function SpacecraftView({ state, label }: { state: SlewState; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SlewScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    if (!webglAvailable()) {
      setFailed(true);
      return;
    }
    try {
      scene.current = new SlewScene(host.current, { reducedMotion: prefersReducedMotion() });
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update(state);
  }, [state]);

  return (
    <div className="scene3d" role="img" aria-label={label}>
      <div className="scene3d__host" ref={host} />
      {failed && <p className="scene3d__fallback mono">3D view needs WebGL, which is not available here. Plots and telemetry still work.</p>}
      <button type="button" className="btn btn--ghost scene3d__reset" onClick={() => scene.current?.resetView()}>
        Reset view
      </button>
    </div>
  );
}
