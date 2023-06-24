export type EvalHead = {
  prompts: string[];
  vars: string[];
};

export type EvalRowOutput = {
  pass: boolean;
  score: number;
  text: string;
};

export type EvalRow = {
  outputs: EvalRowOutput[];
  vars: string[]; // model outputs
};

export type EvalTable = {
  head: EvalHead;
  body: EvalRow[];
};

export type FilterMode = 'all' | 'failures';

export type { UnifiedConfig } from '../../../types';
