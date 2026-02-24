import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, making MockWebSocket available to the factory
const { MockWebSocket, mockWsInstances } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events');
  const instances: any[] = [];

  class MockWS extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    url: string;
    options: any;

    constructor(url: string, options: any) {
      super();
      this.url = url;
      this.options = options;
      instances.push(this);
    }

    send = vi.fn();
    close = vi.fn();
  }

  return { MockWebSocket: MockWS, mockWsInstances: instances };
});

vi.mock('ws', () => ({
  default: MockWebSocket,
}));

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/python/pythonUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  runPython: vi.fn(),
}));

import { OpenAiResponsesWebSocketProvider } from '../../../src/providers/openai/responses-websocket';

describe('OpenAiResponsesWebSocketProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsInstances.length = 0;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return correct provider id', () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });
    expect(provider.id()).toBe('openai:responses-ws:gpt-4o');
  });

  it('should return model name as id when apiHost is set', () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key', apiHost: 'custom.host.com' },
    });
    expect(provider.id()).toBe('gpt-4o');
  });

  it('should send response.create via WebSocket and handle response.completed', async () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const callPromise = provider.callApi('Hello world');

    // Wait for ws constructor to be called
    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws = mockWsInstances[0];

    // Verify WebSocket URL
    expect(ws.url).toBe('wss://api.openai.com/v1/responses');
    expect(ws.options.headers.Authorization).toBe('Bearer test-key');

    // Simulate open
    ws.emit('open');

    // Verify response.create was sent
    expect(ws.send).toHaveBeenCalledOnce();
    const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentMessage.type).toBe('response.create');
    expect(sentMessage.response.model).toBe('gpt-4o');
    expect(sentMessage.response.input).toBe('Hello world');

    // Simulate response.completed
    ws.emit(
      'message',
      JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_1',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Hello!' }],
            },
          ],
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      }),
    );

    const result = await callPromise;

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello!');
    expect(result.metadata?.transport).toBe('websocket');
  });

  it('should handle WebSocket timeout', async () => {
    vi.useFakeTimers();

    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key', websocketTimeout: 5000 },
    });

    const callPromise = provider.callApi('Hello world');

    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws = mockWsInstances[0];

    ws.emit('open');

    // Advance time past timeout
    await vi.advanceTimersByTimeAsync(5001);

    const result = await callPromise;

    expect(result.error).toContain('WebSocket timeout');
    expect(result.metadata?.transport).toBe('websocket');
    expect(ws.close).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should handle WebSocket error events', async () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const callPromise = provider.callApi('Hello world');

    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws = mockWsInstances[0];

    ws.emit('error', new Error('Connection refused'));

    const result = await callPromise;

    expect(result.error).toContain('Connection refused');
    expect(result.metadata?.transport).toBe('websocket');
  });

  it('should handle API error in response', async () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const callPromise = provider.callApi('Hello world');

    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws = mockWsInstances[0];

    ws.emit('open');
    ws.emit(
      'message',
      JSON.stringify({
        type: 'error',
        error: { message: 'Rate limit exceeded' },
      }),
    );

    const result = await callPromise;

    expect(result.error).toContain('Rate limit exceeded');
  });

  it('should handle API error in response body', async () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const callPromise = provider.callApi('Hello world');

    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws = mockWsInstances[0];

    ws.emit('open');
    ws.emit(
      'message',
      JSON.stringify({
        type: 'response.completed',
        response: {
          error: { message: 'Invalid request' },
        },
      }),
    );

    const result = await callPromise;

    expect(result.error).toContain('Invalid request');
  });

  it('should execute multi-turn tool calls over WebSocket', async () => {
    const provider = new OpenAiResponsesWebSocketProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        maxToolCallRounds: 5,
        functionToolCallbacks: {
          addNumbers: async (args: string) => {
            const { a, b } = JSON.parse(args);
            return String(a + b);
          },
        },
      },
    });

    const callPromise = provider.callApi('What is 5 + 6?');

    // First WebSocket: initial request
    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(1));
    const ws1 = mockWsInstances[0];
    ws1.emit('open');
    ws1.emit(
      'message',
      JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              name: 'addNumbers',
              call_id: 'call_1',
              arguments: '{"a":5,"b":6}',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    );

    // Second WebSocket: follow-up with tool results
    await vi.waitFor(() => expect(mockWsInstances).toHaveLength(2));
    const ws2 = mockWsInstances[1];
    ws2.emit('open');

    // Verify follow-up has previous_response_id and tool outputs
    const followUpMessage = JSON.parse(ws2.send.mock.calls[0][0]);
    expect(followUpMessage.type).toBe('response.create');
    expect(followUpMessage.response.previous_response_id).toBe('resp_1');
    expect(followUpMessage.response.input).toEqual([
      { type: 'function_call_output', call_id: 'call_1', output: '11' },
    ]);

    ws2.emit(
      'message',
      JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_2',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'The sum is 11.' }],
            },
          ],
          usage: { input_tokens: 15, output_tokens: 8 },
        },
      }),
    );

    const result = await callPromise;

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('The sum is 11.');
    expect(result.metadata?.transport).toBe('websocket');
    expect(result.metadata?.toolCallRounds).toBe(1);
    expect(result.metadata?.intermediateToolCalls).toHaveLength(1);
  });
});
