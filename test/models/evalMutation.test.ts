import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSignalFile, updateSignalFileForDeletedEvals } from '../../src/database/signal';
import {
  invalidateEvaluationCache,
  notifyEvaluationChanged,
  notifyEvaluationsDeleted,
} from '../../src/models/evalMutation';
import { clearCountCache } from '../../src/models/evalPerformance';
import { clearStandaloneEvalCache } from '../../src/util/standaloneEvalCache';

vi.mock('../../src/database/signal', () => ({
  updateSignalFile: vi.fn(),
  updateSignalFileForDeletedEvals: vi.fn(),
}));

vi.mock('../../src/util/standaloneEvalCache', () => ({
  clearStandaloneEvalCache: vi.fn(),
}));

vi.mock('../../src/models/evalPerformance', () => ({
  clearCountCache: vi.fn(),
}));

describe('eval mutation invalidation', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('invalidates the standalone evaluation cache', () => {
    invalidateEvaluationCache();

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    expect(clearCountCache).toHaveBeenCalledWith(undefined);
    expect(updateSignalFile).not.toHaveBeenCalled();
  });

  it('invalidates cached evaluation lists before notifying watchers', () => {
    notifyEvaluationChanged('eval-123');

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    expect(clearCountCache).toHaveBeenCalledWith('eval-123');
    expect(updateSignalFile).toHaveBeenCalledWith('eval-123');
    expect(vi.mocked(clearStandaloneEvalCache).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateSignalFile).mock.invocationCallOrder[0],
    );
  });

  it('clears the standalone cache and only the deleted evals counts before notifying watchers', () => {
    notifyEvaluationsDeleted(['eval-123', 'eval-456']);

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    // Scoped to the deleted evals — a single delete must not flush every eval's count cache.
    expect(clearCountCache).toHaveBeenCalledWith('eval-123');
    expect(clearCountCache).toHaveBeenCalledWith('eval-456');
    expect(clearCountCache).not.toHaveBeenCalledWith(undefined);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith(['eval-123', 'eval-456']);
  });

  it('flushes every count cache when all evals are deleted (no ids)', () => {
    notifyEvaluationsDeleted();

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    // A single unscoped clearCountCache() call wipes every eval's counts.
    expect(clearCountCache).toHaveBeenCalledTimes(1);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith(undefined);
  });
});
