import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSignalFile } from '../../src/database/signal';
import { invalidateEvaluationCache, notifyEvaluationChanged } from '../../src/models/evalMutation';
import { clearStandaloneEvalCache } from '../../src/util/standaloneEvalCache';

vi.mock('../../src/database/signal', () => ({
  updateSignalFile: vi.fn(),
}));

vi.mock('../../src/util/standaloneEvalCache', () => ({
  clearStandaloneEvalCache: vi.fn(),
}));

describe('eval mutation invalidation', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('invalidates the standalone evaluation cache', () => {
    invalidateEvaluationCache();

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    expect(updateSignalFile).not.toHaveBeenCalled();
  });

  it('invalidates cached evaluation lists before notifying watchers', () => {
    notifyEvaluationChanged('eval-123');

    expect(clearStandaloneEvalCache).toHaveBeenCalledOnce();
    expect(updateSignalFile).toHaveBeenCalledWith('eval-123');
    expect(vi.mocked(clearStandaloneEvalCache).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateSignalFile).mock.invocationCallOrder[0],
    );
  });
});
