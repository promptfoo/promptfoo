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

  it('invalidates all cached evaluations before notifying watchers about deletions', () => {
    notifyEvaluationsDeleted(['eval-123']);

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    expect(clearCountCache).toHaveBeenCalledWith(undefined);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith(['eval-123']);
  });
});
