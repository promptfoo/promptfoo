import type { Prompt, EvaluateTableOutput } from '@/../../../types';

export type EvalHead = {
  prompts: Prompt[];
  vars: string[];
};

export type EvalRow = {
  outputs: EvaluateTableOutput[];
  vars: string[]; // model outputs
};

export type EvalTable = {
  head: EvalHead;
  body: EvalRow[];
};

export type FilterMode = 'all' | 'failures' | 'different';

export * from '@/../../../types';
