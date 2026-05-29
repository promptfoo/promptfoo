import { updateSignalFile } from '../database/signal';
import { clearStandaloneEvalCache } from '../util/standaloneEvalCache';
import { clearCountCache } from './evalPerformance';

export function invalidateEvaluationCache(evalId?: string): void {
  clearStandaloneEvalCache();
  clearCountCache(evalId);
}

export function notifyEvaluationChanged(evalId?: string): void {
  invalidateEvaluationCache(evalId);
  updateSignalFile(evalId);
}
