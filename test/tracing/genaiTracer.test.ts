import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenAIAttributes,
  type GenAISpanContext,
  type GenAISpanResult,
  getCurrentSpanId,
  getCurrentTraceId,
  getTraceparent,
  PromptfooAttributes,
  setGenAIResponseAttributes,
  withGenAISpan,
} from '../../src/tracing/genaiTracer';

// Mock @opentelemetry/api
const mockSpan = {
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

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: vi.fn(() => mockTracer),
      getActiveSpan: vi.fn(() => mockSpan),
    },
    SpanKind: {
      CLIENT: 2,
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
  };
});

describe('genaiTracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GenAIAttributes', () => {
    it('should have correct attribute names for GenAI semantic conventions', () => {
      expect(GenAIAttributes.SYSTEM).toBe('gen_ai.system');
      expect(GenAIAttributes.OPERATION_NAME).toBe('gen_ai.operation.name');
      expect(GenAIAttributes.REQUEST_MODEL).toBe('gen_ai.request.model');
      expect(GenAIAttributes.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens');
      expect(GenAIAttributes.USAGE_OUTPUT_TOKENS).toBe('gen_ai.usage.output_tokens');
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
      await withGenAISpan(baseContext, async () => ({ output: 'test' }));

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
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

      setGenAIResponseAttributes(mockSpan as any, result);

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

      setGenAIResponseAttributes(mockSpan as any, result);

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
        responseBody: '{"token": "secret-token-value-12345678901234567890"}',
      }));

      await withGenAISpan(baseContext, async () => 'result', resultExtractor);

      const responseBodyCall = mockSpan.setAttribute.mock.calls.find(
        (call) => call[0] === PromptfooAttributes.RESPONSE_BODY,
      );
      expect(responseBodyCall).toBeDefined();
      expect(responseBodyCall![1]).toContain('<REDACTED>');
      expect(responseBodyCall![1]).not.toContain('secret-token-value-12345678901234567890');
    });
  });
});
