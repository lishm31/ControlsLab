import { describe, expect, it } from 'vitest';
import { checkFields, diagnose, withinTol } from '../check';
import { empty, load, record, save, topicSummaries, type StorageLike } from '../progress';

describe('tolerance checking', () => {
  it('uses max(abs, rel*|ref|)', () => {
    expect(withinTol(1.019, 1, { rel: 0.02 })).toBe(true);
    expect(withinTol(1.021, 1, { rel: 0.02 })).toBe(false);
    expect(withinTol(0.004, 0, { rel: 0.02, abs: 0.005 })).toBe(true);
    expect(withinTol(NaN, 1, { rel: 1 })).toBe(false);
  });
  it('diagnoses common slips', () => {
    expect(diagnose(-2, 2, { rel: 0.02 })).toBe('sign');
    expect(diagnose(1, 2, { rel: 0.02 })).toBe('factor-2');
    expect(diagnose(30, 30 * (Math.PI / 180), { rel: 0.02 })).toBe('deg-rad');
    expect(diagnose(7, 2, { rel: 0.02 })).toBe('off');
  });
  it('checks each field and flags missing ones', () => {
    const fields = [
      { key: 'a', label: 'a', unit: '', tol: { rel: 0.01 } },
      { key: 'b', label: 'b', unit: '', tol: { rel: 0.01 } },
    ];
    const r = checkFields(fields, { a: 1 }, { a: 1, b: 2 });
    expect(r.pass).toBe(false);
    expect(r.perField.a.pass).toBe(true);
    expect(r.perField.b.missing).toBe(true);
  });
});

describe('progress', () => {
  const gen = { id: 'g1', topic: 'feedback-basics' as const, moduleId: 'm' };
  it('records attempts and reveals', () => {
    let s = empty();
    s = record(s, gen, { correct: false, revealed: false }, 1);
    s = record(s, gen, { correct: true, revealed: false }, 2);
    s = record(s, gen, { correct: false, revealed: true }, 3);
    const g = s.generators.g1;
    expect([g.tries, g.solved, g.revealed]).toEqual([2, 1, 1]);
    const [t] = topicSummaries(s);
    expect(t.weak).toBe(true); // last event was a reveal
  });
  it('flags low accuracy and clears when solving', () => {
    let s = empty();
    for (let i = 0; i < 3; i++) s = record(s, gen, { correct: false, revealed: false }, i);
    expect(topicSummaries(s)[0].weak).toBe(true);
    for (let i = 3; i < 13; i++) s = record(s, gen, { correct: true, revealed: false }, i);
    expect(topicSummaries(s)[0].weak).toBe(false);
  });
  it('survives broken or blocked storage', () => {
    const broken: StorageLike = {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(load(broken)).toEqual(empty());
    expect(() => save(empty(), broken)).not.toThrow();
    expect(load(null)).toEqual(empty());
    const mem = new Map<string, string>();
    const ok: StorageLike = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
    save(record(empty(), gen, { correct: true, revealed: false }), ok);
    expect(load(ok).generators.g1.solved).toBe(1);
  });
});
