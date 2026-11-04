import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeTracingLifecycle } from '../../src/node/tracingLifecycle';
import {
  isOtlpReceiverStarted,
  startOtlpReceiverIfNeeded,
  stopOtlpReceiverIfNeeded,
} from '../../src/tracing/evaluatorTracing';
import { acquireOtel } from '../../src/tracing/otelSdk';
import { mockProcessEnv } from '../util/utils';

import type { TestSuite } from '../../src/types/index';

vi.mock('../../src/tracing/evaluatorTracing', () => ({
  isOtlpReceiverStarted: vi.fn(),
  startOtlpReceiverIfNeeded: vi.fn(),
  stopOtlpReceiverIfNeeded: vi.fn(),
}));
vi.mock('../../src/tracing/otelSdk', () => ({ acquireOtel: vi.fn() }));

const suite: TestSuite = {
  providers: [],
  prompts: [],
  tracing: {
    enabled: true,
    storage: { type: 'sqlite', retentionDays: 7 },
    otlp: { http: { enabled: true, host: '127.0.0.1', port: 4318 } },
  },
};

describe('Node evaluation tracing lifecycle', () => {
  const releaseSdk = vi.fn<() => Promise<void>>();
  let restoreEnvironment: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_OTEL_ENDPOINT: 'http://127.0.0.1:4319/v1/traces',
      PROMPTFOO_OTEL_SERVICE_NAME: 'local-test-service',
      PROMPTFOO_OTEL_LOCAL_EXPORT: 'false',
      PROMPTFOO_OTEL_DEBUG: 'false',
    });
    releaseSdk.mockResolvedValue(undefined);
    vi.mocked(acquireOtel).mockResolvedValue(releaseSdk);
    vi.mocked(startOtlpReceiverIfNeeded).mockResolvedValue(true);
    vi.mocked(isOtlpReceiverStarted).mockReturnValue(true);
    vi.mocked(stopOtlpReceiverIfNeeded).mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreEnvironment();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes the complete suite to receiver policy and environment config to SDK acquisition', async () => {
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await lifecycle.start();
    expect(startOtlpReceiverIfNeeded).toHaveBeenCalledWith(suite, 'evaluation-id');
    expect(acquireOtel).toHaveBeenCalledWith({
      enabled: true,
      endpoint: 'http://127.0.0.1:4319/v1/traces',
      serviceName: 'local-test-service',
      localExport: false,
      debug: false,
    });
    const closed = lifecycle.close();
    await vi.runAllTimersAsync();
    await closed;
  });

  it('releases SDK before export grace and receiver, once per evaluation', async () => {
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await Promise.all([lifecycle.start(), lifecycle.start()]);
    const firstClose = lifecycle.close();
    const secondClose = lifecycle.close();
    await vi.advanceTimersByTimeAsync(2999);
    expect(releaseSdk).toHaveBeenCalledOnce();
    expect(stopOtlpReceiverIfNeeded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([firstClose, secondClose, lifecycle.close()]);
    expect(startOtlpReceiverIfNeeded).toHaveBeenCalledOnce();
    expect(acquireOtel).toHaveBeenCalledOnce();
    expect(stopOtlpReceiverIfNeeded).toHaveBeenCalledExactlyOnceWith(true, 'evaluation-id');
  });

  it('releases an acquired receiver after SDK startup fails with the original error', async () => {
    const error = new Error('SDK unavailable');
    vi.mocked(acquireOtel).mockRejectedValue(error);
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await expect(lifecycle.start()).rejects.toBe(error);
    const closed = lifecycle.close();
    await vi.runAllTimersAsync();
    await closed;
    expect(releaseSdk).not.toHaveBeenCalled();
    expect(stopOtlpReceiverIfNeeded).toHaveBeenCalledWith(true, 'evaluation-id');
  });

  it('does not acquire an SDK after a fatal receiver start failure', async () => {
    const error = new Error('fatal receiver start');
    vi.mocked(startOtlpReceiverIfNeeded).mockRejectedValue(error);
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await expect(lifecycle.start()).rejects.toBe(error);
    await lifecycle.close();
    expect(acquireOtel).not.toHaveBeenCalled();
    expect(stopOtlpReceiverIfNeeded).toHaveBeenCalledWith(false, 'evaluation-id');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues SDK tracing after a swallowed receiver failure without export grace', async () => {
    vi.mocked(startOtlpReceiverIfNeeded).mockResolvedValue(false);
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await lifecycle.start();
    await lifecycle.close();
    expect(acquireOtel).toHaveBeenCalledOnce();
    expect(releaseSdk).toHaveBeenCalledOnce();
    expect(stopOtlpReceiverIfNeeded).toHaveBeenCalledWith(false, 'evaluation-id');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the receiver even when SDK disposal fails', async () => {
    const error = new Error('SDK disposal failure');
    releaseSdk.mockRejectedValue(error);
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await lifecycle.start();
    const rejected = expect(lifecycle.close()).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await rejected;
    expect(stopOtlpReceiverIfNeeded).toHaveBeenCalledWith(true, 'evaluation-id');
  });

  it('allows retrying the valid receiver lease after receiver shutdown fails', async () => {
    const error = new Error('receiver stop failure');
    vi.mocked(stopOtlpReceiverIfNeeded).mockRejectedValueOnce(error);
    const lifecycle = createNodeTracingLifecycle(suite, 'evaluation-id');
    await lifecycle.start();
    const rejected = expect(lifecycle.close()).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await rejected;
    const retry = lifecycle.close();
    await vi.runAllTimersAsync();
    await retry;
    expect(releaseSdk).toHaveBeenCalledOnce();
    expect(stopOtlpReceiverIfNeeded).toHaveBeenNthCalledWith(1, true, 'evaluation-id');
    expect(stopOtlpReceiverIfNeeded).toHaveBeenNthCalledWith(2, true, 'evaluation-id');
  });
});
