import { EvaluateResult, TokenUsage } from '../../../types';

type Prompt = {
  display: string;
  raw: string;
};

export type EvalHead = {
  prompts: Prompt[];
  vars: string[];
};

// TODO(ian): Remove this and replace with EvaluateResult
export type EvalRowOutput = {
  pass: boolean;
  score: number;
  text: string | object;
  prompt: string;
  latencyMs: number;
  tokenUsage?: Partial<TokenUsage>;
  gradingResult: EvaluateResult['gradingResult'];
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
