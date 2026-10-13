import type { ComponentType, ReactNode } from 'react';
import type { ProblemGenerator, TopicId } from '../engine/types';

export interface ModuleManifest {
  id: string; // 'c02-reaction-wheel'
  code: string; // 'C-2'
  title: string;
  lecture: string; // lecture title from the syllabus
  lectureDate: string; // ISO date
  topics: TopicId[];
  status: 'live' | 'planned';
  blurb: string;
}

export interface LabProps<SimParams> {
  params: SimParams;
  setParams: (patch: Partial<SimParams>) => void;
  /** Practice problem panel, rendered by the shell and placed by the module layout. */
  problemSlot: ReactNode;
}

export interface ModuleDefinition<SimParams = any> {
  manifest: ModuleManifest;
  defaults: SimParams;
  Lab: ComponentType<LabProps<SimParams>>;
  problems: ProblemGenerator<SimParams>[];
}
