import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenAIAttributes,
  type GenAISpanContext,
  type GenAISpanResult,
  getCurrentSpanId,
  getCurrentTraceId,
  getTraceparent,
  PromptfooAttributes,
  sanitizeBody,
  setGenAIResponseAttributes,
  withGenAISpan,
  withGenAIToolSpan,
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
      getSpan: vi.fn(() => undefined),
    },
    SpanKind: {
      CLIENT: 2,
      INTERNAL: 0,
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
      expect(GenAIAttributes.PROVIDER_NAME).toBe('gen_ai.provider.name');
      expect(GenAIAttributes.OPERATION_NAME).toBe('gen_ai.operation.name');
      expect(GenAIAttributes.AGENT_ID).toBe('gen_ai.agent.id');
      expect(GenAIAttributes.AGENT_NAME).toBe('gen_ai.agent.name');
      expect(GenAIAttributes.REQUEST_MODEL).toBe('gen_ai.request.model');
      expect(GenAIAttributes.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens');
      expect(GenAIAttributes.USAGE_OUTPUT_TOKENS).toBe('gen_ai.usage.output_tokens');
      expect(GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS).toBe(
        'gen_ai.usage.reasoning.output_tokens',
      );
      expect(GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS).toBe(
        'gen_ai.usage.cache_read.input_tokens',
      );
      expect(GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS).toBe(
        'gen_ai.usage.cache_creation.input_tokens',
      );
    });
  });

  describe('PromptfooAttributes', () => {
    it('should have correct attribute names for promptfoo-specific attributes', () => {
      expect(PromptfooAttributes.PROVIDER_ID).toBe('promptfoo.provider.id');
      expect(PromptfooAttributes.EVAL_ID).toBe('promptfoo.eval.id');
      expect(PromptfooAttributes.TEST_INDEX).toBe('promptfoo.test.index');
      expect(PromptfooAttributes.PROMPT_LABEL).toBe('promptfoo.prompt.label');
      expect(PromptfooAttributes.USAGE_TOTAL_TOKENS).toBe('promptfoo.usage.total_tokens');
      expect(PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS).toBe(
        'promptfoo.usage.cached_response_tokens',
      );
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
        [GenAIAttributes.PROVIDER_NAME]: 'openai',
        [GenAIAttributes.OPERATION_NAME]: 'chat',
        [GenAIAttributes.REQUEST_MODEL]: 'gpt-4',
        [PromptfooAttributes.PROVIDER_ID]: 'openai:gpt-4',
      });
      expect(options.attributes).not.toHaveProperty(GenAIAttributes.SYSTEM);
    });

    it('identifies agent invocations without treating the agent name as a model', async () => {
      await withGenAISpan(
        {
          ...baseContext,
          operationName: 'invoke_agent',
          agentName: 'Support Agent',
          model: 'Support Agent',
        },
        async () => ({ output: 'test' }),
      );

      const [spanName, options] = mockTracer.startActiveSpan.mock.calls[0];
      expect(spanName).toBe('invoke_agent Support Agent');
      expect(options.attributes).toMatchObject({
        [GenAIAttributes.OPERATION_NAME]: 'invoke_agent',
        [GenAIAttributes.AGENT_NAME]: 'Support Agent',
      });
      expect(options.attributes).not.toHaveProperty(GenAIAttributes.REQUEST_MODEL);
    });

    it('preserves an explicitly configured model on agent invocation spans', async () => {
      await withGenAISpan(
        {
          ...baseContext,
          operationName: 'invoke_agent',
          agentName: 'Support Agent',
        },
        async () => ({ output: 'test' }),
      );

      const [, options] = mockTracer.startActiveSpan.mock.calls[0];
      expect(options.attributes).toMatchObject({
        [GenAIAttributes.AGENT_NAME]: 'Support Agent',
        [GenAIAttributes.REQUEST_MODEL]: 'gpt-4',
      });
    });

    it('keeps hosted agent identifiers separate from names and model names', async () => {
      await withGenAISpan(
        {
          ...baseContext,
          operationName: 'invoke_agent',
          agentId: 'asst_123',
          model: 'asst_123',
        },
        async () => ({ output: 'test' }),
      );

      const [spanName, options] = mockTracer.startActiveSpan.mock.calls[0];
      expect(spanName).toBe('invoke_agent');
      expect(options.attributes[GenAIAttributes.AGENT_ID]).toBe('asst_123');
      expect(options.attributes).not.toHaveProperty(GenAIAttributes.AGENT_NAME);
      expect(options.attributes).not.toHaveProperty(GenAIAttributes.REQUEST_MODEL);
    });

    it('identifies OpenAI API types without adding OpenAI attributes to other providers', async () => {
      await withGenAISpan({ ...baseContext, openaiApiType: 'responses' }, async () => ({
        output: 'test',
      }));
      await withGenAISpan(
        { ...baseContext, system: 'azure', openaiApiType: 'responses' },
        async () => ({ output: 'test' }),
      );

      expect(mockTracer.startActiveSpan.mock.calls[0][1].attributes).toHaveProperty(
        'openai.api.type',
        'responses',
      );
      expect(mockTracer.startActiveSpan.mock.calls[1][1].attributes).not.toHaveProperty(
        'openai.api.type',
      );
    });

    it.each([
      ['alibaba', 'alibaba_cloud'],
      ['bedrock', 'aws.bedrock'],
      ['azure', 'azure.ai.openai'],
      ['vertex:anthropic', 'gcp.vertex_ai'],
      ['mistral', 'mistral_ai'],
      ['watsonx', 'ibm.watsonx.ai'],
      ['xai', 'x_ai'],
      ['custom-provider', 'custom-provider'],
    ])('normalizes provider %s to %s', async (system, providerName) => {
      await withGenAISpan({ ...baseContext, system }, async () => ({ output: 'test' }));

      expect(mockTracer.startActiveSpan.mock.calls[0][1].attributes).toHaveProperty(
        GenAIAttributes.PROVIDER_NAME,
        providerName,
      );
    });

    it.each([
      ['completion', 'text_completion'],
      ['embedding', 'embeddings'],
      ['text_completion', 'text_completion'],
      ['embeddings', 'embeddings'],
    ] as const)('normalizes %s operations to %s', async (operationName, expectedOperation) => {
      await withGenAISpan({ ...baseContext, operationName }, async () => ({ output: 'test' }));

      const [name, options] = mockTracer.startActiveSpan.mock.calls[0];
      expect(name).toBe(`${expectedOperation} gpt-4`);
      expect(options.attributes[GenAIAttributes.OPERATION_NAME]).toBe(expectedOperation);
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
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('error.type', 'Error');
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });

    it('records a stable error type when a provider returns an error response', async () => {
      await withGenAISpan(baseContext, async () => ({ error: 'provider unavailable' }));

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('error.type', 'provider_error');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'provider unavailable',
      });
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

    it('preserves response-cache status omitted by a legacy result extractor', async () => {
      await withGenAISpan(
        baseContext,
        async () => ({
          output: 'cached output',
          cached: true,
          tokenUsage: { cached: 150, total: 150 },
        }),
        (response) => ({ tokenUsage: response.tokenUsage }),
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(PromptfooAttributes.CACHE_HIT, true);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS,
        150,
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        expect.anything(),
      );
    });

    it('preserves an explicit cache classification from the result extractor', async () => {
      await withGenAISpan(
        baseContext,
        async () => ({
          output: 'provider-cached output',
          cached: true,
          tokenUsage: { cached: 20 },
        }),
        (response) => ({ tokenUsage: response.tokenUsage, cacheHit: false }),
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(PromptfooAttributes.CACHE_HIT, false);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        20,
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS,
        expect.anything(),
      );
    });
  });

  describe('withGenAIToolSpan', () => {
    beforeEach(() => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as any);
    });

    it('records standard tool attributes and sanitizes inputs and output', async () => {
      const result = await withGenAIToolSpan(
        {
          name: 'lookup_account',
          arguments: { apiKey: 'sk-abcdefghijklmnopqrstuvwxyz' },
          callId: 'call-123',
        },
        async () => ({ token: 'secret-token-value-12345678901234567890' }),
      );

      expect(result).toEqual({ token: 'secret-token-value-12345678901234567890' });
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'execute_tool lookup_account',
        expect.objectContaining({
          kind: SpanKind.INTERNAL,
          attributes: expect.objectContaining({
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.name': 'lookup_account',
            'gen_ai.tool.call.id': 'call-123',
            'tool.name': 'lookup_account',
            'tool.arguments': '{"apiKey":"<REDACTED_API_KEY>"}',
          }),
        }),
        expect.any(Function),
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.output', '{"token":"<REDACTED>"}');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('does not create orphan tool spans when no parent span is active', async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      expect(await withGenAIToolSpan({ name: 'search' }, async () => 'found')).toBe('found');
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });

    it('records complete callback objects even when they contain a content property', async () => {
      const result = {
        content: 'account found',
        metadata: { destination: 'audit-log', attempt: 2 },
      };

      expect(await withGenAIToolSpan({ name: 'lookup_account' }, () => result)).toBe(result);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.output', JSON.stringify(result));
    });

    it('extracts model-visible content only for MCP results', async () => {
      const result = { content: 'account found', metadata: { requestId: 'request-123' } };

      expect(
        await withGenAIToolSpan({ name: 'lookup_account', resultFormat: 'mcp' }, () => result),
      ).toBe(result);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.output', 'account found');
    });

    it('does not classify arbitrary callback error fields as execution failures', async () => {
      const result = { content: 'account found', error: 'business-domain error detail' };

      expect(await withGenAIToolSpan({ name: 'lookup_account' }, () => result)).toBe(result);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.is_error', false);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    });

    it('does not classify empty MCP error fields as execution failures', async () => {
      const result = { content: 'account found', error: '' };

      expect(
        await withGenAIToolSpan({ name: 'lookup_account', resultFormat: 'mcp' }, () => result),
      ).toBe(result);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.is_error', false);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    });

    it('marks MCP error results as failed without changing the returned result', async () => {
      const failure = { content: 'denied', isError: true };

      expect(
        await withGenAIToolSpan({ name: 'search', resultFormat: 'mcp' }, async () => failure),
      ).toBe(failure);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.is_error', true);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('marks caught MCP SDK failures as errors without changing the returned result', async () => {
      const failure = { content: '', error: 'MCP transport disconnected' };

      expect(
        await withGenAIToolSpan({ name: 'search', resultFormat: 'mcp' }, async () => failure),
      ).toBe(failure);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.is_error', true);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('error.type', 'tool_error');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'MCP transport disconnected',
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('records thrown errors and preserves the original exception', async () => {
      const error = new Error('Tool failed');

      await expect(
        withGenAIToolSpan({ name: 'search' }, async () => {
          throw error;
        }),
      ).rejects.toBe(error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Error', message: 'Tool failed' }),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Tool failed',
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('sanitizes exception event messages and stacks without replacing the thrown error', async () => {
      const secret = 'sk-abcdefghijklmnopqrstuvwxyz';
      const error = new Error(`Authentication failed for ${secret}`);
      error.stack = `Error: Authentication failed for ${secret}\n    at executeTool (${secret})`;

      await expect(
        withGenAIToolSpan({ name: 'lookup_account' }, () => {
          throw error;
        }),
      ).rejects.toBe(error);

      const recordedError = mockSpan.recordException.mock.calls[0][0] as Error;
      expect(recordedError).not.toBe(error);
      expect(recordedError.message).toBe('Authentication failed for <REDACTED_API_KEY>');
      expect(recordedError.stack).toContain('<REDACTED_API_KEY>');
      expect(recordedError.stack).not.toContain(secret);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Authentication failed for <REDACTED_API_KEY>',
      });
    });

    it('does not fail tool execution when attributes cannot be serialized', async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(await withGenAIToolSpan({ name: 'search', arguments: circular }, () => circular)).toBe(
        circular,
      );
      expect(mockTracer.startActiveSpan.mock.calls[0][1].attributes).not.toHaveProperty(
        'tool.arguments',
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith('tool.output', expect.anything());
    });

    it('limits large tool attributes', async () => {
      const largeValue = 'x'.repeat(5000);

      await withGenAIToolSpan({ name: 'search', arguments: largeValue }, () => largeValue);

      const attributes = mockTracer.startActiveSpan.mock.calls[0][1].attributes;
      expect(attributes['tool.arguments']).toHaveLength(4096);
      expect(attributes['tool.arguments']).toContain('[truncated]');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'tool.output',
        expect.stringContaining('[truncated]'),
      );
    });
  });

  describe('setGenAIResponseAttributes', () => {
    it('should set token usage attributes', () => {
      const result: GenAISpanResult = {
        cacheHit: true,
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
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_TOTAL_TOKENS,
        150,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS,
        20,
      );
    });

    it('records provider prompt-cache reads without marking them as response-cache hits', () => {
      setGenAIResponseAttributes(mockSpan as any, {
        cacheHit: false,
        tokenUsage: { prompt: 100, completion: 50, cached: 20 },
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        20,
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS,
        expect.anything(),
      );
    });

    it('prefers explicit provider cache-read details over the legacy cached count', () => {
      setGenAIResponseAttributes(mockSpan as any, {
        cacheHit: false,
        tokenUsage: {
          cached: 20,
          completionDetails: { cacheReadInputTokens: 12 },
        },
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        12,
      );
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        20,
      );
    });

    it('keeps provider prompt-cache counts distinct on Promptfoo response-cache hits', () => {
      setGenAIResponseAttributes(mockSpan as any, {
        cacheHit: true,
        tokenUsage: {
          cached: 3_000,
          total: 3_000,
          completionDetails: { cacheReadInputTokens: 500 },
        },
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS,
        3_000,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        500,
      );
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
        GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS,
        25,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS,
        10,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        PromptfooAttributes.USAGE_REJECTED_PREDICTION_TOKENS,
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

      setGenAIResponseAttributes(mockSpan as any, result);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
        150,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS,
        40,
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

    it('supports both capture-group and functional secret replacements', () => {
      const encodedSecret = `${'a'.repeat(20)}/${'b'.repeat(19)}`;
      const ordinaryText = 'c'.repeat(40);

      expect(sanitizeBody(`password=hunter2 ${encodedSecret} ${ordinaryText}`)).toBe(
        `password=<REDACTED> <REDACTED_SECRET> ${ordinaryText}`,
      );
    });

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
