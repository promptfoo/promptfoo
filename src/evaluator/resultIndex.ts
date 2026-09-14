import type { EvaluateResult } from '../types/index';

/** Canonical `testIdx:promptIdx` key used to dedupe/look up a result across the streaming,
 * recovery, and comparison paths. */
export function getResultIndexKey(result: Pick<EvaluateResult, 'testIdx' | 'promptIdx'>): string {
  return `${result.testIdx}:${result.promptIdx}`;
}
