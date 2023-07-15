type Prompt = {
  display: string;
  raw: string;
};

export type EvalHead = {
  prompts: Prompt[];
  vars: string[];
};

export type EvalRowOutput = {
  pass: boolean;
  score: number;
  text: string | object;
  prompt: string;
};

export type EvalRow = {
  outputs: EvalRowOutput[];
  vars: string[]; // model outputs
};

export type EvalTable = {
  head: EvalHead;
  body: EvalRow[];
};

export type FilterMode = 'all' | 'failures' | 'different';

export type { UnifiedConfig } from '../../../types';
