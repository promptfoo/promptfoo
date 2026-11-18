import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetLinkEvents } from '../../../src/types/targetLink';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));

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
    vi.mocked(fetchWithProxy).mockReset();
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
    expect(readyEvents[0].args[0]).toMatchObject({
      capabilities: expect.arrayContaining(['http-probe-same-origin-redirects']),
    });
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

  describe('HTTP probe redirects', () => {
    const source = 'http://localhost:8000/start';
    const request = {
      requestId: 'http-redirect',
      url: source,
      method: 'POST',
      headers: { Authorization: 'Bearer dummy', 'X-Custom-Token': 'dummy' },
      body: 'dummy-body',
    };

    async function probe() {
      const { attachTargetLink } = await import('../../../src/util/agent/targetLink');
      attachTargetLink(fakeClient as any, {
        id: () => 'test',
        callApi: vi.fn(async () => ({ output: 'ok' })),
      });
      fakeClient._simulateEvent(TargetLinkEvents.PROBE_HTTP, request);
      await vi.waitFor(() => {
        expect(
          fakeClient._emittedToServer.some((e) => e.event === TargetLinkEvents.PROBE_HTTP_RESULT),
        ).toBe(true);
      });
      return fakeClient._emittedToServer.find(
        (e) => e.event === TargetLinkEvents.PROBE_HTTP_RESULT,
      )!.args[0] as any;
    }

    it.each([301, 302, 303, 307, 308])(
      'rejects a cross-origin %i before forwarding credentials',
      async (status) => {
        vi.mocked(fetchWithProxy)
          .mockResolvedValueOnce(
            new Response(null, { status, headers: { location: 'http://localhost:8001/collect' } }),
          )
          .mockResolvedValueOnce(new Response('OK'));
        const result = await probe();
        expect(fetchWithProxy).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
          success: false,
          error: expect.stringContaining('Cross-origin'),
        });
      },
    );

    it('follows a same-origin relative redirect and preserves the 307 body', async () => {
      vi.mocked(fetchWithProxy)
        .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: '/next' } }))
        .mockResolvedValueOnce(new Response('OK'));
      const result = await probe();
      expect(result).toMatchObject({ success: true, finalUrl: 'http://localhost:8000/next' });
      expect(fetchWithProxy).toHaveBeenLastCalledWith(
        'http://localhost:8000/next',
        expect.objectContaining({ method: 'POST', headers: request.headers, body: request.body }),
      );
    });
  });
});
