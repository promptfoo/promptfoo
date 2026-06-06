import { describe, expect, it, vi } from 'vitest';
import { withAbortSignal } from '../../../src/generation/shared/cancellableProvider';

import type { ApiProvider } from '../../../src/types/providers';

describe('withAbortSignal', () => {
  it('forwards the job signal and stops calls after cancellation', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'ok' });
    const provider = {
      id: () => 'test-provider',
      callApi,
    } as ApiProvider;
    const controller = new AbortController();
    const cancellable = withAbortSignal(provider, controller.signal);

    await cancellable.callApi('first', undefined, { includeLogProbs: true });
    expect(callApi).toHaveBeenCalledWith('first', undefined, {
      includeLogProbs: true,
      abortSignal: controller.signal,
    });

    controller.abort();
    await expect(cancellable.callApi('second')).rejects.toThrow();
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
