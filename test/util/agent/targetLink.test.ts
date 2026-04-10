import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetLinkEvents } from '../../../src/types/targetLink';

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Fake client factory ───────────────────────────────────────────────────────

function createFakeClient() {
  const emitter = new EventEmitter();
  const emittedToServer: Array<{ event: string; args: unknown[] }> = [];

  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      emitter.on(event, handler);
    },
    emit(event: string, ...args: unknown[]) {
      emittedToServer.push({ event, args });
    },
    // Test helpers
    _emittedToServer: emittedToServer,
    _simulateEvent(event: string, ...args: unknown[]) {
      emitter.emit(event, ...args);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('attachTargetLink', () => {
  let fakeClient: ReturnType<typeof createFakeClient>;

  beforeEach(() => {
    fakeClient = createFakeClient();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('emits link:ready on attach', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = { id: () => 'test', callApi: vi.fn() };
    attachTargetLink(fakeClient as any, provider);

    const readyEvents = fakeClient._emittedToServer.filter(
      (e) => e.event === TargetLinkEvents.READY,
    );
    expect(readyEvents).toHaveLength(1);
  });

  it('sets up handler before emitting ready', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const callOrder: string[] = [];

    const originalOn = fakeClient.on.bind(fakeClient);
    fakeClient.on = (event: string, handler: (...args: unknown[]) => void) => {
      if (event === TargetLinkEvents.PROBE) {
        callOrder.push('handler_registered');
      }
      return originalOn(event, handler);
    };

    const originalEmit = fakeClient.emit.bind(fakeClient);
    fakeClient.emit = (event: string, ...args: unknown[]) => {
      if (event === TargetLinkEvents.READY) {
        callOrder.push('ready_emitted');
      }
      return originalEmit(event, ...args);
    };

    const provider = { id: () => 'test', callApi: vi.fn() };
    attachTargetLink(fakeClient as any, provider);

    expect(callOrder).toEqual(['handler_registered', 'ready_emitted']);
  });

  it('calls provider.callApi on probe and emits result with output', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello world',
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
      }),
    };

    attachTargetLink(fakeClient as any, provider);

    fakeClient._simulateEvent(TargetLinkEvents.PROBE, {
      requestId: 'req-1',
      prompt: 'What is your purpose?',
    });

    // Wait for async handler
    await vi.waitFor(() => {
      expect(provider.callApi).toHaveBeenCalledWith('What is your purpose?', {
        vars: {},
        prompt: { raw: 'What is your purpose?', label: 'target-link-probe' },
      });
    });

    const results = fakeClient._emittedToServer.filter(
      (e) => e.event === TargetLinkEvents.PROBE_RESULT,
    );
    expect(results).toHaveLength(1);
    expect(results[0].args[0]).toEqual({
      requestId: 'req-1',
      output: 'Hello world',
      tokenUsage: { input: 10, output: 20, total: 30 },
    });
  });

  it('maps tokenUsage prompt/completion to input/output', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({
        output: 'ok',
        tokenUsage: { prompt: 5, completion: 15, total: 20 },
      }),
    };

    attachTargetLink(fakeClient as any, provider);

    fakeClient._simulateEvent(TargetLinkEvents.PROBE, {
      requestId: 'req-map',
      prompt: 'test',
    });

    await vi.waitFor(() => {
      expect(provider.callApi).toHaveBeenCalled();
    });

    const results = fakeClient._emittedToServer.filter(
      (e) => e.event === TargetLinkEvents.PROBE_RESULT,
    );
    expect(results[0].args[0]).toMatchObject({
      tokenUsage: { input: 5, output: 15, total: 20 },
    });
  });

  it('handles provider error — emits result with error string', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = {
      id: () => 'test',
      callApi: vi.fn().mockRejectedValue(new Error('Provider failed')),
    };

    attachTargetLink(fakeClient as any, provider);

    fakeClient._simulateEvent(TargetLinkEvents.PROBE, {
      requestId: 'req-err',
      prompt: 'test',
    });

    await vi.waitFor(() => {
      const results = fakeClient._emittedToServer.filter(
        (e) => e.event === TargetLinkEvents.PROBE_RESULT,
      );
      expect(results).toHaveLength(1);
      expect(results[0].args[0]).toEqual({
        requestId: 'req-err',
        error: 'Provider failed',
      });
    });
  });

  it('handles object output — JSON.stringifies it', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({
        output: { key: 'value' },
      }),
    };

    attachTargetLink(fakeClient as any, provider);

    fakeClient._simulateEvent(TargetLinkEvents.PROBE, {
      requestId: 'req-obj',
      prompt: 'test',
    });

    await vi.waitFor(() => {
      const results = fakeClient._emittedToServer.filter(
        (e) => e.event === TargetLinkEvents.PROBE_RESULT,
      );
      expect(results).toHaveLength(1);
      expect((results[0].args[0] as any).output).toBe('{"key":"value"}');
    });
  });

  it('handles missing tokenUsage — omits field', async () => {
    const { attachTargetLink } = await import('../../../src/util/agent/targetLink');

    const provider = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({
        output: 'no tokens',
      }),
    };

    attachTargetLink(fakeClient as any, provider);

    fakeClient._simulateEvent(TargetLinkEvents.PROBE, {
      requestId: 'req-no-tokens',
      prompt: 'test',
    });

    await vi.waitFor(() => {
      const results = fakeClient._emittedToServer.filter(
        (e) => e.event === TargetLinkEvents.PROBE_RESULT,
      );
      expect(results).toHaveLength(1);
      expect((results[0].args[0] as any).tokenUsage).toBeUndefined();
    });
  });
});
