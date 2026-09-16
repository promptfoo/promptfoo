import { updateSignalFile, updateSignalFileForDeletedEvals } from '../database/signal';
import { clearStandaloneEvalCache } from '../util/standaloneEvalCache';
import { clearCountCache } from './evalPerformance';

/**
 * Drops this process's cached eval aggregates so the next read re-queries the DB.
 * Always clears the standalone-eval LRU (keyed by filter combos, no per-eval granularity)
 * and the count cache for `evalId` (or every eval's counts when `evalId` is omitted).
 * Use this for in-process cache coherence only — it does NOT notify the view server.
 */
export function invalidateEvaluationCache(evalId?: string): void {
  clearStandaloneEvalCache();
  clearCountCache(evalId);
}

/**
 * Like {@link invalidateEvaluationCache} but for several evals at once: clears the standalone-eval
 * LRU once (it has no per-eval granularity, so repeating it per id is wasteful) and the count
 * cache for each id.
 */
export function invalidateEvaluationCaches(evalIds: string[]): void {
  clearStandaloneEvalCache();
  for (const id of evalIds) {
    clearCountCache(id);
  }
}

/**
 * Call after creating or mutating an eval's data (results, prompts, ratings). Invalidates
 * this process's caches and writes a scoped update signal so a running `promptfoo view`
 * server refreshes clients viewing this eval (and the root route, which follows the latest).
 */
export function notifyEvaluationChanged(evalId?: string): void {
  invalidateEvaluationCache(evalId);
  updateSignalFile(evalId);
}

/**
 * Call after deleting one or more evals. Invalidates this process's caches and writes a
 * delete signal so the view server can navigate clients off the removed evals. Pass no
 * argument (or omit ids) for "all evals deleted".
 */
export function notifyEvaluationsDeleted(evalIds?: string[]): void {
  // The eval list changed, so always refresh the standalone-eval cache. Only the deleted evals'
  // counts go stale, so scope the count-cache clear to them; a full clear (no id) is reserved
  // for the "all evals deleted" case.
  if (evalIds) {
    invalidateEvaluationCaches(evalIds);
  } else {
    invalidateEvaluationCache();
  }
  updateSignalFileForDeletedEvals(evalIds);
}
