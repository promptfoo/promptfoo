import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkProviderSetup } from '../../src/evaluator/providerSetup';

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
      checkProviderSetup(provider, context, {
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
    const pending = checkProviderSetup(provider, context, {
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

  it('bounds a hanging check without retaining that failure for later callers', async () => {
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(() => new Promise(() => {}));
    const provider = providerWithSetup(setup);
    const check = checkProviderSetup;
    const pending = check(provider, context, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response).toMatchObject({
      error: expect.stringContaining('timed out after 1000ms'),
      incurredCost: 0,
      tokenUsage: { numRequests: 0 },
      metadata: { providerSetup: { workloadStarted: false, timedOut: true } },
    });
    expect(setup.mock.calls[0][1]?.abortSignal?.aborted).toBe(true);
    setup.mockResolvedValue({ success: true, message: 'Now ready' });
    expect(await check(provider, context)).toBeUndefined();
    expect(setup).toHaveBeenCalledTimes(2);
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
      checkProviderSetup(providerWithSetup(setup), context, {
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
    const setup = vi.fn(() => late.promise);
    const provider = providerWithSetup(setup);
    const check = checkProviderSetup;
    const pending = check(provider, context, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    late.reject(new Error('Late SDK shutdown failure'));
    await vi.advanceTimersByTimeAsync(0);

    expect((await check(provider, context))?.error).toBe(
      'Provider local setup check failed. No workload was started.',
    );
    expect(setup).toHaveBeenCalledTimes(2);
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
    const check = checkProviderSetup;
    const pending = check(provider, context, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('Operation cancelled');
    await Promise.resolve();

    controller.abort();
    await rejected;

    await expect(check(provider, context)).resolves.toBeUndefined();
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('cancels one concurrent check without canceling the other', async () => {
    const setupResult = deferred<SetupResult>();
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(() => setupResult.promise);
    const provider = providerWithSetup(setup);
    const check = checkProviderSetup;
    const owner = check(provider, context, { timeoutMs: 1000 });
    const controller = new AbortController();
    const waiter = check(provider, context, { abortSignal: controller.signal });
    const rejected = expect(waiter).rejects.toThrow('Operation cancelled');
    await Promise.resolve();

    controller.abort();
    await rejected;
    expect(setup.mock.calls[0][1]?.abortSignal?.aborted).toBe(false);
    expect(setup.mock.calls[1][1]?.abortSignal?.aborted).toBe(true);
    setupResult.resolve({ success: true, message: 'Ready' });

    await expect(owner).resolves.toBeUndefined();
    expect(setup).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('observes changed setup state even when the row context is unchanged', async () => {
    let ready = false;
    const setup = vi.fn(async () => ({ success: ready, message: 'Local file missing' }));
    const provider = providerWithSetup(setup);
    const check = checkProviderSetup;

    expect((await check(provider, context))?.error).toBe('Local file missing');
    ready = true;
    await expect(check(provider, context)).resolves.toBeUndefined();
    ready = false;
    expect((await check(provider, context))?.error).toBe('Local file missing');
    expect(setup).toHaveBeenCalledTimes(3);
  });
});

describe('provider setup context freshness', () => {
  it.each(['tenant', 'prompt', 'metadata'] as const)(
    'checks changed %s input after a successful setup',
    async (input) => {
      const value = (row: CallApiContextParams) =>
        input === 'tenant'
          ? row.vars.tenant
          : input === 'prompt'
            ? row.prompt.raw
            : row.test?.metadata?.tenant;
      const row = (tenant: string): CallApiContextParams => ({
        vars: input === 'tenant' ? { tenant } : {},
        prompt: { raw: input === 'prompt' ? tenant : 'Review', label: 'Review' },
        ...(input === 'metadata' ? { test: { metadata: { tenant } } } : {}),
      });
      const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(async (context) => ({
        success: value(context!) === 'ready',
        message: 'This row is not ready',
      }));
      const check = checkProviderSetup;
      const provider = providerWithSetup(setup);

      expect(await check(provider, row('ready'))).toBeUndefined();
      expect(await check(provider, row('missing'))).toMatchObject({
        error: 'This row is not ready',
        tokenUsage: { numRequests: 0 },
      });
      expect(setup).toHaveBeenCalledTimes(2);
      expect(provider.callApi).not.toHaveBeenCalled();
    },
  );

  it('does not conflate an absent field with an explicitly undefined field', async () => {
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(async (row) => ({
      success: !Object.hasOwn(row!.test!.metadata!, 'tenant'),
      message: 'Explicit undefined is not ready',
    }));
    const check = checkProviderSetup;
    const provider = providerWithSetup(setup);

    expect(await check(provider, { ...context, test: { metadata: {} } })).toBeUndefined();
    expect(
      await check(provider, { ...context, test: { metadata: { tenant: undefined } } }),
    ).toMatchObject({ error: 'Explicit undefined is not ready' });
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['function', () => () => true],
    ['class instance', () => new (class Tenant {})()],
    [
      'cyclic object',
      () => {
        const value: Record<string, unknown> = {};
        value.self = value;
        return value;
      },
    ],
    ['symbol', () => Symbol('tenant')],
    ['non-finite number', () => Number.NaN],
    ['sparse array', () => new Array(1)],
    ['accessor', () => Object.defineProperty({}, 'tenant', { get: () => 'ready' })],
  ] as const)('checks current state with %s context', async (_name, createValue) => {
    let ready = true;
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>(async () => ({
      success: ready,
      message: 'No longer ready',
    }));
    const check = checkProviderSetup;
    const provider = providerWithSetup(setup);
    const row = { ...context, test: { metadata: { value: createValue() } } };

    expect(await check(provider, row)).toBeUndefined();
    ready = false;
    expect(await check(provider, row)).toMatchObject({ error: 'No longer ready' });
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('rechecks identical plain-data contexts and provider config changes', async () => {
    const setup = vi.fn<NonNullable<ApiProvider['checkSetup']>>().mockResolvedValue({
      success: true,
      message: 'Ready',
    });
    const provider = { ...providerWithSetup(setup), config: { tenant: 'one' } };
    const check = checkProviderSetup;
    const row = { ...context, test: { metadata: { tags: ['one', 'two'] } } };

    await check(provider, row);
    await check(provider, structuredClone(row));
    expect(setup).toHaveBeenCalledTimes(2);
    provider.config.tenant = 'two';
    await check(provider, row);
    expect(setup).toHaveBeenCalledTimes(3);
  });
});
