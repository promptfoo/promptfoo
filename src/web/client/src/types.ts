export type EvalHead = {
  prompts: string[];
  vars: string[];
};

export type EvalRow = {
  outputs: string[]; // var inputs
  vars: string[]; // model outputs
};

export type EvalTable = {
  head: EvalHead;
  body: EvalRow[];
};

export type FilterMode = 'all' | 'failures';

export type { UnifiedConfig } from '../../../types';
