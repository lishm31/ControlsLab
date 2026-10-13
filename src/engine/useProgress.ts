/** Tiny external store around progress.ts so every view sees the same state. */
import { useSyncExternalStore } from 'react';
import { type ProgressState, load, record, save } from './progress';
import type { TopicId } from './types';

let state: ProgressState = load();
const listeners = new Set<() => void>();

export function recordAttempt(gen: { id: string; topic: TopicId; moduleId: string }, event: { correct: boolean; revealed: boolean }) {
  state = record(state, gen, event);
  save(state);
  listeners.forEach((l) => l());
}

export function useProgress(): ProgressState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
