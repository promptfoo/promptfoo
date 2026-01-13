import type { EvaluateOptions, TestSuite } from '../validators/config';
import type { AtomicTestCase } from '../validators/test_cases';
import type { Prompt } from './prompts';
import type { ApiProvider } from './providers';
import type { NunjucksFilterMap, VarValue } from './shared';

export type EvalConversations = Record<
  string,
  { prompt: string | object; input: string; output: string | object; metadata?: object }[]
>;

export type EvalRegisters = Record<string, VarValue>;

export interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;
  delay: number;

  test: AtomicTestCase;
  testSuite?: TestSuite;
  nunjucksFilters?: NunjucksFilterMap;
  evaluateOptions?: EvaluateOptions;

  testIdx: number;
  promptIdx: number;
  repeatIndex: number;

  conversations?: EvalConversations;
  registers?: EvalRegisters;
  isRedteam: boolean;

  concurrency?: number;

  /**
   * Evaluation ID for tracking blob references in the database.
   * When set, allows blob storage to record references for access control.
   */
  evalId?: string;

  /**
   * AbortSignal that can be used to cancel the evaluation
   * This is passed to the provider's callApi function
   */
  abortSignal?: AbortSignal;
}
