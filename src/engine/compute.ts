/** Helper for the common "compute these numbers" problem: tolerance check against a reference answer. */
import { checkFields } from './check';
import type { AnswerField, Given, ProblemInstance, SolutionStep } from './types';

export function computeProblem<P>(x: {
  generatorId: string;
  seed: number;
  title: string;
  prompt: string;
  given: Given[];
  fields: AnswerField[];
  answer: Record<string, number>;
  steps: () => SolutionStep[];
  toSim: (input?: Record<string, number>) => Partial<P>;
}): ProblemInstance<P> {
  return {
    generatorId: x.generatorId,
    seed: x.seed,
    kind: 'compute',
    title: x.title,
    prompt: x.prompt,
    given: x.given,
    fields: x.fields,
    solve: () => ({ ...x.answer }),
    steps: x.steps,
    check: (input) => checkFields(x.fields, input, x.answer),
    toSim: x.toSim,
  };
}

/** Round to n significant figures, so given values look like homework numbers. */
export const sf = (v: number, n = 3) => Number(v.toPrecision(n));
