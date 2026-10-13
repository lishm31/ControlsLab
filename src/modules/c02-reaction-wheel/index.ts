import { MODULES } from '../manifest';
import type { ModuleDefinition } from '../types';
import { Lab } from './Lab';
import { DEFAULTS, type RWParams } from './model';
import { PROBLEMS } from './problems';

const def: ModuleDefinition<RWParams> = {
  manifest: MODULES.find((m) => m.id === 'c02-reaction-wheel')!,
  defaults: DEFAULTS,
  Lab,
  problems: PROBLEMS,
};
export default def;
