/**
 * Practice progress in localStorage. Every access is wrapped so the lab still works
 * with storage blocked (private windows, previews). Schema is versioned.
 */
import type { TopicId } from './types';

export const STORAGE_KEY = 'controlslab.v1';

export interface Attempt {
  ts: number;
  correct: boolean;
  revealed: boolean;
}

export interface GeneratorRecord {
  topic: TopicId;
  moduleId: string;
  tries: number;
  solved: number;
  revealed: number;
  history: Attempt[]; // most recent last, capped
}

export interface ProgressState {
  version: 1;
  generators: Record<string, GeneratorRecord>;
}

const HISTORY_CAP = 20;
export const empty = (): ProgressState => ({ version: 1, generators: {} });

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function load(storage: StorageLike | null = defaultStorage()): ProgressState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || typeof parsed.generators !== 'object') return empty();
    return parsed as ProgressState;
  } catch {
    return empty();
  }
}

export function save(state: ProgressState, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: progress just is not kept this session.
  }
}

/** Pure update: record a check (correct or not) or a reveal. */
export function record(
  state: ProgressState,
  gen: { id: string; topic: TopicId; moduleId: string },
  event: { correct: boolean; revealed: boolean },
  now = Date.now(),
): ProgressState {
  const prev = state.generators[gen.id] ?? { topic: gen.topic, moduleId: gen.moduleId, tries: 0, solved: 0, revealed: 0, history: [] };
  const next: GeneratorRecord = {
    ...prev,
    tries: prev.tries + (event.revealed ? 0 : 1),
    solved: prev.solved + (event.correct && !event.revealed ? 1 : 0),
    revealed: prev.revealed + (event.revealed ? 1 : 0),
    history: [...prev.history, { ts: now, ...event }].slice(-HISTORY_CAP),
  };
  return { ...state, generators: { ...state.generators, [gen.id]: next } };
}

export interface TopicSummary {
  topic: TopicId;
  attempts: number;
  solved: number;
  accuracy: number; // over the recent window, reveals count as misses
  weak: boolean;
  reason?: string;
}

/**
 * A topic is weak if recent accuracy is under 70% (with at least 3 attempts) or the
 * most recent event on any of its problems was a reveal.
 */
export function topicSummaries(state: ProgressState): TopicSummary[] {
  const byTopic = new Map<TopicId, GeneratorRecord[]>();
  for (const g of Object.values(state.generators)) byTopic.set(g.topic, [...(byTopic.get(g.topic) ?? []), g]);
  const out: TopicSummary[] = [];
  for (const [topic, gens] of byTopic) {
    const recent = gens.flatMap((g) => g.history).sort((a, b) => a.ts - b.ts).slice(-10);
    const good = recent.filter((a) => a.correct && !a.revealed).length;
    const accuracy = recent.length ? good / recent.length : 0;
    const lastReveal = gens.some((g) => g.history.at(-1)?.revealed);
    const weak = (recent.length >= 3 && accuracy < 0.7) || lastReveal;
    out.push({
      topic,
      attempts: gens.reduce((s, g) => s + g.tries, 0),
      solved: gens.reduce((s, g) => s + g.solved, 0),
      accuracy,
      weak,
      reason: weak ? (lastReveal ? 'Revealed a solution without solving it after' : `Recent accuracy ${Math.round(accuracy * 100)}%`) : undefined,
    });
  }
  return out.sort((a, b) => Number(b.weak) - Number(a.weak) || a.accuracy - b.accuracy);
}

export function moduleSolved(state: ProgressState, moduleId: string): number {
  return Object.values(state.generators)
    .filter((g) => g.moduleId === moduleId)
    .reduce((s, g) => s + g.solved, 0);
}
