// Placeholder until the module lands in the next commits.
import type { ModuleDefinition } from '../types';
import { MODULES } from '../manifest';

const def: ModuleDefinition<Record<string, never>> = {
  manifest: MODULES.find((m) => m.id === 'c02-reaction-wheel')!,
  defaults: {},
  Lab: () => null,
  problems: [],
};
export default def;
