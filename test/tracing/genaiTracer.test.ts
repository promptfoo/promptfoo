import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenAIAttributes,
  type GenAISpanContext,
  type GenAISpanResult,
  getCurrentSpanId,
  getCurrentTraceId,
  getTraceparent,
  normalizeOperationName,
  PromptfooAttributes,
  sanitizeBody,
  setGenAIResponseAttributes,
  withGenAISpan,
} from '../../src/tracing/genaiTracer';
import { mockProcessEnv } from '../util/utils';

// Mock @opentelemetry/api
const mockSpan = {
  status: { code: 0 } as { code: number; message?: string },
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
  recordException: vi.fn(),
  spanContext: vi.fn(() => ({
    traceId: 'mock-trace-id-1234567890abcdef',
    spanId: 'mock-span-id-12345678',
    traceFlags: 1,
  })),
};

const mockTracer = {
  // Handle both 3-param (name, options, fn) and 4-param (name, options, parentContext, fn) signatures
  startActiveSpan: vi.fn((_name, _options, arg3, arg4) => {
    const fn = typeof arg4 === 'function' ? arg4 : arg3;
    return fn(mockSpan);
  }),
};
let mockActiveSpan: any = mockSpan;

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    context: {
      ...(actual as any).context,
      active: vi.fn(() => ({})),
      with: vi.fn((ctx: { __span?: unknown }, fn: (...args: any[]) => unknown, ...args: any[]) => {
        const previous = mockActiveSpan;
        mockActiveSpan = ctx.__span ?? previous;
        try {
          return fn(...args);
        } finally {
          mockActiveSpan = previous;
        }
      }),
    },
    trace: {
      ...(actual as any).trace,
      getTracer: vi.fn(() => mockTracer),
      getActiveSpan: vi.fn(() => mockActiveSpan),
      setSpan: vi.fn((_ctx: unknown, span: unknown) => ({ __span: span })),
    },
    SpanKind: {
      CLIENT: 2,
    },
    SpanStatusCode: {
      UNSET: 0,
      OK: 1,
      ERROR: 2,
    },
  };
});

