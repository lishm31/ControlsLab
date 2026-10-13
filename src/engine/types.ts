import type { Rng } from '../core/rng';

export type TopicId =
  | 'linear-systems'
  | 'feedback-basics'
  | 'laplace'
  | 'block-diagrams'
  | 'transfer-functions'
  | 'stability'
  | 'response-specs'
  | 'feedback-design'
  | 'spacecraft-attitude'
  | 'quadrotor'
  | 'state-space'
  | 'tf-ss-equivalence'
  | 'failures';

export const TOPIC_LABELS: Record<TopicId, string> = {
  'linear-systems': 'Linear systems',
  'feedback-basics': 'Feedback basics',
  laplace: 'Laplace transforms',
  'block-diagrams': 'Block diagrams',
  'transfer-functions': 'Transfer functions',
  stability: 'Stability',
  'response-specs': 'Response specs',
  'feedback-design': 'Feedback design',
  'spacecraft-attitude': 'Spacecraft attitude',
  quadrotor: 'Quadrotor control',
  'state-space': 'State space',
  'tf-ss-equivalence': 'TF / SS equivalence',
  failures: 'Failure analysis',
};

/** Pass if |x - x*| <= max(abs, rel * |x*|). */
export interface Tolerance {
  rel?: number;
  abs?: number;
}

export interface AnswerField {
  key: string;
  label: string; // plain text label, e.g. "Switch time"
  tex?: string; // optional symbol, e.g. "t_s"
  unit: string; // e.g. "s", "N m", "deg"
  tol: Tolerance;
}

export interface SolutionStep {
  text: string;
  tex?: string;
  value?: { v: number; unit: string };
}

export type FieldHint = 'sign' | 'factor-2' | 'deg-rad' | 'off';

export interface SpecResult {
  label: string;
  limit: string; // e.g. "<= 10 %"
  measured: number;
  unit: string;
  pass: boolean;
}

export interface CheckResult {
  pass: boolean;
  perField: Record<string, { pass: boolean; hint?: FieldHint; missing?: boolean }>;
  /** Design problems: what the sim measured with the student's answer. */
  simEvidence?: { specs: SpecResult[]; note?: string };
}

export interface Given {
  label: string;
  tex?: string;
  value: number;
  unit: string;
}

export interface ProblemInstance<SimParams = unknown> {
  generatorId: string;
  seed: number;
  kind: 'compute' | 'design';
  title: string;
  /** Prompt text. Spans wrapped in $...$ are typeset with KaTeX. */
  prompt: string;
  given: Given[];
  fields: AnswerField[];
  /** Hidden reference answer. The UI only calls this on check or explicit reveal. */
  solve(): Record<string, number>;
  steps(): SolutionStep[];
  check(input: Record<string, number>): CheckResult;
  /** Sim parameters that make the simulator play out this problem (optionally with the student's answer). */
  toSim(input?: Record<string, number>): Partial<SimParams>;
}

export interface ProblemGenerator<SimParams = unknown> {
  id: string;
  moduleId: string;
  topic: TopicId;
  title: string;
  difficulty: 1 | 2 | 3;
  generate(rng: Rng): ProblemInstance<SimParams>;
}
