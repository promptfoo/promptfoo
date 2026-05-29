import { updateSignalFile } from '../database/signal';
import { clearStandaloneEvalCache } from '../util/standaloneEvalCache';

export function invalidateEvaluationCache(): void {
  clearStandaloneEvalCache();
}

export function notifyEvaluationChanged(evalId?: string): void {
  invalidateEvaluationCache();
  updateSignalFile(evalId);
}
