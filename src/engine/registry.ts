/** All problem generators from modules that are live, for Exam Mode and the progress view. */
import { LOADERS, MODULES } from '../modules/manifest';
import type { ProblemGenerator } from './types';

export async function loadAllGenerators(today = new Date()): Promise<ProblemGenerator[]> {
  const live = MODULES.filter((m) => m.status === 'live' && LOADERS[m.id] && new Date(m.lectureDate) <= today);
  const defs = await Promise.all(live.map((m) => LOADERS[m.id]()));
  return defs.flatMap((d) => d.problems);
}
