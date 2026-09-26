import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviderSetupCheck } from '../../src/evaluator/providerSetup';

import type { ApiProvider, CallApiContextParams } from '../../src/types/providers';

type SetupResult = Awaited<ReturnType<NonNullable<ApiProvider['checkSetup']>>>;

const context: CallApiContextParams = { prompt: { raw: '', label: '' }, vars: {} };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function providerWithSetup(checkSetup: NonNullable<ApiProvider['checkSetup']>): ApiProvider {
  return {
    id: () => 'local-setup-test',
    checkSetupOnEval: true,
    checkSetup,
    callApi: vi.fn<ApiProvider['callApi']>(),
  };
}

describe('provider setup cancellation boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not enter setup when its caller is already canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = providerWithSetup(vi.fn());

    await expect(
      createProviderSetupCheck()(provider, context, {
        abortSignal: controller.signal,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('Operation cancelled');

    expect(provider.checkSetup).not.toHaveBeenCalled();
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('interrupts noncooperative setup, forwards cancellation, and removes its resources', async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(() => new Promise(() => {}));
    const provider = providerWithSetup(setup);
    const pending = createProviderSetupCheck()(provider, context, {
      abortSignal: controller.signal,
      timeoutMs: 1000,
    });
    const rejected = expect(pending).rejects.toThrow('Operation cancelled');
    await Promise.resolve();
    const forwardedSignal = setup.mock.calls[0][1]?.abortSignal;
    expect(forwardedSignal?.aborted).toBe(false);

    controller.abort(new Error('User canceled'));
    await rejected;

    expect(forwardedSignal?.aborted).toBe(true);
    expect(forwardedSignal?.reason).toBe(controller.signal.reason);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a hanging check and reuses its zero-request deadline failure', async () => {
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(() => new Promise(() => {}));
    const provider = providerWithSetup(setup);
    const check = createProviderSetupCheck();
    const pending = check(provider, context, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response).toMatchObject({
      error: expect.stringContaining('timed out after 1000ms'),
      incurredCost: 0,
      tokenUsage: { numRequests: 0 },
      metadata: { providerSetup: { workloadStarted: false } },
    });
    expect(setup.mock.calls[0][1]?.abortSignal?.aborted).toBe(true);
    expect(await check(provider, context)).toEqual(response);
    expect(setup).toHaveBeenCalledOnce();
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline and detaches cancellation after successful setup', async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>().mockResolvedValue({
      success: true,
      message: 'Local setup ready',
    });

    await expect(
      createProviderSetupCheck()(providerWithSetup(setup), context, {
        abortSignal: controller.signal,
        timeoutMs: 1000,
      }),
    ).resolves.toBeUndefined();
    controller.abort();

    expect(setup.mock.calls[0][1]?.abortSignal?.aborted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('consumes a late provider rejection without changing the recorded timeout', async () => {
    const late = deferred<SetupResult>();
    const provider = providerWithSetup(vi.fn(() => late.promise));
    const check = createProviderSetupCheck();
    const pending = check(provider, context, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    late.reject(new Error('Late SDK shutdown failure'));
    await vi.advanceTimersByTimeAsync(0);

    expect(await check(provider, context)).toEqual(response);
    expect(response?.error).toContain('timed out after 1000ms');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not cache a canceled attempt as evidence for a later caller', async () => {
    const controller = new AbortController();
    const setup = vi
      .fn<NonNullable<ApiProvider['checkSetup']>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ success: true, message: 'Ready now' });
    const provider = providerWithSetup(setup);
    const check = createProviderSetupCheck();
    const pending = check(provider, context, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('Operation cancelled');
    await Promise.resolve();

    controller.abort();
    await rejected;

    await expect(check(provider, context)).resolves.toBeUndefined();
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('allows a cached waiter to cancel without canceling the original check', async () => {
    const setupResult = deferred<SetupResult>();
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(() => setupResult.promise);
    const provider = providerWithSetup(setup);
    const check = createProviderSetupCheck();
    const owner = check(provider, context, { timeoutMs: 1000 });
    const controller = new AbortController();
    const waiter = check(provider, context, { abortSignal: controller.signal });
    const rejected = expect(waiter).rejects.toThrow('Operation cancelled');
    await Promise.resolve();

    controller.abort();
    await rejected;
    expect(setup.mock.calls[0][1]?.abortSignal?.aborted).toBe(false);
    setupResult.resolve({ success: true, message: 'Ready' });

    await expect(owner).resolves.toBeUndefined();
    expect(setup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('observes changed setup state without memoization when caching is disabled', async () => {
    let ready = false;
    const setup = vi.fn(async () => ({ success: ready, message: 'Local file missing' }));
    const provider = providerWithSetup(setup);
    const check = createProviderSetupCheck({ cache: false });

    expect((await check(provider, context))?.error).toBe('Local file missing');
    ready = true;
    await expect(check(provider, context)).resolves.toBeUndefined();
    ready = false;
    expect((await check(provider, context))?.error).toBe('Local file missing');
    expect(setup).toHaveBeenCalledTimes(3);
  });
});
