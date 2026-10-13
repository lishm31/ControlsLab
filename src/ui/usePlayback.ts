import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../app/theme';

/**
 * Sim-time playback: play/pause, scrub, speed. Restarts when `resetKey` changes.
 * With reduced motion it does not autoplay and starts at the end state.
 */
export function usePlayback(tMax: number, resetKey: unknown, targetSeconds = 10) {
  const reduced = useMemo(prefersReducedMotion, []);
  const pickSpeed = (tm: number) => {
    const raw = tm / targetSeconds;
    const opts = [0.25, 0.5, 1, 2, 5, 10, 20, 50];
    return opts.find((s) => s >= raw) ?? opts[opts.length - 1];
  };
  const [speed, setSpeed] = useState(() => pickSpeed(tMax));
  const [t, setT] = useState(reduced ? tMax : 0);
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    setSpeed(pickSpeed(tMax));
    setT(reduced ? tMax : 0);
    setPlaying(!reduced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, tMax, reduced]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
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

  return { t, setT, playing, setPlaying, speed, setSpeed, tMax, reduced };
}

export type Playback = ReturnType<typeof usePlayback>;
