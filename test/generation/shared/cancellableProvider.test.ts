import { describe, expect, it, vi } from 'vitest';
import { withAbortSignal } from '../../../src/generation/shared/cancellableProvider';

import type { ApiProvider } from '../../../src/types/providers';

describe('withAbortSignal', () => {
  it('returns the original provider when no signal is supplied', () => {
    const provider = {
      id: () => 'test-provider',
      callApi: vi.fn(),
    } as ApiProvider;

    expect(withAbortSignal(provider, undefined)).toBe(provider);
  });

  it('preserves provider properties and binds methods to the provider', () => {
    const provider = {
      config: { label: 'bound-provider' },
      id() {
        return this.config.label;
      },
      callApi: vi.fn(),
    } as ApiProvider;
    const wrapped = withAbortSignal(provider, new AbortController().signal);

    expect(wrapped.config).toBe(provider.config);
    expect(wrapped.id()).toBe('bound-provider');
  });

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

    await cancellable.callApi('without-options');
    expect(callApi).toHaveBeenLastCalledWith('without-options', undefined, {
      abortSignal: controller.signal,
    });

    controller.abort();
    await expect(cancellable.callApi('second')).rejects.toThrow();
    expect(callApi).toHaveBeenCalledTimes(2);
  });
});
