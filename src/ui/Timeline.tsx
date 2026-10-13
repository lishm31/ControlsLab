import { Segmented } from './Controls';
import { fix } from './format';
import type { Playback } from './usePlayback';

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20, 50];

export function Timeline({ pb, speeds }: { pb: Playback; speeds?: number[] }) {
  const { t, tMax, playing } = pb;
  const opts = (speeds ?? SPEEDS.filter((s) => s >= pb.speed / 4 && s <= pb.speed * 4)).map((s) => ({ value: String(s), label: `${s}x` }));
  return (
    <div className="timeline">
      <button
        type="button"
        className="btn btn--primary timeline__play"
        onClick={() => {
          if (t >= tMax) pb.setT(0);
          pb.setPlaying(!playing);
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
        aria-valuetext={`${fix(t, 2)} seconds`}
        style={{ ['--fill' as string]: `${(100 * t) / tMax}%` }}
        onChange={(e) => {
          pb.setPlaying(false);
          pb.setT(Number(e.target.value));
        }}
      />
      <span className="timeline__time mono">
        {fix(t, 2)} / {fix(tMax, 1)} s
      </span>
      <Segmented label="Playback speed (times real time)" value={String(pb.speed)} onChange={(v) => pb.setSpeed(Number(v))} options={opts} />
    </div>
  );
}
