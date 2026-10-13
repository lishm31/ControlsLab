import { MODULES } from '../manifest';
import type { ModuleDefinition } from '../types';
import { Lab } from './Lab';
import { DEFAULTS, type LSParams } from './model';
import { PROBLEMS } from './problems';

const def: ModuleDefinition<LSParams> = {
  manifest: MODULES.find((m) => m.id === 'c01-linear-systems')!,
  defaults: DEFAULTS,
  Lab,
  problems: PROBLEMS,
};
export default def;
