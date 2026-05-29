// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { trace } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

interface RecordedSpan {
  name: string;
  attributes: Record<string, any>;
  status?: { code: number; message?: string };
  ended: boolean;
}

function installTracerSpy(): RecordedSpan[] {
  const spans: RecordedSpan[] = [];
  const make = (name: string, attributes: Record<string, any> = {}) => {
    const entry: RecordedSpan = { name, attributes: { ...attributes }, ended: false };
    spans.push(entry);
    return {
      setAttribute: (key: string, value: unknown) => {
        entry.attributes[key] = value;
      },
      setAttributes: (attrs: Record<string, unknown>) => Object.assign(entry.attributes, attrs),
      setStatus: (status: { code: number; message?: string }) => {
        entry.status = status;
      },
      end: () => {
        entry.ended = true;
      },
      recordException: () => undefined,
      addEvent: () => undefined,
      spanContext: () => ({ traceId: 'x', spanId: 'y' }),
      isRecording: () => true,
      updateName: () => undefined,
    };
  };
  vi.spyOn(trace, 'getTracer').mockReturnValue({
    startSpan: (name: string, options?: { attributes?: Record<string, unknown> }) =>
      make(name, options?.attributes),
    startActiveSpan: (...args: any[]) => {
      const name = args[0];
      const options = typeof args[1] === 'object' ? args[1] : undefined;
      const callback = args[args.length - 1];
      return callback(make(name, options?.attributes));
    },
  } as any);
  return spans;
}

const successResponse = {
  id: 'resp_abc123',
  object: 'response',
  created_at: 1234567890,
  status: 'completed',
  model: 'gpt-4o',
  output: [
    {
      type: 'message',
      id: 'msg_abc123',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'This is a test response' }],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
};

describe('OpenAiResponsesProvider tracing', () => {
  it('emits a chat <model> span with request and response attributes', async () => {
    const spans = installTracerSpy();
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: successResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', { config: { apiKey: 'test-key' } });
    const result = await provider.callApi('Test prompt');
    expect(result.output).toBe('This is a test response');

    const chatSpan = spans.find((span) => span.name === 'chat gpt-4o');
    expect(chatSpan).toBeDefined();
    expect(chatSpan?.attributes).toMatchObject({
      'gen_ai.system': 'openai',
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gpt-4o',
      'promptfoo.provider.id': 'openai:gpt-4o',
    });
    expect(chatSpan?.attributes['gen_ai.usage.total_tokens']).toBe(30);
    expect(chatSpan?.ended).toBe(true);
    // SpanStatusCode.OK === 1
    expect(chatSpan?.status?.code).toBe(1);
  });

  it('marks the chat span ERROR when the API returns an error', async () => {
    const spans = installTracerSpy();
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: { error: { message: 'rate limited', type: 'rate_limit_error' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', { config: { apiKey: 'test-key' } });
    const result = await provider.callApi('Test prompt');
    expect(result.error).toBeDefined();

    const chatSpan = spans.find((span) => span.name === 'chat gpt-4o');
    expect(chatSpan).toBeDefined();
    // SpanStatusCode.ERROR === 2
    expect(chatSpan?.status?.code).toBe(2);
    expect(chatSpan?.ended).toBe(true);
  });
});