describe('genaiTracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveSpan = mockSpan;
    mockSpan.status = { code: SpanStatusCode.UNSET };
    mockSpan.setStatus.mockImplementation((status: { code: number; message?: string }) => {
      if (status.code !== SpanStatusCode.UNSET && mockSpan.status.code !== SpanStatusCode.OK) {
        mockSpan.status = { ...status };
      }
      return mockSpan;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GenAIAttributes', () => {
    it('should have correct attribute names for GenAI semantic conventions', () => {
      expect(GenAIAttributes.SYSTEM).toBe('gen_ai.system');
      expect(GenAIAttributes.PROVIDER_NAME).toBe('gen_ai.provider.name');
      expect(GenAIAttributes.OPERATION_NAME).toBe('gen_ai.operation.name');
      expect(GenAIAttributes.REQUEST_MODEL).toBe('gen_ai.request.model');
      expect(GenAIAttributes.REQUEST_STREAM).toBe('gen_ai.request.stream');
      expect(GenAIAttributes.CONVERSATION_ID).toBe('gen_ai.conversation.id');
      expect(GenAIAttributes.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens');
      expect(GenAIAttributes.USAGE_OUTPUT_TOKENS).toBe('gen_ai.usage.output_tokens');
      expect(GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS).toBe(
        'gen_ai.usage.reasoning.output_tokens',
      );
    });
  });

  describe('PromptfooAttributes', () => {
    it('should have correct attribute names for promptfoo-specific attributes', () => {
      expect(PromptfooAttributes.PROVIDER_ID).toBe('promptfoo.provider.id');
      expect(PromptfooAttributes.EVAL_ID).toBe('promptfoo.eval.id');
      expect(PromptfooAttributes.TEST_INDEX).toBe('promptfoo.test.index');
      expect(PromptfooAttributes.PROMPT_LABEL).toBe('promptfoo.prompt.label');
    });
  });

  describe('withGenAISpan', () => {
    const baseContext: GenAISpanContext = {
      system: 'openai',
      operationName: 'chat',
      model: 'gpt-4',
      providerId: 'openai:gpt-4',
    };

    it('should create span with correct name', async () => {
      await withGenAISpan(baseContext, async () => ({ output: 'test' }));

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'chat gpt-4',
        expect.any(Object),
        expect.anything(), // parentContext
        expect.any(Function),
      );
    });

    it('should set span kind to CLIENT', async () => {
      await withGenAISpan(baseContext, async () => ({ output: 'test' }));

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ kind: SpanKind.CLIENT }),
        expect.anything(), // parentContext
        expect.any(Function),
      );
    });

    it('should set required GenAI attributes', async () => {
      await withGenAISpan(baseContext, async () => ({ output: 'test' }));

      const callArgs = mockTracer.startActiveSpan.mock.calls[0];
      const options = callArgs[1];

      expect(options.attributes).toMatchObject({
        [GenAIAttributes.SYSTEM]: 'openai',
        [GenAIAttributes.OPERATION_NAME]: 'chat',
        [GenAIAttributes.REQUEST_MODEL]: 'gpt-4',
        [PromptfooAttributes.PROVIDER_ID]: 'openai:gpt-4',
      });
    });

    it('should set optional request attributes when provided', async () => {
      const contextWithOptions: GenAISpanContext = {
        ...baseContext,
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        stopSequences: ['END'],
      };

      await withGenAISpan(contextWithOptions, async () => ({ output: 'test' }));

      const callArgs = mockTracer.startActiveSpan.mock.calls[0];
      const options = callArgs[1];

      expect(options.attributes).toMatchObject({
        [GenAIAttributes.REQUEST_MAX_TOKENS]: 1000,
        [GenAIAttributes.REQUEST_TEMPERATURE]: 0.7,
        [GenAIAttributes.REQUEST_TOP_P]: 0.9,
        [GenAIAttributes.REQUEST_STOP_SEQUENCES]: ['END'],
      });
    });

    it('should set promptfoo context attributes when provided', async () => {
      const contextWithPromptfoo: GenAISpanContext = {
        ...baseContext,
        evalId: 'eval-123',
        testIndex: 5,
        promptLabel: 'test-prompt',
      };

      await withGenAISpan(contextWithPromptfoo, async () => ({ output: 'test' }));

      const callArgs = mockTracer.startActiveSpan.mock.calls[0];
      const options = callArgs[1];

      expect(options.attributes).toMatchObject({
        [PromptfooAttributes.EVAL_ID]: 'eval-123',
        [PromptfooAttributes.TEST_INDEX]: 5,
        [PromptfooAttributes.PROMPT_LABEL]: 'test-prompt',
      });
    });

    it('should return the result from the wrapped function', async () => {
      const expectedResult = { output: 'Hello, world!' };

      const result = await withGenAISpan(baseContext, async () => expectedResult);

      expect(result).toEqual(expectedResult);
    });

    it('should set OK status on success', async () => {
      const restoreEnv = mockProcessEnv({ OTEL_SEMCONV_STABILITY_OPT_IN: undefined });

      try {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }));

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      } finally {
        restoreEnv();
      }
    });

    it('should not overwrite a provider-set error status in legacy mode', async () => {
      const restoreEnv = mockProcessEnv({ OTEL_SEMCONV_STABILITY_OPT_IN: undefined });

      try {
        await withGenAISpan(baseContext, async (span) => {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'aborted' });
          return { output: 'partial result' };
        });

        expect(mockSpan.setStatus.mock.calls).toEqual([
          [{ code: SpanStatusCode.ERROR, message: 'aborted' }],
        ]);
      } finally {
        restoreEnv();
      }
    });

    it('should track active-span errors from result extractors on write-only spans', async () => {
      const restoreEnv = mockProcessEnv({ OTEL_SEMCONV_STABILITY_OPT_IN: undefined });
      const statuses: Array<{ code: number; message?: string }> = [];
      const writeOnlySpan = Object.freeze({
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        setStatus: vi.fn((status: { code: number; message?: string }) => {
          statuses.push(status);
        }),
        addEvent: vi.fn(),
        addLink: vi.fn(),
        addLinks: vi.fn(),
        end: vi.fn(),
        isRecording: vi.fn(() => true),
        recordException: vi.fn(),
        spanContext: vi.fn(() => ({ traceId: 'trace', spanId: 'span', traceFlags: 1 })),
        updateName: vi.fn(),
      });
      mockTracer.startActiveSpan.mockImplementationOnce((_name, _options, arg3, arg4) => {
        const fn = typeof arg4 === 'function' ? arg4 : arg3;
        return fn(writeOnlySpan);
      });

      try {
        await withGenAISpan(
          baseContext,
          async () => ({ output: 'partial result' }),
          () => {
            trace.getActiveSpan()?.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'extractor failed',
            });
            return {};
          },
        );

        expect(statuses).toEqual([{ code: SpanStatusCode.ERROR, message: 'extractor failed' }]);
      } finally {
        restoreEnv();
      }
    });

    it('should preserve a provider-set error status under the current conventions', async () => {
      const restoreEnv = mockProcessEnv({
        OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      });

      try {
        await withGenAISpan(baseContext, async (span) => {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'aborted' });
          return { output: 'partial result' };
        });

        expect(mockSpan.setStatus).toHaveBeenCalledTimes(1);
        expect(mockSpan.setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.ERROR,
          message: 'aborted',
        });
      } finally {
        restoreEnv();
      }
    });

    it('should leave successful spans UNSET under the current conventions', async () => {
      const restoreEnv = mockProcessEnv({
        OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      });

      try {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }));

        expect(mockSpan.setStatus).not.toHaveBeenCalled();
      } finally {
        restoreEnv();
      }
    });

    it('should end the span after execution', async () => {
      await withGenAISpan(baseContext, async () => ({ output: 'test' }));

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should set ERROR status and record exception on failure', async () => {
      const error = new Error('API call failed');

      await expect(
        withGenAISpan(baseContext, async () => {
          throw error;
        }),
      ).rejects.toThrow('API call failed');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'API call failed',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });

    it('should end span even on failure', async () => {
      try {
        await withGenAISpan(baseContext, async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should call result extractor and set response attributes', async () => {
      const resultExtractor = vi.fn((_value: { output: string }) => ({
        tokenUsage: { prompt: 100, completion: 50 },
        responseId: 'resp-123',
      }));

      await withGenAISpan(baseContext, async () => ({ output: 'test' }), resultExtractor);

      expect(resultExtractor).toHaveBeenCalledWith({ output: 'test' });
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_INPUT_TOKENS, 100);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_OUTPUT_TOKENS, 50);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.RESPONSE_ID, 'resp-123');
    });
  });

  describe('setGenAIResponseAttributes', () => {
    it('should set token usage attributes', () => {
      const result: GenAISpanResult = {
        tokenUsage: {
          prompt: 100,
          completion: 50,
          total: 150,
          cached: 20,
        },
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, false);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_INPUT_TOKENS, 100);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_OUTPUT_TOKENS, 50);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_TOTAL_TOKENS, 150);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_CACHED_TOKENS, 20);
    });

    it('should set completion details attributes', () => {
      const result: GenAISpanResult = {
        tokenUsage: {
          completionDetails: {
            reasoning: 25,
            acceptedPrediction: 10,
            rejectedPrediction: 5,
          },
        },
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, false);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_REASONING_TOKENS,
        25,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS,
        10,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_REJECTED_PREDICTION_TOKENS,
        5,
      );
    });

    it('should set cache token completion details attributes', () => {
      const result: GenAISpanResult = {
        tokenUsage: {
          completionDetails: {
            cacheReadInputTokens: 150,
            cacheCreationInputTokens: 40,
          },
        },
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, false);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        150,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS,
        40,
      );
    });

    it('should emit latest OTEL reasoning and cache usage attributes when opted in', () => {
      const result: GenAISpanResult = {
        tokenUsage: {
          completionDetails: {
            reasoning: 25,
            cacheReadInputTokens: 150,
            cacheCreationInputTokens: 40,
          },
        },
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, true);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS,
        25,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS_LATEST,
        150,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS_LATEST,
        40,
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.USAGE_REASONING_TOKENS,
        expect.anything(),
      );
    });

    it('should set response metadata attributes', () => {
      const result: GenAISpanResult = {
        responseModel: 'gpt-4-0613',
        responseId: 'chatcmpl-123',
        finishReasons: ['stop'],
      };

      setGenAIResponseAttributes(mockSpan as any, result);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.RESPONSE_MODEL,
        'gpt-4-0613',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.RESPONSE_ID,
        'chatcmpl-123',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.RESPONSE_FINISH_REASONS, [
        'stop',
      ]);
    });

    it('should emit conversation identity without duplicating it as a response ID', () => {
      const result: GenAISpanResult = {
        responseId: 'thread-123',
        conversationId: 'thread-123',
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, true);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.CONVERSATION_ID,
        'thread-123',
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.RESPONSE_ID,
        expect.anything(),
      );
    });

    it('should preserve a distinct response ID alongside conversation identity', () => {
      const result: GenAISpanResult = {
        responseId: 'resp-123',
        conversationId: 'thread-123',
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, true);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.CONVERSATION_ID,
        'thread-123',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.RESPONSE_ID, 'resp-123');
    });

    it('should preserve response ID in legacy mode when a conversation ID is available', () => {
      const result: GenAISpanResult = {
        responseId: 'thread-123',
        conversationId: 'thread-123',
      };

      setGenAIResponseAttributes(mockSpan as any, result, true, false);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.RESPONSE_ID, 'thread-123');
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.CONVERSATION_ID,
        expect.anything(),
      );
    });

    it('should not set attributes for undefined values', () => {
      const result: GenAISpanResult = {
        tokenUsage: {
          prompt: 100,
          // completion, total, cached not set
        },
      };

      setGenAIResponseAttributes(mockSpan as any, result);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(GenAIAttributes.USAGE_INPUT_TOKENS, 100);
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.USAGE_OUTPUT_TOKENS,
        expect.anything(),
      );
    });
  });

  describe('getTraceparent', () => {
    it('should return W3C traceparent format', () => {
      const traceparent = getTraceparent();

      // Format: 00-traceId-spanId-traceFlags
      expect(traceparent).toBe('00-mock-trace-id-1234567890abcdef-mock-span-id-12345678-01');
    });
  });

  describe('getCurrentTraceId', () => {
    it('should return trace ID from active span', () => {
      const traceId = getCurrentTraceId();

      expect(traceId).toBe('mock-trace-id-1234567890abcdef');
    });
  });

  describe('getCurrentSpanId', () => {
    it('should return span ID from active span', () => {
      const spanId = getCurrentSpanId();

      expect(spanId).toBe('mock-span-id-12345678');
    });
  });

  describe('normalizeOperationName', () => {
    it('should map legacy "completion" to "text_completion"', () => {
      expect(normalizeOperationName('completion')).toBe('text_completion');
    });

    it('should map legacy "embedding" to "embeddings"', () => {
      expect(normalizeOperationName('embedding')).toBe('embeddings');
    });

    it('should pass through canonical names unchanged', () => {
      expect(normalizeOperationName('chat')).toBe('chat');
      expect(normalizeOperationName('text_completion')).toBe('text_completion');
      expect(normalizeOperationName('embeddings')).toBe('embeddings');
      expect(normalizeOperationName('generate_content')).toBe('generate_content');
      expect(normalizeOperationName('invoke_agent')).toBe('invoke_agent');
    });

    it('should normalize legacy names in withGenAISpan', async () => {
      const restoreEnv = mockProcessEnv({ OTEL_SEMCONV_STABILITY_OPT_IN: undefined });

      try {
        await withGenAISpan(
          { system: 'openai', operationName: 'completion', model: 'davinci', providerId: 'test' },
          async () => ({ output: 'test' }),
        );

        // Span name should use emitted operation name (legacy by default since env not set)
        expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
          'completion davinci',
          expect.any(Object),
          expect.anything(),
          expect.any(Function),
        );

        // The attribute should also be the emitted (legacy) name
        const callArgs = mockTracer.startActiveSpan.mock.calls[0];
        const options = callArgs[1];
        expect(options.attributes['gen_ai.operation.name']).toBe('completion');
      } finally {
        restoreEnv();
      }
    });

    it('should emit only latest provider identification when opted in', async () => {
      const restoreEnv = mockProcessEnv({
        OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      });

      try {
        await withGenAISpan(
          { system: 'vertex', operationName: 'completion', model: 'gemini', providerId: 'test' },
          async () => ({ output: 'test' }),
        );

        expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
          'text_completion gemini',
          expect.any(Object),
          expect.anything(),
          expect.any(Function),
        );

        const options = mockTracer.startActiveSpan.mock.calls[0][1];
        expect(options.attributes[GenAIAttributes.PROVIDER_NAME]).toBe('gcp.vertex_ai');
        expect(options.attributes).not.toHaveProperty(GenAIAttributes.SYSTEM);
      } finally {
        restoreEnv();
      }
    });

    it('should emit current agent, provider, and streaming attributes when opted in', async () => {
      const restoreEnv = mockProcessEnv({
        OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      });

      try {
        await withGenAISpan(
          {
            system: 'openai',
            providerName: 'xai',
            operationName: 'invoke_agent',
            model: 'grok-code',
            requestModel: 'grok-code-actual',
            providerId: 'xai:grok-code',
            agentName: 'reviewer',
            agentId: 'agent-123',
            stream: true,
          },
          async () => ({ output: 'test' }),
        );

        expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
          'invoke_agent reviewer',
          expect.any(Object),
          expect.anything(),
          expect.any(Function),
        );
        const attributes = mockTracer.startActiveSpan.mock.calls[0][1].attributes;
        expect(attributes).toMatchObject({
          [GenAIAttributes.PROVIDER_NAME]: 'x_ai',
          [GenAIAttributes.OPERATION_NAME]: 'invoke_agent',
          [GenAIAttributes.REQUEST_MODEL]: 'grok-code-actual',
          [GenAIAttributes.REQUEST_STREAM]: true,
          'gen_ai.agent.name': 'reviewer',
          'gen_ai.agent.id': 'agent-123',
        });
        expect(attributes).not.toHaveProperty(GenAIAttributes.SYSTEM);
      } finally {
        restoreEnv();
      }
    });

    it('should omit placeholder request models from current agent spans', async () => {
      const restoreEnv = mockProcessEnv({
        OTEL_SEMCONV_STABILITY_OPT_IN: 'gen_ai_latest_experimental',
      });

      try {
        await withGenAISpan(
          {
            system: 'openai',
            operationName: 'invoke_agent',
            model: 'agent-id-used-for-legacy-name',
            providerId: 'openai:assistant:agent-id',
            agentId: 'agent-id',
          },
          async () => ({ output: 'test' }),
        );

        const attributes = mockTracer.startActiveSpan.mock.calls[0][1].attributes;
        expect(attributes).not.toHaveProperty(GenAIAttributes.REQUEST_MODEL);
      } finally {
        restoreEnv();
      }
    });

    it('should omit false streaming and preserve new operations as chat in legacy mode', async () => {
      const restoreEnv = mockProcessEnv({ OTEL_SEMCONV_STABILITY_OPT_IN: undefined });

      try {
        await withGenAISpan(
          {
            system: 'openai',
            operationName: 'generate_content',
            model: 'gemini-2.5-pro',
            providerId: 'vertex:gemini-2.5-pro',
            stream: false,
          },
          async () => ({ output: 'test' }),
        );

        const attributes = mockTracer.startActiveSpan.mock.calls[0][1].attributes;
        expect(attributes[GenAIAttributes.OPERATION_NAME]).toBe('chat');
        expect(attributes).not.toHaveProperty(GenAIAttributes.REQUEST_STREAM);
        expect(attributes[GenAIAttributes.SYSTEM]).toBe('openai');
      } finally {
        restoreEnv();
      }
    });
  });

  describe('body sanitization', () => {
    const baseContext: GenAISpanContext = {
      system: 'openai',
      operationName: 'chat',
      model: 'gpt-4',
      providerId: 'openai:gpt-4',
      sanitizeBodies: true, // Enable sanitization for these tests
    };

    it('should redact OpenAI API keys from request body', async () => {
      const contextWithBody = {
        ...baseContext,
        requestBody: '{"api_key": "sk-proj-abcdefghij1234567890abcdefghij1234567890"}',
      };

      await withGenAISpan(contextWithBody, async () => 'result');

      // Check the attributes passed to startActiveSpan
      const call = mockTracer.startActiveSpan.mock.calls[0];
      const options = call[1];
      const requestBodyAttr = options.attributes[PromptfooAttributes.REQUEST_BODY];
      expect(requestBodyAttr).toBeDefined();
      expect(requestBodyAttr).toContain('<REDACTED_API_KEY>');
      expect(requestBodyAttr).not.toContain('sk-proj-');
    });

    it('should redact Authorization headers from request body', async () => {
      const contextWithBody = {
        ...baseContext,
        requestBody: '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"}',
      };

      await withGenAISpan(contextWithBody, async () => 'result');

      const call = mockTracer.startActiveSpan.mock.calls[0];
      const options = call[1];
      const requestBodyAttr = options.attributes[PromptfooAttributes.REQUEST_BODY];
      expect(requestBodyAttr).toBeDefined();
      expect(requestBodyAttr).toContain('<REDACTED>');
      expect(requestBodyAttr).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact AWS access keys from request body', async () => {
      const contextWithBody = {
        ...baseContext,
        requestBody: '{"credentials": "AKIAIOSFODNN7EXAMPLE"}',
      };

      await withGenAISpan(contextWithBody, async () => 'result');

      const call = mockTracer.startActiveSpan.mock.calls[0];
      const options = call[1];
      const requestBodyAttr = options.attributes[PromptfooAttributes.REQUEST_BODY];
      expect(requestBodyAttr).toBeDefined();
      expect(requestBodyAttr).toContain('<REDACTED_AWS_KEY>');
      expect(requestBodyAttr).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should redact password fields from request body', async () => {
      const contextWithBody = {
        ...baseContext,
        requestBody: '{"password": "supersecret123"}',
      };

      await withGenAISpan(contextWithBody, async () => 'result');

      const call = mockTracer.startActiveSpan.mock.calls[0];
      const options = call[1];
      const requestBodyAttr = options.attributes[PromptfooAttributes.REQUEST_BODY];
      expect(requestBodyAttr).toBeDefined();
      expect(requestBodyAttr).toContain('<REDACTED>');
      expect(requestBodyAttr).not.toContain('supersecret123');
    });

    it('should redact response body sensitive data', async () => {
      const resultExtractor = vi.fn(() => ({
        responseBody:
          '{"client_secret":"client.secret+with/slash=","refresh_token":"1//refresh+value="}',
      }));

      await withGenAISpan(baseContext, async () => 'result', resultExtractor);

      const responseBodyCall = mockSpan.setAttribute.mock.calls.find(
        (call) => call[0] === PromptfooAttributes.RESPONSE_BODY,
      );
      expect(responseBodyCall).toBeDefined();
      expect(responseBodyCall![1]).toContain('<REDACTED>');
      expect(responseBodyCall![1]).not.toContain('client.secret+with/slash=');
      expect(responseBodyCall![1]).not.toContain('1//refresh+value=');
    });

    it('should recursively redact exact sensitive JSON fields without rewriting benign fields', () => {
      const body = JSON.stringify({
        access_token: 'ya29.access/token+value=',
        nested: [{ 'x-api-key': 'key.with/slash+padding=' }, { session: 'session=value' }],
        privateKey: '-----BEGIN PRIVATE KEY-----\nmaterial\n-----END PRIVATE KEY-----',
        token_count: 42,
        session_summary: 'safe summary',
      });

      const sanitized = JSON.parse(sanitizeBody(body));

      expect(sanitized.access_token).toBe('<REDACTED>');
      expect(sanitized.nested[0]['x-api-key']).toBe('<REDACTED>');
      expect(sanitized.nested[1].session).toBe('<REDACTED>');
      expect(sanitized.privateKey).toBe('<REDACTED>');
      expect(sanitized.token_count).toBe(42);
      expect(sanitized.session_summary).toBe('safe summary');
    });

    it.each([
      ['AWS_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
      ['AZURE_OPENAI_API_KEY', 'azure-opaque-value'],
      ['OPENAI_API_KEY', 'openai-opaque-value'],
      ['GITHUB_TOKEN', 'ghp_abcdefghijklmnopqrstuvwxyz123456'],
      ['HF_TOKEN', 'hf_abcdefghijklmnopqrstuvwxyz123456'],
      ['HUGGINGFACE_API_KEY', 'huggingface-opaque-value'],
      ['GOOGLE_API_KEY', 'AIzaSyExampleKeyMaterial'],
      ['DATABRICKS_TOKEN', 'dapiabcdefghijklmnopqrstuvwxyz'],
    ])('should redact provider-prefixed credential field %s', (field, value) => {
      const json = sanitizeBody(JSON.stringify({ [field]: value }));
      const formValue = encodeURIComponent(value);
      const form = sanitizeBody(`${encodeURIComponent(field)}=${formValue}`);
      const assignment = sanitizeBody(`${field}=${value}`);

      expect(json).not.toContain(value);
      expect(form).not.toContain(formValue);
      expect(assignment).not.toContain(value);
    });

    it('should redact standard credential carriers and URL query credentials', () => {
      const body = JSON.stringify({
        'Proxy-Authorization': 'Basic dXNlcjpwYXNz',
        'Ocp-Apim-Subscription-Key': 'opaque-subscription-value',
        key: 'AIzaSySyntheticKeyMaterial',
      });
      const form =
        'subscription-key=opaque-subscription-value&x-functions-key=opaque-function-value';
      const url =
        'https://example.test/run?code=opaque-function-code&key=AIzaSySyntheticKeyMaterial';
      const encodedUrl =
        'https://example.test/run?%6B%65%79=opaque-synthetic-provider-secret&co%64e=opaque-function-code&api%5Fkey=encoded-api-secret&access%5Ftoken=encoded-access-secret&subscription%2Dkey=encoded-subscription-secret';

      expect(sanitizeBody(body)).not.toContain('dXNlcjpwYXNz');
      expect(sanitizeBody(body)).not.toContain('opaque-subscription-value');
      expect(sanitizeBody(body)).not.toContain('AIzaSySyntheticKeyMaterial');
      expect(sanitizeBody(form)).not.toContain('opaque-subscription-value');
      expect(sanitizeBody(form)).not.toContain('opaque-function-value');
      expect(sanitizeBody(url)).not.toContain('opaque-function-code');
      expect(sanitizeBody(url)).not.toContain('AIzaSySyntheticKeyMaterial');
      expect(sanitizeBody(encodedUrl)).not.toContain('opaque-synthetic-provider-secret');
      expect(sanitizeBody(encodedUrl)).not.toContain('opaque-function-code');
      expect(sanitizeBody(encodedUrl)).not.toContain('encoded-api-secret');
      expect(sanitizeBody(encodedUrl)).not.toContain('encoded-access-secret');
      expect(sanitizeBody(encodedUrl)).not.toContain('encoded-subscription-secret');
    });

    it('should sanitize assignments embedded in JSON string values', () => {
      const secret = 'opaque-synthetic-provider-secret';
      const body = JSON.stringify({
        messages: [{ role: 'user', content: `debug dump: OPENAI_API_KEY=${secret}` }],
      });

      expect(sanitizeBody(body)).not.toContain(secret);
    });

    it('should scan large non-sensitive assignment text without quadratic work', () => {
      const secret = 'opaque-synthetic-provider-secret';
      const body = `${'a='.repeat(100_000)} OPENAI_API_KEY=${secret}`;

      expect(sanitizeBody(body)).not.toContain(secret);
    });

    it('should sanitize escaped credential keys in oversized JSON', () => {
      const secret = 'opaque-synthetic-provider-secret';
      const body = `{"OPENAI\\u005fAPI\\u005fKEY":"${secret}","padding":"${'x'.repeat(17_000)}"}`;
      const nestedBody = JSON.stringify({
        credentials: { username: 'alice', value: secret },
        padding: 'x'.repeat(17_000),
      });

      expect(sanitizeBody(body)).not.toContain(secret);
      expect(sanitizeBody(nestedBody)).not.toContain(secret);
    });

    it('should fail closed for JSON beyond the bounded parser limit', () => {
      const body = JSON.stringify({ message: 'x'.repeat(300_000) });
      const unicodeBody = JSON.stringify({ message: 'é'.repeat(140_000) });
      const surrogateBody = `{"message":"${'\ud800'.repeat(100_000)}"}`;

      expect(sanitizeBody(body)).toBe('<REDACTED_OVERSIZED_JSON>');
      expect(sanitizeBody(unicodeBody)).toBe('<REDACTED_OVERSIZED_JSON>');
      expect(sanitizeBody(surrogateBody)).toBe('<REDACTED_OVERSIZED_JSON>');
      expect(sanitizeBody('a'.repeat(300_000))).toBe('<REDACTED_OVERSIZED_BODY>');
    });

    it('should handle deeply nested JSON without failing tracing', () => {
      const secret = 'opaque-secret-value-1234567890';
      const body =
        '{"a":'.repeat(5_000) +
        JSON.stringify({ credentials: { username: 'alice', value: secret } }) +
        '}'.repeat(5_000);

      expect(() => sanitizeBody(body)).not.toThrow();
      expect(sanitizeBody(body)).not.toContain(secret);
    });

    it('should fail closed instead of changing unsafe JSON numbers during redaction', () => {
      const body =
        '{"OPENAI_API_KEY":"opaque-synthetic-provider-secret","large":1e400,"id":9007199254740993}';
      const underflowBody = '{"password":"secret","p":1e-400}';
      const safeBody = '{"password":"secret","timestamp_us":1719234567890123}';
      const smallestBody = '{"password":"secret","p":5e-324}';

      expect(sanitizeBody(body)).toBe('<REDACTED_UNSANITIZABLE_JSON>');
      expect(sanitizeBody(underflowBody)).toBe('<REDACTED_UNSANITIZABLE_JSON>');
      expect(JSON.parse(sanitizeBody(safeBody)).timestamp_us).toBe(1719234567890123);
      expect(JSON.parse(sanitizeBody(smallestBody)).p).toBe(5e-324);
    });

    it('should preserve benign fields that only contain credential words', () => {
      const body = JSON.stringify({
        token_count: 4,
        max_tokens: 128,
        input_tokens: 32,
        github_token_count: 2,
        session_summary: 'safe',
        public_key: 'public',
        monkey: 'banana',
        api_key_hint: 'last four',
        tokenizer: 'cl100k_base',
        authorization_mode: 'rbac',
        password_policy: 'strong',
        signature_algorithm: 'sha256',
        secret_recipe: 'cake',
        access_key_description: 'identifier only',
        oauth: 'enabled',
        bos_token: '<s>',
        eos_token: '</s>',
        pad_token: '[PAD]',
        continuation_token: 'page-2',
        next_token: 'page-3',
        is_secret: false,
        has_password: false,
        requires_credentials: false,
        keyboard_access_key: 'menu-shortcut',
      });

      expect(sanitizeBody(body)).toBe(body);
      expect(sanitizeBody('https://example.test/search?code=200&key=id')).toBe(
        'https://example.test/search?code=200&key=id',
      );
      expect(sanitizeBody('has_password=false&is_secret=true')).toBe(
        'has_password=false&is_secret=true',
      );
    });

    it('should redact form, header, and PEM credentials without partial suffixes', () => {
      const form = sanitizeBody(
        'message=keep&access_token=ya29.access%2Ftoken%2Bvalue%3D&client_secret=short%2F%2B%3D',
      );
      expect(form).toContain('message=keep');
      expect(form).not.toContain('ya29');
      expect(form).not.toContain('short');

      const headers = sanitizeBody(
        'response text Authorization: Basic dXNlcjpwYXNzLys=\nCookie: session=abc/+=; other=value',
      );
      expect(headers).not.toContain('dXNlcjpwYXNzLys=');
      expect(headers).not.toContain('session=abc/+');

      const privateKey = sanitizeBody(
        '-----BEGIN RSA PRIVATE KEY-----\nsecret material\n-----END RSA PRIVATE KEY-----',
      );
      const unmatchedPrivateKeys = sanitizeBody('-----BEGIN PRIVATE KEY-----\n'.repeat(1_000));
      expect(privateKey).toBe('<REDACTED_PRIVATE_KEY>');
      expect(unmatchedPrivateKeys).toBe('<REDACTED_PRIVATE_KEY>');
    });

    it('should preserve benign hashes, slash text, and JSON formatting', () => {
      const hash = 'a'.repeat(64);
      const body = `{ "token_count": 4, "session_summary": "safe", "message": "${hash}/text" }`;

      expect(sanitizeBody(body)).toBe(body);
    });

    it('should preserve bodies verbatim when sanitization is disabled', async () => {
      const requestBody = '{"access_token":"plain-secret"}';
      await withGenAISpan(
        { ...baseContext, requestBody, sanitizeBodies: false },
        async () => 'result',
      );

      const attributes = mockTracer.startActiveSpan.mock.calls[0][1].attributes;
      expect(attributes[PromptfooAttributes.REQUEST_BODY]).toBe(requestBody);
    });
  });
});
