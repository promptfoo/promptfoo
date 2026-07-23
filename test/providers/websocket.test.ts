import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import WebSocket from 'ws';
import logger from '../../src/logger';
import { createTransformResponse, WebSocketProvider } from '../../src/providers/websocket';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { isProviderResponseRateLimited } from '../../src/scheduler/types';

const websocketMocks = vi.hoisted(() => {
  let factory: (() => Mocked<WebSocket>) | null = null;

  const WebSocketMock = vi.fn(function () {
    return factory?.() ?? ({} as Mocked<WebSocket>);
  });

  const setFactory = (nextFactory: () => Mocked<WebSocket>) => {
    factory = nextFactory;
  };

  return { WebSocketMock, setFactory };
});

vi.mock('ws', () => ({
  default: websocketMocks.WebSocketMock,
}));

describe('createTransformResponse', () => {
  it('should use provided function parser', () => {
    const parser = (data: any) => ({ output: `parsed-${data}` });
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should create function from string parser', () => {
    const parser = '({ output: `parsed-${data}` })';
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should return default transform if no parser provided', () => {
    const transform = createTransformResponse(undefined);
    expect(transform('test')).toEqual({ output: 'test' });
  });
});

describe('WebSocketProvider', () => {
  let mockWs: Mocked<WebSocket>;
  let provider: WebSocketProvider;

  const emitWebSocketEvents = (
    ...events: Array<
      | { type: 'open' }
      | { type: 'message'; data: unknown }
      | { type: 'error'; error?: Error; message?: string }
    >
  ) => {
    websocketMocks.setFactory(() => {
      const ws = mockWs;
      queueMicrotask(() => {
        for (const event of events) {
          if (event.type === 'open') {
            ws.onopen?.({ type: 'open', target: ws } as WebSocket.Event);
          } else if (event.type === 'message') {
            ws.onmessage?.({ data: event.data } as WebSocket.MessageEvent);
          } else {
            const error = event.error ?? new Error(event.message ?? 'connection failed');
            ws.onerror?.({
              type: 'error',
              error,
              message: event.message ?? error.message,
            } as WebSocket.ErrorEvent);
          }
        }
      });
      return ws;
    });
  };

  beforeEach(() => {
    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onopen: vi.fn(),
    } as unknown as Mocked<WebSocket>;

    websocketMocks.WebSocketMock.mockReset();
    websocketMocks.setFactory(() => mockWs);

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.url).toBe('ws://test.com');
    expect(provider.id()).toBe('ws://test.com');
    expect(provider.config.messageTemplate).toBe('{{ prompt }}');
  });

  it('should pass headers to WebSocket connection', async () => {
    const headers = {
      Authorization: 'Bearer test-token',
      'Custom-Header': 'test-value',
    };

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        headers,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    // Trigger the WebSocket connection by calling callApi
    await provider.callApi('test prompt');

    // Now assert that WebSocket was called with the headers
    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', { headers });
  });

  it('should render the URL template for each WebSocket connection', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://test.com/sessions/{{ sessionId }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'first' }) },
    );
    await provider.callApi('first prompt', {
      prompt: { raw: 'first prompt', label: 'first prompt' },
      vars: { sessionId: 'session-1' },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'second' }) },
    );
    await provider.callApi('second prompt', {
      prompt: { raw: 'second prompt', label: 'second prompt' },
      vars: { sessionId: 'session-2' },
    });

    expect(WebSocket).toHaveBeenNthCalledWith(1, 'ws://test.com/sessions/session-1', {});
    expect(WebSocket).toHaveBeenNthCalledWith(2, 'ws://test.com/sessions/session-2', {});
  });

  it('should redact literal credentials from templated provider identities', () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://test.com/sessions/{{ sessionId }}?token=runtime-secret',
        messageTemplate: '{{ prompt }}',
      },
    });

    expect(provider.id()).toBe('ws://test.com/sessions/{{ sessionId }}?token=%5BREDACTED%5D');
    expect(provider.toString()).not.toContain('runtime-secret');
  });

  it('should not log rendered URLs that contain template-like runtime values', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'wss://test.com/ws/{{ sessionId }}?token={{ token }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );
    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: { sessionId: '{{ attacker_controlled }}', token: 'runtime-secret' },
    });

    expect(WebSocket).toHaveBeenCalledWith(
      'wss://test.com/ws/{{ attacker_controlled }}?token=runtime-secret',
      {},
    );
    const debugLogs = JSON.stringify(debugSpy.mock.calls);
    expect(debugLogs).not.toContain('wss://test.com/ws');
    expect(debugLogs).not.toContain('runtime-secret');
  });

  it('should not expose rendered URLs in synchronous constructor errors', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'wss://{{ host }}/ws?token={{ token }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });

    const error = await provider
      .callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: { host: '[invalid-host', token: 'runtime-secret' },
      })
      .catch((err: Error) => err);

    expect(error).toEqual(new Error('Failed to create WebSocket connection'));
    expect((error as Error).message).not.toContain('runtime-secret');
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it('should preserve safe synchronous WebSocket constructor errors', async () => {
    websocketMocks.setFactory(() => {
      throw new Error('An invalid or duplicated subprotocol was specified');
    });
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        protocols: ['invalid protocol'],
        timeoutMs: 1000,
      },
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(
      'An invalid or duplicated subprotocol was specified',
    );
  });

  it('should use configured Nunjucks filters for URL and message templates', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://test.com/sessions/{{ sessionId | slugify }}',
        messageTemplate: '{{ prompt | slugify }}',
        timeoutMs: 1000,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );
    await provider.callApi('Test Prompt', {
      prompt: { raw: 'Test Prompt', label: 'Test Prompt' },
      vars: { sessionId: 'Conversation A' },
      filters: {
        slugify: (value: string) => value.toLowerCase().replaceAll(' ', '-'),
      },
    });

    expect(WebSocket).toHaveBeenCalledWith('ws://test.com/sessions/conversation-a', {});
    expect(mockWs.send).toHaveBeenCalledWith('test-prompt');
  });

  it('should pass configured protocols to WebSocket connection', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        protocols: ['json'],
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    await provider.callApi('test prompt');

    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', ['json'], {});
  });

  it('should preserve Sec-WebSocket-Protocol headers unless protocols are configured', async () => {
    const headers = {
      Authorization: 'Bearer test-token',
      'Sec-WebSocket-Protocol': 'Bearer token-with-space',
    };

    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        headers,
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    await provider.callApi('test prompt');

    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', { headers });
  });

  it('should work without headers provided', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        // No headers provided
      },
    });

    emitWebSocketEvents(
      { type: 'open' },
      { type: 'message', data: JSON.stringify({ result: 'test' }) },
    );

    // Trigger the WebSocket connection by calling callApi
    const response = await provider.callApi('test prompt');

    // Should still work and return expected response
    expect(response).toEqual({ output: { result: 'test' } });
    // When headers are not provided, the options object should be empty
    expect(WebSocket).toHaveBeenCalledWith('ws://test.com', {});
  });

  it('should throw if messageTemplate is missing', () => {
    expect(() => {
      new WebSocketProvider('ws://test.com', {
        config: {},
      });
    }).toThrow(
      'Expected WebSocket provider ws://test.com to have a config containing {messageTemplate}',
    );
  });

  it('should send message and handle response', async () => {
    const responseData = { result: 'test response' };

    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: JSON.stringify(responseData) });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: responseData });
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should not expose URL-derived values from asynchronous WebSocket errors', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://{{ tenant }}.invalid/ws?token={{ token }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
      },
    });
    emitWebSocketEvents({
      type: 'error',
      error: new Error('getaddrinfo ENOTFOUND runtime-secret-tenant.invalid'),
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: { tenant: 'runtime-secret-tenant', token: 'runtime-query-secret' },
      }),
    ).rejects.toThrow('WebSocket connection failed');
    const errorLogs = JSON.stringify(errorSpy.mock.calls);
    expect(errorLogs).not.toContain('runtime-secret-tenant');
    expect(errorLogs).not.toContain('runtime-query-secret');
    expect(mockWs.close).toHaveBeenCalled();
  });

  it.each([
    {
      description: 'HTTP 429 handshake responses',
      createError: (url: string) => new Error(`Unexpected server response: 429 ${url}`),
      expectedMessage: 'WebSocket connection failed (HTTP 429)',
      expectedRateLimitHits: 3,
    },
    {
      description: 'connection resets',
      createError: (url: string) =>
        Object.assign(new Error(`read ECONNRESET ${url}`), { code: 'ECONNRESET' }),
      expectedMessage: 'WebSocket connection failed (ECONNRESET)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'refused connections',
      createError: (url: string) =>
        Object.assign(new Error(`connect ECONNREFUSED ${url}`), { code: 'ECONNREFUSED' }),
      expectedMessage: 'WebSocket connection failed (ECONNREFUSED)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'broken pipes',
      createError: (url: string) =>
        Object.assign(new Error(`write EPIPE ${url}`), { code: 'EPIPE' }),
      expectedMessage: 'WebSocket connection failed (EPIPE)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'request timeouts',
      createError: (url: string) => new Error(`request timeout after 1000ms ${url}`),
      expectedMessage: 'WebSocket connection failed (TIMEOUT)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'coded socket timeouts',
      createError: (url: string) =>
        Object.assign(new Error(`connect ETIMEDOUT ${url}`), { code: 'ETIMEDOUT' }),
      expectedMessage: 'WebSocket connection failed (TIMEOUT)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'socket hang-ups',
      createError: (url: string) => new Error(`socket hang up ${url}`),
      expectedMessage: 'WebSocket connection failed (SOCKET HANG UP)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'transient TLS record failures',
      createError: (url: string) => new Error(`SSL routines: bad record mac ${url}`),
      expectedMessage: 'WebSocket connection failed (BAD RECORD MAC)',
      expectedRateLimitHits: 0,
    },
    {
      description: 'retryable TLS protocol failures',
      createError: (url: string) =>
        Object.assign(new Error(`write EPROTO transient TLS failure ${url}`), { code: 'EPROTO' }),
      expectedMessage: 'WebSocket connection failed (EPROTO)',
      expectedRateLimitHits: 0,
    },
  ])('should retry $description without exposing rendered WebSocket URL values', async ({
    createError,
    expectedMessage,
    expectedRateLimitHits,
  }) => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const renderedUrl =
      'ws://runtime-secret-tenant.invalid/sessions/private-session-123?token=runtime-query-secret';
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://{{ tenant }}.invalid/sessions/{{ sessionId }}?token={{ token }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
        maxRetries: 2,
      },
    });
    emitWebSocketEvents({ type: 'error', error: createError(renderedUrl) });

    const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });
    const callApi = vi.fn(() =>
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {
          tenant: 'runtime-secret-tenant',
          sessionId: 'private-session-123',
          token: 'runtime-query-secret',
        },
      }),
    );

    try {
      const error = await registry
        .execute(provider, callApi, {
          isRateLimited: isProviderResponseRateLimited,
          getRetryAfter: () => 0,
        })
        .catch((caughtError: Error) => caughtError);

      if (!(error instanceof Error)) {
        throw new Error('Expected the WebSocket provider call to fail');
      }
      expect(callApi).toHaveBeenCalledTimes(3);
      expect(error.message).toBe(expectedMessage);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        retriedRequests: 2,
        rateLimitHits: expectedRateLimitHits,
        failedRequests: 1,
      });

      const observableError = JSON.stringify({
        message: error.message,
        logs: errorSpy.mock.calls,
        metrics: registry.getMetrics(),
      });
      expect(observableError).not.toContain('runtime-secret-tenant');
      expect(observableError).not.toContain('private-session-123');
      expect(observableError).not.toContain('runtime-query-secret');
    } finally {
      registry.dispose();
    }
  });

  it.each([
    new Error('getaddrinfo ENOTFOUND runtime-secret-tenant.invalid'),
    Object.assign(new Error('getaddrinfo ENOTFOUND tenant-429.invalid'), { code: 'ENOTFOUND' }),
    Object.assign(new Error('getaddrinfo ENOTFOUND tenant-503.invalid'), { code: 'ENOTFOUND' }),
    Object.assign(new Error('getaddrinfo ENOTFOUND tenant-network.invalid'), { code: 'ENOTFOUND' }),
    Object.assign(new Error('getaddrinfo ENOTFOUND tenant-ECONNRESET.invalid'), {
      code: 'ENOTFOUND',
    }),
    new Error('getaddrinfo ENOTFOUND tenant-ECONNRESET.invalid'),
    new Error('Unexpected server response: 401'),
    new Error('Unexpected server response: 401 ws://tenant-429.invalid?token=503'),
    new Error('Unexpected server response: 401 ws://tenant-ECONNRESET.invalid'),
    Object.assign(new Error('self signed certificate for runtime-secret-tenant.invalid'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    }),
    Object.assign(new Error('self signed certificate for tenant-network.invalid'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    }),
    Object.assign(new Error('Host: timeout.invalid. is not in the certificate'), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    }),
    Object.assign(new Error('write EPROTO wrong version number runtime-secret-tenant.invalid'), {
      code: 'EPROTO',
    }),
    Object.assign(new Error('write EPROTO tlsv1 alert protocol version'), { code: 'EPROTO' }),
    Object.assign(new Error('write EPROTO unsupported protocol'), { code: 'EPROTO' }),
    Object.assign(new Error('request aborted for runtime-secret-tenant.invalid'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    }),
    Object.assign(new Error('request aborted for tenant-network.invalid'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    }),
    Object.assign(new Error('The operation was aborted after timeout'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    }),
    Object.assign(new Error('The operation was aborted after ECONNRESET'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    }),
    Object.assign(new Error('The operation was aborted after timeout'), {
      name: 'AbortException',
      code: 'ABORT_ERR',
    }),
  ])('should not retry permanent or cancelled WebSocket errors: $message', async (sourceError) => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        url: 'ws://{{ tenant }}.invalid/ws?token={{ token }}',
        messageTemplate: '{{ prompt }}',
        timeoutMs: 1000,
        maxRetries: 2,
      },
    });
    emitWebSocketEvents({ type: 'error', error: sourceError });

    const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });
    const callApi = vi.fn(() =>
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: { tenant: 'runtime-secret-tenant', token: 'runtime-query-secret' },
      }),
    );

    try {
      const error = await registry
        .execute(provider, callApi, {
          isRateLimited: isProviderResponseRateLimited,
          getRetryAfter: () => 0,
        })
        .catch((caughtError: Error) => caughtError);

      if (!(error instanceof Error)) {
        throw new Error('Expected the WebSocket provider call to fail');
      }
      expect(error.message).toBe('WebSocket connection failed');
      expect(error.name).toBe(
        sourceError.name === 'AbortError' || sourceError.name === 'AbortException'
          ? sourceError.name
          : 'Error',
      );
      expect(callApi).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        retriedRequests: 0,
        rateLimitHits: 0,
        failedRequests: 1,
      });
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('runtime-secret-tenant');
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('runtime-query-secret');
    } finally {
      registry.dispose();
    }
  });

  it('should handle timeout', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        timeoutMs: 100,
      },
    });

    vi.useFakeTimers();
    try {
      const responsePromise = expect(provider.callApi('test prompt')).rejects.toThrow(
        'WebSocket request timed out',
      );

      await vi.runAllTimersAsync();

      await responsePromise;
      expect(mockWs.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should handle non-JSON response', async () => {
    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'plain text response' });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'plain text response' });
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('should use custom response transformer', async () => {
    provider = new WebSocketProvider('ws://test.com', {
      config: {
        messageTemplate: '{{ prompt }}',
        transformResponse: (data: any) => ({ output: `transformed-${data}` }),
      },
    });

    emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'test' });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ output: 'transformed-test' });
    expect(mockWs.close).toHaveBeenCalled();
  });

  describe('streamResponse behavior', () => {
    it('should stream chunks and resolve when stream signals complete', async () => {
      let callCount = 0;
      const chunks = ['hello ', 'world'];
      const streamResponse = (accumulator: any, event: any) => {
        const previousOutput = typeof accumulator.output === 'string' ? accumulator.output : '';
        const currentChunk =
          typeof event?.data === 'string' ? event.data : String(event?.data ?? event);
        const merged = { output: previousOutput + currentChunk };
        callCount += 1;
        const isComplete = callCount === chunks.length ? 'DONE' : '';
        return [merged, isComplete];
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents(
        { type: 'open' },
        { type: 'message', data: chunks[0] },
        { type: 'message', data: chunks[1] },
      );

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'hello world' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });

    it('should complete immediately if stream signals completion on first message', async () => {
      const streamResponse = (_acc: any, event: any) => [
        { output: String(event?.data ?? event) },
        true,
      ];

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      const response = await provider.callApi('ignored');
      expect(response).toEqual({ output: 'chunk' });
      expect(mockWs.close).toHaveBeenCalledTimes(1);
    });

    it('should pass context as third argument to streamResponse', async () => {
      let received: any[] | null = null;
      const streamResponse = (acc: any, event: any, ctx: any) => {
        received = [acc, event, ctx];
        return [{ output: 'ok' }, true];
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      const context = { vars: { x: 1 }, debug: true } as any;
      const response = await provider.callApi('ignored', context);
      expect(response).toEqual({ output: 'ok' });
      expect(received).not.toBeNull();
      expect(received?.[2]).toEqual(context);
    });

    it('should reject when streamResponse function throws an error', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        throw new Error('Stream processing failed');
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error in stream response function: Stream processing failed',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse string transform throws an error', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse: '(acc, data, ctx) => { throw new Error("String transform failed"); }',
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error executing streamResponse function: String transform failed',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse string transform has syntax error', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse: 'invalid syntax here !!!',
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function:',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse returns invalid result format', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        // Return invalid format - not an array
        return { invalid: 'format' };
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function:',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should reject when streamResponse function throws non-Error object', async () => {
      const streamResponse = (_acc: any, _event: any) => {
        throw 'String error instead of Error object';
      };

      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          streamResponse,
          transformResponse: (data: any) => ({ output: (data as any).output }),
        },
      });

      emitWebSocketEvents({ type: 'open' }, { type: 'message', data: 'chunk' });

      await expect(provider.callApi('test')).rejects.toThrow(
        'Error executing streamResponse function: Error in stream response function: String error instead of Error object',
      );
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('timeouts', () => {
    it('should timeout with streamResponse', async () => {
      provider = new WebSocketProvider('ws://test.com', {
        config: {
          messageTemplate: '{{ prompt }}',
          timeoutMs: 100,
          // never signal completion; ensures timeout path is exercised
          streamResponse: (acc: any, _data: any) => [acc, ''],
        },
      });

      await expect(provider.callApi('timeout test')).rejects.toThrow('WebSocket request timed out');
      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});
