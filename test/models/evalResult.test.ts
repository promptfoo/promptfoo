import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import EvalResult, {
  getStripFlags,
  projectPrompt,
  sanitizeProvider,
  sanitizeResultForJsonlArtifact,
  toSerializableProviderRef,
} from '../../src/models/evalResult';
import { hashPrompt } from '../../src/prompts/utils';
import { WebSocketProvider } from '../../src/providers/websocket';
import {
  type ApiProvider,
  type Assertion,
  type AtomicTestCase,
  type EvaluateResult,
  type Prompt,
  type ProviderOptions,
  ResultFailureReason,
} from '../../src/types/index';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
  setCachedStandaloneEvals,
} from '../../src/util/standaloneEvalCache';
import { createEvaluateResult } from '../factories/eval';
import { createMockProvider, createProviderResponse } from '../factories/provider';
import { createAtomicTestCase, createPrompt } from '../factories/testSuite';
import { mockProcessEnv } from '../util/utils';

const createNestedAuthorizationFixture = () => ({
  transformedRequest: {
    headers: {
      Authorization: 'Bearer nested-secret',
    },
  },
});

const createUserTraceMetadataFixture = () => ({
  __promptfoo: {
    traceLinkage: { traceId: 'user-trace', evaluationId: 'user-evaluation' },
    retained: 'user-metadata',
  },
});

describe('EvalResult', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockProvider: ProviderOptions = {
    id: 'test-provider',
    label: 'Test Provider',
  };

  const mockTestCase: AtomicTestCase = createAtomicTestCase({ provider: mockProvider });

  const mockPrompt: Prompt = createPrompt('Test prompt', {
    display: 'Test prompt',
    label: 'Test label',
  });

  const mockEvaluateResult: EvaluateResult = createEvaluateResult({
    prompt: mockPrompt,
    provider: mockProvider,
    testCase: mockTestCase,
    latencyMs: 100,
    cost: 0.01,
    metadata: {},
    id: 'test-id',
    promptId: hashPrompt(mockPrompt),
    response: undefined,
  });

  describe('sanitizeProvider', () => {
    it('should handle ApiProvider objects', () => {
      const apiProvider = createMockProvider({
        id: 'test-provider',
        label: 'Test Provider',
        response: createProviderResponse({ output: 'test' }),
        config: { apiKey: 'test-key' },
      });

      apiProvider.prompts = ['ordinary runtime selector'];
      const result = sanitizeProvider(apiProvider);
      expect(apiProvider.prompts).toEqual(['ordinary runtime selector']);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should handle ProviderOptions objects', () => {
      const providerOptions: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        prompts: ['ordinary runtime selector'],
        config: {
          apiKey: 'test-key',
        },
      };

      const result = sanitizeProvider(providerOptions);
      expect(providerOptions.prompts).toEqual(['ordinary runtime selector']);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should handle generic objects with id function', () => {
      const provider = {
        id: () => 'test-provider',
        label: 'Test Provider',
        prompts: ['ordinary runtime selector'],
        config: {
          apiKey: 'test-key',
        },
      } as ApiProvider;

      const result = sanitizeProvider(provider);
      expect(provider.prompts).toEqual(['ordinary runtime selector']);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should redact env-rendered credentials from templated WebSocket provider data', () => {
      const provider = new WebSocketProvider('websocket', {
        config: {
          url: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=runtime-secret',
          messageTemplate: '{{ prompt }}',
        },
      });

      expect(sanitizeProvider(provider)).toEqual({
        id: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=%5BREDACTED%5D',
        label: undefined,
        config: {
          url: 'ws://127.0.0.1/sessions/{{ sessionId }}?token=%5BREDACTED%5D',
          messageTemplate: '{{ prompt }}',
        },
      });
    });
  });

  describe('createFromEvaluateResult', () => {
    it.each<Assertion>([
      {
        type: 'is-json',
        value: {
          type: 'object',
          properties: { token: { type: 'string' }, password: { type: 'string' } },
          required: ['token'],
        },
      },
      { type: 'equals', value: '{ "token": "test input",  "number": 1 }' },
    ])('preserves $type assertion values while redacting grader settings', async (assertion) => {
      const credential = 'fixture-grader-credential';
      const gradingResult = {
        pass: true,
        score: 1,
        reason: 'ok',
        assertion,
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion: {
              ...assertion,
              provider: {
                id: `https://grader.example/check?api_key=${credential}`,
                config: { apiKey: credential },
              },
              config: { headers: { Authorization: credential } },
            },
          },
        ],
      };
      const input = { ...mockEvaluateResult, gradingResult };
      const artifact = sanitizeResultForJsonlArtifact(input);
      const result = await EvalResult.createFromEvaluateResult(
        `assertion-values-${assertion.type}`,
        input,
        { persist: true },
      );

      for (const saved of [artifact, result, await EvalResult.findById(result.id)]) {
        expect(saved?.gradingResult?.assertion?.value).toEqual(assertion.value);
        expect(saved?.gradingResult?.componentResults?.[0].assertion?.value).toEqual(
          assertion.value,
        );
        expect(JSON.stringify(saved?.gradingResult)).not.toContain(credential);
      }

      result.gradingResult = gradingResult;
      await result.save();
      const updated = await EvalResult.findById(result.id);
      expect(updated?.gradingResult?.assertion?.value).toEqual(assertion.value);
      expect(updated?.gradingResult?.componentResults?.[0].assertion?.value).toEqual(
        assertion.value,
      );
      expect(JSON.stringify(updated?.gradingResult)).not.toContain(credential);
      expect(gradingResult.componentResults[0].assertion.provider.config.apiKey).toBe(credential);
    });

    it('preserves URL test inputs while redacting provider URL credentials', async () => {
      const url = 'https://cdn.example/image?X-Amz-Signature=short-secret&q=hello world';
      const vars = { image: url, imageUrl: url };
      const provider: ProviderOptions = { id: 'test-provider', config: { apiBaseUrl: url } };
      const result = await EvalResult.createFromEvaluateResult('url-inputs', {
        ...mockEvaluateResult,
        testCase: { ...mockTestCase, vars },
        provider,
      });
      const saved = await EvalResult.findById(result.id);
      expect(saved?.testCase.vars).toEqual(vars);
      expect(saved?.provider.config?.apiBaseUrl).not.toContain('short-secret');
    });

    it('should create and persist an EvalResult', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult);

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.evalId).toBe(evalId);
      expect(result.promptId).toBe(hashPrompt(mockPrompt));
      expect(result.persisted).toBe(true);

      // Verify it was persisted to database
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.score).toBe(mockEvaluateResult.score);
    });

    it('should create without persisting when persist option is false', async () => {
      const evalId = 'test-eval-id';
      const result = await EvalResult.createFromEvaluateResult(evalId, mockEvaluateResult, {
        persist: false,
      });

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.persisted).toBe(false);

      // Verify it was not persisted to database
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).toBeNull();
    });

    it('should preserve response headers when persist option is false', async () => {
      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-non-persisted-headers',
        {
          ...mockEvaluateResult,
          response: createProviderResponse({
            output: 'test',
            metadata: {
              http: {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type': 'application/json',
                  'x-request-id': 'req_in_memory',
                },
              },
            },
          }),
        },
        { persist: false },
      );

      expect(result.persisted).toBe(false);
      expect(result.response?.metadata?.http?.headers).toEqual({
        'content-type': 'application/json',
        'x-request-id': 'req_in_memory',
      });
    });

    it('preserves trace linkage across single-row persistence', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-trace-linkage', {
        ...mockEvaluateResult,
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: { source: 'single' },
      });

      const retrieved = await EvalResult.findById(result.id);

      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: { source: 'single' },
      });
    });

    it('preserves repeat linkage across single-row persistence', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-repeat-linkage', {
        ...mockEvaluateResult,
        repeatIndex: 2,
        repeatGroupId: 'test-0-vars-1',
        metadata: { source: 'repeat' },
      });

      const retrieved = await EvalResult.findById(result.id);

      expect(retrieved?.toEvaluateResult()).toMatchObject({
        repeatIndex: 2,
        repeatGroupId: 'test-0-vars-1',
        metadata: { source: 'repeat' },
      });
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('warns and overwrites when user metadata.__promptfoo is non-object', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const result = await EvalResult.createFromEvaluateResult('test-eval-non-object-promptfoo', {
        ...mockEvaluateResult,
        traceId: 'wins-over-user',
        evaluationId: 'wins-over-user',
        metadata: { userKey: 'kept', __promptfoo: 'unexpected-string' as any },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-object metadata.__promptfoo'),
      );
      // Trace linkage takes precedence; non-object value is overwritten (not preserved).
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'wins-over-user',
        evaluationId: 'wins-over-user',
        metadata: { userKey: 'kept' },
      });
      // The read-side strip happens on findById, not just construction.
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
      expect(retrieved?.toEvaluateResult().metadata).toEqual({ userKey: 'kept' });
    });

    it('warns before replacing an existing reserved traceLinkage property', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const result = await EvalResult.createFromEvaluateResult('test-eval-existing-linkage', {
        ...mockEvaluateResult,
        traceId: 'internal-trace',
        evaluationId: 'internal-evaluation',
        metadata: createUserTraceMetadataFixture(),
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('metadata.__promptfoo.traceLinkage'),
      );
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'internal-trace',
        evaluationId: 'internal-evaluation',
        metadata: { __promptfoo: { retained: 'user-metadata' } },
      });
    });

    it('strips user-supplied reserved trace linkage from untraced rows', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-injected-linkage', {
        ...mockEvaluateResult,
        metadata: createUserTraceMetadataFixture(),
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        metadata: { __promptfoo: { retained: 'user-metadata' } },
      });
      expect(retrieved?.traceId).toBeUndefined();
      expect(retrieved?.evaluationId).toBeUndefined();
    });

    it('round-trips evaluationId without traceId (malformed traceparent path)', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-only-id', {
        ...mockEvaluateResult,
        evaluationId: 'eval-only',
        metadata: { source: 'eval-only-test' },
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        evaluationId: 'eval-only',
        metadata: { source: 'eval-only-test' },
      });
      expect(retrieved?.toEvaluateResult().traceId).toBeUndefined();
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('preserves user metadata alongside persisted trace linkage', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-user-metadata', {
        ...mockEvaluateResult,
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: {
          __traceId: 'user-trace-id',
          __evaluationId: 'user-evaluation-id',
          __promptfoo: { source: 'user' },
        },
      });

      expect(result.metadata).toEqual({
        __traceId: 'user-trace-id',
        __evaluationId: 'user-evaluation-id',
        __promptfoo: { source: 'user' },
      });
      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'single-trace-id',
        evaluationId: 'single-evaluation-id',
        metadata: {
          __traceId: 'user-trace-id',
          __evaluationId: 'user-evaluation-id',
          __promptfoo: { source: 'user' },
        },
      });
    });

    it('should properly handle circular references in provider', async () => {
      const evalId = 'test-eval-id';

      // Create a provider with a circular reference
      const circularProvider: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: undefined as any,
        },
      };
      circularProvider.config.circular = circularProvider;

      const testCaseWithCircular: AtomicTestCase = {
        ...mockTestCase,
        provider: circularProvider,
      };

      const resultWithCircular = await EvalResult.createFromEvaluateResult(
        evalId,
        {
          ...mockEvaluateResult,
          provider: circularProvider,
          testCase: testCaseWithCircular,
        },
        { persist: true },
      );

      // Verify the provider was properly serialized
      expect(resultWithCircular.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });

      // Verify it can be persisted without errors
      const retrieved = await EvalResult.findById(resultWithCircular.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          circular: {
            id: 'test-provider',
            label: 'Test Provider',
          },
        },
      });
    });

    // Regression test for #7266: Node.js Timeout objects contain circular
    // _idlePrev/_idleNext references, which previously caused
    // "Converting circular structure to JSON" failures during result serialization.
    it('should handle results with Timeout objects (regression test for #7266)', async () => {
      const evalId = 'test-eval-timeout';

      // Create a result with a Node.js Timeout object in metadata
      // This simulates the issue reported in GitHub #7266 where Python providers
      // could leak Timeout objects into results, causing "Converting circular structure to JSON" errors
      const timeoutHandle = setTimeout(() => {}, 10000);

      try {
        const resultWithTimeout: EvaluateResult = {
          ...mockEvaluateResult,
          metadata: {
            someData: 'value',
            // Simulate a leaked timer - this has circular _idlePrev/_idleNext references
            leakedTimer: timeoutHandle as unknown as string,
          },
        };

        // This should NOT throw "Converting circular structure to JSON"
        const result = await EvalResult.createFromEvaluateResult(evalId, resultWithTimeout, {
          persist: true,
        });

        // The result should be saved successfully
        expect(result).toBeInstanceOf(EvalResult);
        expect(result.persisted).toBe(true);

        // Verify it can be retrieved from the database
        const retrieved = await EvalResult.findById(result.id);
        expect(retrieved).not.toBeNull();

        // The metadata should be sanitized (timer stripped or converted to empty object)
        // Either approach is acceptable - the key is that it doesn't throw
        expect(retrieved?.metadata).toBeDefined();
      } finally {
        clearTimeout(timeoutHandle);
      }
    });

    it('should handle results with functions in response (non-serializable)', async () => {
      const evalId = 'test-eval-function';

      // Create a response with non-serializable data (functions)
      // This simulates data that might leak from providers
      const responseWithFunction = {
        output: 'test output',
        someCallback: () => {},
      };

      const resultWithFunctions: EvaluateResult = {
        ...mockEvaluateResult,
        // Cast to bypass type checking - simulating runtime contamination
        response: responseWithFunction as unknown as typeof mockEvaluateResult.response,
      };

      // This should NOT throw
      const result = await EvalResult.createFromEvaluateResult(evalId, resultWithFunctions, {
        persist: true,
      });

      expect(result).toBeInstanceOf(EvalResult);
      expect(result.persisted).toBe(true);

      // Verify the output was preserved
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.response?.output).toBe('test output');
    });

    // Regression context (PR #8688): provider credentials such as apiKey/token
    // were leaking into persisted eval results and API-visible response payloads.
    describe('credential redaction (regression for PR #8688 review)', () => {
      it('redacts apiKey in testCase.options.provider.config', async () => {
        const evalId = 'test-eval-redact-options-provider';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: {
                provider: {
                  id: 'anthropic:messages:claude-3-haiku',
                  config: { apiKey: 'sk-ant-api03-SHOULD-BE-REDACTED' },
                },
              },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.testCase);
        expect(serialized).not.toContain('sk-ant-api03-SHOULD-BE-REDACTED');
        expect(serialized).toContain('[REDACTED]');

        // Also verify the DB-persisted row is clean.
        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.testCase)).not.toContain(
          'sk-ant-api03-SHOULD-BE-REDACTED',
        );
      });

      it('redacts apiKey in prompt.config.provider.config', async () => {
        const evalId = 'test-eval-redact-prompt-provider';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            prompt: {
              ...mockPrompt,
              config: {
                provider: {
                  id: 'anthropic:messages:claude-3-haiku',
                  config: { apiKey: 'sk-ant-api03-PROMPT-SHOULD-BE-REDACTED' },
                },
              },
            } as unknown as Prompt,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.prompt);
        expect(serialized).not.toContain('sk-ant-api03-PROMPT-SHOULD-BE-REDACTED');
        expect(serialized).toContain('[REDACTED]');

        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.prompt)).not.toContain(
          'sk-ant-api03-PROMPT-SHOULD-BE-REDACTED',
        );
      });

      it('redacts sensitive provider response headers without changing output', async () => {
        const evalId = 'test-eval-redact-response-headers';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            metadata: {
              http: {
                status: 200,
                statusText: 'OK',
                headers: {
                  'openai-project': 'metadata_proj_should_not_persist',
                  'set-cookie': 'metadata-session=secret',
                  'x-ratelimit-remaining-requests': '199',
                },
              },
            },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    http: {
                      status: 200,
                      statusText: 'OK',
                      headers: {
                        'openai-project': 'grading_proj_should_not_persist',
                        'set-cookie': 'grading-session=secret',
                        'x-ratelimit-remaining-requests': '2399',
                      },
                    },
                  },
                },
              ],
            },
            response: createProviderResponse({
              output: {
                password: 'model output should stay intact',
              },
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'openai-project': 'proj_should_not_persist',
                    'set-cookie': 'session=secret',
                    'x-ratelimit-remaining-requests': '199',
                    'x-request-id': 'req_should_not_persist',
                  },
                  requestHeaders: {
                    authorization: 'Bearer sk-should-not-persist',
                    'api-key': 'azure-api-key-should-not-persist',
                    'X-API-Key': 'custom-api-key-should-not-persist',
                    'x-safe-debug': 'keep-me',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.output).toEqual({ password: 'model output should stay intact' });
        expect(result.response?.metadata?.http?.headers).toEqual({
          'content-type': 'application/json',
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
          'x-request-id': '[REDACTED]',
        });
        expect(result.response?.metadata?.http?.requestHeaders).toEqual({
          authorization: '[REDACTED]',
          'api-key': '[REDACTED]',
          'X-API-Key': '[REDACTED]',
          'x-safe-debug': 'keep-me',
        });
        expect(result.metadata?.http?.headers).toEqual({
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
        });
        expect(result.gradingResult?.componentResults?.[0].metadata?.http?.headers).toEqual({
          'openai-project': '[REDACTED]',
          'set-cookie': '[REDACTED]',
          'x-ratelimit-remaining-requests': '[REDACTED]',
        });

        const retrieved = await EvalResult.findById(result.id);
        expect(JSON.stringify(retrieved?.response)).not.toContain('proj_should_not_persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain('session=secret');
        expect(JSON.stringify(retrieved?.response)).not.toContain('req_should_not_persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain('sk-should-not-persist');
        expect(JSON.stringify(retrieved?.response)).not.toContain(
          'azure-api-key-should-not-persist',
        );
        expect(JSON.stringify(retrieved?.response)).not.toContain(
          'custom-api-key-should-not-persist',
        );
        expect(JSON.stringify(retrieved?.metadata)).not.toContain(
          'metadata_proj_should_not_persist',
        );
        expect(JSON.stringify(retrieved?.metadata)).not.toContain('metadata-session=secret');
        expect(JSON.stringify(retrieved?.gradingResult)).not.toContain(
          'grading_proj_should_not_persist',
        );
        expect(JSON.stringify(retrieved?.gradingResult)).not.toContain('grading-session=secret');
      });

      it('preserves arbitrary legacy headers in grading metadata', async () => {
        const evalId = 'test-eval-preserve-grading-metadata-headers';
        const gradingMetadataHeaders = {
          'set-cookie': ['user-authored-grading-cookie'],
          'x-request-id': {
            value: 'user-authored-grading-request-id',
          },
        };
        const componentMetadataHeaders = {
          'x-request-id': 'user-authored-component-request-id',
        };

        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              metadata: {
                headers: gradingMetadataHeaders,
              },
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    headers: componentMetadataHeaders,
                  },
                },
              ],
            },
          },
          { persist: true },
        );

        // Grading metadata has no transport provenance, so its arbitrary `headers` must be kept.
        expect(result.gradingResult?.metadata?.headers).toEqual(gradingMetadataHeaders);
        expect(result.gradingResult?.componentResults?.[0].metadata?.headers).toEqual(
          componentMetadataHeaders,
        );

        const retrieved = await EvalResult.findById(result.id);
        expect(retrieved?.gradingResult?.metadata?.headers).toEqual(gradingMetadataHeaders);
        expect(retrieved?.gradingResult?.componentResults?.[0].metadata?.headers).toEqual(
          componentMetadataHeaders,
        );
      });

      it('preserves user-controlled `http` keys nested inside response.output, response.metadata, and gradingResult', async () => {
        // Regression: a previous implementation walked any nested `http` key in the
        // response/metadata/gradingResult tree and rewrote `headers` /
        // `requestHeaders`. Legitimate model output that happens to contain an
        // `http` key (e.g. an agent describing a request it observed) must survive
        // persistence intact. See PR #8876 review thread.
        const evalId = 'test-eval-redact-scope-output';
        const userOutputHttp = {
          headers: {
            'x-request-id': 'user-controlled-id-keep-me',
            'set-cookie': 'user-controlled-cookie-keep-me',
            authorization: 'Bearer user-output-token-keep-me',
          },
        };

        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            metadata: {
              // arbitrary user metadata path that happens to use `http` as a key
              // — must NOT be rewritten because it isn't `metadata.http`.
              traces: [{ http: { headers: { 'x-request-id': 'trace-keep-me' } } }],
            },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'ok',
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'ok',
                  metadata: {
                    judgeOutput: {
                      // legitimate judge output: a model describing http traffic
                      http: { headers: { authorization: 'Bearer keep-me-too' } },
                    },
                  },
                },
              ],
            },
            response: createProviderResponse({
              output: {
                http: userOutputHttp,
                quote: 'cf-ray was: abc-123',
              },
              audio: {
                // an arbitrary `http` key inside a nested non-metadata field
                http: { headers: { 'set-cookie': 'audio-http-keep-me' } },
              } as any,
            }),
          },
          { persist: true },
        );

        // Output stays bit-identical
        expect((result.response?.output as any).http).toEqual(userOutputHttp);
        expect((result.response?.output as any).quote).toBe('cf-ray was: abc-123');
        expect((result.response?.audio as any)?.http?.headers?.['set-cookie']).toBe(
          'audio-http-keep-me',
        );

        // Top-level result.metadata has no metadata.http, so nothing redacts
        expect(result.metadata?.traces?.[0]?.http?.headers?.['x-request-id']).toBe('trace-keep-me');

        // gradingResult.componentResults[].metadata only redacts metadata.http,
        // not metadata.judgeOutput.http
        expect(
          (result.gradingResult?.componentResults?.[0]?.metadata as Record<string, any> | undefined)
            ?.judgeOutput?.http?.headers?.authorization,
        ).toBe('Bearer keep-me-too');

        // Round-trip through DB: nothing was rewritten
        const retrieved = await EvalResult.findById(result.id);
        const serialized = JSON.stringify(retrieved);
        expect(serialized).toContain('user-controlled-id-keep-me');
        expect(serialized).toContain('user-controlled-cookie-keep-me');
        expect(serialized).toContain('user-output-token-keep-me');
        expect(serialized).toContain('audio-http-keep-me');
        expect(serialized).toContain('trace-keep-me');
        expect(serialized).toContain('keep-me-too');
        expect(serialized).toContain('cf-ray was: abc-123');
      });

      it('redacts headers added in this PR (proxy-authorization, x-amzn-requestid, x-trace-id, etc.)', async () => {
        const evalId = 'test-eval-redact-extended-headers';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            response: createProviderResponse({
              output: 'hello',
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'proxy-authorization': 'Basic proxy-secret',
                    'x-amzn-requestid': 'req_amzn_should_redact',
                    'x-amzn-trace-id': 'Root=trace-id',
                    'x-amz-security-token': 'amz-token-secret',
                    'x-amz-cf-id': 'cf-id-secret',
                    'x-azure-ref': 'azure-ref-secret',
                    'x-correlation-id': 'corr-secret',
                    'x-trace-id': 'trace-secret',
                    'cf-cache-status': 'HIT',
                    'openai-version': '2024-01-01',
                    via: '1.1 proxy.example',
                    // header name that doesn't match — must be preserved
                    'x-safe-debug': 'keep-me',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.metadata?.http?.headers).toEqual({
          'content-type': 'application/json',
          'proxy-authorization': '[REDACTED]',
          'x-amzn-requestid': '[REDACTED]',
          'x-amzn-trace-id': '[REDACTED]',
          'x-amz-security-token': '[REDACTED]',
          'x-amz-cf-id': '[REDACTED]',
          'x-azure-ref': '[REDACTED]',
          'x-correlation-id': '[REDACTED]',
          'x-trace-id': '[REDACTED]',
          'cf-cache-status': '[REDACTED]',
          'openai-version': '[REDACTED]',
          via: '[REDACTED]',
          'x-safe-debug': 'keep-me',
        });
      });

      it('redacts response headers regardless of header-name casing', async () => {
        const evalId = 'test-eval-redact-casing';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            response: createProviderResponse({
              output: 'hello',
              metadata: {
                http: {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    Authorization: 'Bearer mixed-case-secret',
                    'Set-Cookie': 'session=mixed',
                    'CF-RAY': 'cf-mixed',
                    'X-Request-Id': 'req-mixed',
                    'X-RateLimit-Remaining': '99',
                  },
                },
              },
            }),
          },
          { persist: true },
        );

        expect(result.response?.metadata?.http?.headers).toEqual({
          Authorization: '[REDACTED]',
          'Set-Cookie': '[REDACTED]',
          'CF-RAY': '[REDACTED]',
          'X-Request-Id': '[REDACTED]',
          'X-RateLimit-Remaining': '[REDACTED]',
        });
      });

      it('redacts credentials from an instantiated provider object embedded in testCase.options.provider', async () => {
        // Mimic the real Anthropic / Bedrock shape: the resolved judge provider is an
        // ApiProvider instance whose internal SDK client carries `apiKey`, `_options`,
        // `authToken`, and circular `_client` back-references. Before the fix, all of
        // these survived sanitizeForDb (which only strips circular refs) and persisted
        // through the eval results API.
        const sdkClientA: { _client?: unknown; apiKey: string; _options: { apiKey: string } } = {
          apiKey: 'sk-ant-api03-INSTANCE-KEY',
          _options: { apiKey: 'sk-ant-api03-INSTANCE-KEY' },
        };
        sdkClientA._client = sdkClientA;
        const instantiatedProvider = {
          id: () => 'anthropic:messages:claude-3-haiku',
          label: 'Judge',
          config: { apiKey: 'sk-ant-api03-CONFIG-KEY' },
          apiKey: 'sk-ant-api03-TOPLEVEL-KEY',
          anthropic: sdkClientA,
          callApi: async () => ({ output: 'ok' }),
        };

        const evalId = 'test-eval-redact-instantiated';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: {
                provider: instantiatedProvider as unknown as ApiProvider,
              },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        const serialized = JSON.stringify(result.testCase);
        expect(serialized).not.toContain('sk-ant-api03-INSTANCE-KEY');
        expect(serialized).not.toContain('sk-ant-api03-CONFIG-KEY');
        expect(serialized).not.toContain('sk-ant-api03-TOPLEVEL-KEY');
        expect(serialized).toContain('[REDACTED]');
      });

      it('does not crash when redacting a provider with a live circular SDK client', async () => {
        const sdkClient: { _client?: unknown; apiKey: string } = { apiKey: 'sk-live-leak' };
        sdkClient._client = sdkClient;
        const cyclicProvider = {
          id: 'anthropic:messages:claude-3-haiku',
          config: { apiKey: 'sk-live-leak', sdk: sdkClient },
        };

        const evalId = 'test-eval-redact-cyclic';
        const result = await EvalResult.createFromEvaluateResult(
          evalId,
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: { provider: cyclicProvider },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        expect(result.persisted).toBe(true);
        expect(JSON.stringify(result.testCase)).not.toContain('sk-live-leak');
      });
    });

    it('should redact apiKey while preserving non-circular nested provider properties', async () => {
      const evalId = 'test-eval-id';

      const providerWithNestedData: ProviderOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'secret-key',
          options: {
            temperature: 0.7,
            maxTokens: 100,
          },
        },
      };

      const result = await EvalResult.createFromEvaluateResult(
        evalId,
        {
          ...mockEvaluateResult,
          provider: providerWithNestedData,
          testCase: { ...mockTestCase, provider: providerWithNestedData },
        },
        { persist: true },
      );

      // Verify secrets are redacted while nested non-secret properties are preserved
      expect(result.provider?.config?.apiKey).toBe('[REDACTED]');
      expect(result.provider?.config?.options).toEqual({
        temperature: 0.7,
        maxTokens: 100,
      });

      // Verify it can be persisted and retrieved with redaction and nested properties intact
      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider?.config?.apiKey).toBe('[REDACTED]');
      expect(retrieved?.provider?.config?.options).toEqual({
        temperature: 0.7,
        maxTokens: 100,
      });
    });
  });

  describe('findManyByEvalId', () => {
    it('should retrieve multiple results for an eval ID', async () => {
      const evalId = 'test-eval-id-multiple';

      // Create multiple results
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId);
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(EvalResult);
      expect(results[1]).toBeInstanceOf(EvalResult);
    });

    it('should filter by testIdx when provided', async () => {
      const evalId = 'test-eval-id-filter';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        testCase: mockTestCase,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        testCase: mockTestCase,
      });

      const results = await EvalResult.findManyByEvalId(evalId, { testIdx: 0 });
      expect(results).toHaveLength(1);
      expect(results[0].testIdx).toBe(0);
    });
  });

  describe('createManyFromEvaluateResult', () => {
    it('preserves trace linkage across bulk persistence', async () => {
      const [result] = await EvalResult.createManyFromEvaluateResult(
        [
          {
            ...mockEvaluateResult,
            traceId: 'bulk-trace-id',
            evaluationId: 'bulk-evaluation-id',
            metadata: { source: 'import' },
          },
        ],
        'test-eval-bulk-trace-linkage',
      );

      expect(result.toEvaluateResult()).toMatchObject({
        traceId: 'bulk-trace-id',
        evaluationId: 'bulk-evaluation-id',
        metadata: { source: 'import' },
      });
    });
  });

  describe('save', () => {
    it('should save new results', async () => {
      const result = new EvalResult({
        id: 'test-save-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      await result.save();
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved).not.toBeNull();
    });

    it('should update existing results', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult);
      const cacheKey = getStandaloneEvalCacheKey();
      setCachedStandaloneEvals(cacheKey, []);

      result.score = 0.5;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.score).toBe(0.5);
      expect(getCachedStandaloneEvals(cacheKey)).toBeUndefined();
    });

    it('clears the standalone cache when a new result is inserted via save()', async () => {
      // persist:false yields an in-memory result, so save() takes the INSERT branch. This pins
      // the PR's headline behavior — incrementally-added results invalidate the standalone cache.
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult, {
        persist: false,
      });
      expect(result.persisted).toBe(false);

      const cacheKey = getStandaloneEvalCacheKey();
      setCachedStandaloneEvals(cacheKey, []);

      await result.save();

      expect(result.persisted).toBe(true);
      expect(getCachedStandaloneEvals(cacheKey)).toBeUndefined();
    });

    it('preserves trace linkage when save() updates an existing row', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-save-trace', {
        ...mockEvaluateResult,
        traceId: 'persisted-trace-id',
        evaluationId: 'persisted-evaluation-id',
        metadata: { source: 'pre-save' },
      });

      result.score = 0.42;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        score: 0.42,
        traceId: 'persisted-trace-id',
        evaluationId: 'persisted-evaluation-id',
        metadata: { source: 'pre-save' },
      });
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('persists trace linkage on the save() INSERT branch', async () => {
      // persist:false yields an in-memory result, so the first save() takes the INSERT branch
      // (the UPDATE branch is covered above). This pins trace-linkage persistence on insert.
      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-save-insert-trace',
        {
          ...mockEvaluateResult,
          traceId: 'insert-trace-id',
          evaluationId: 'insert-evaluation-id',
          metadata: { source: 'insert' },
        },
        { persist: false },
      );
      expect(result.persisted).toBe(false);

      await result.save();
      expect(result.persisted).toBe(true);

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'insert-trace-id',
        evaluationId: 'insert-evaluation-id',
        metadata: { source: 'insert' },
      });
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
    });

    it('strips the reserved namespace even when stored trace ids are malformed (non-string)', async () => {
      // Guards against a corrupted/hand-written row: malformed ids don't surface, but the
      // internal `__promptfoo` namespace must never leak back into user-visible metadata.
      const result = await EvalResult.createFromEvaluateResult('test-eval-malformed-linkage', {
        ...mockEvaluateResult,
        traceId: 123 as unknown as string,
        evaluationId: null as unknown as string,
        metadata: { source: 'malformed' },
      });

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult().traceId).toBeUndefined();
      expect(retrieved?.toEvaluateResult().evaluationId).toBeUndefined();
      expect(retrieved?.metadata).not.toHaveProperty('__promptfoo');
      expect(retrieved?.metadata).toEqual({ source: 'malformed' });
    });

    it('persists trace linkage mutated after construction', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-mutate-trace', {
        ...mockEvaluateResult,
        traceId: 'initial-trace',
        evaluationId: 'initial-evaluation',
      });

      result.traceId = 'updated-trace';
      result.evaluationId = 'updated-evaluation';
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.traceId).toBe('updated-trace');
      expect(retrieved?.evaluationId).toBe('updated-evaluation');
    });

    it('clears trace linkage when both fields are unset before save()', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-clear-trace', {
        ...mockEvaluateResult,
        traceId: 'about-to-clear',
        evaluationId: 'about-to-clear',
        metadata: { source: 'clear-test' },
      });

      result.traceId = undefined;
      result.evaluationId = undefined;
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.traceId).toBeUndefined();
      expect(retrieved?.evaluationId).toBeUndefined();
      expect(retrieved?.metadata).toEqual({ source: 'clear-test' });
    });

    it('save() is idempotent when called multiple times without changes', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-idempotent', {
        ...mockEvaluateResult,
        traceId: 'idempotent-trace',
        evaluationId: 'idempotent-evaluation',
        metadata: { source: 'idempotent' },
      });

      await result.save();
      await result.save();
      await result.save();

      const retrieved = await EvalResult.findById(result.id);
      expect(retrieved?.toEvaluateResult()).toMatchObject({
        traceId: 'idempotent-trace',
        evaluationId: 'idempotent-evaluation',
        metadata: { source: 'idempotent' },
      });
    });
  });

  describe('projectPrompt', () => {
    it.each([
      { mapped: false, strip: true },
      { mapped: true, strip: true },
      { mapped: false, strip: false },
    ])(
      'preserves live provider serialization (mapped: $mapped, strip: $strip)',
      ({ mapped, strip }) => {
        class LocalProvider {
          prompts = ['ordinary selector'];
          runtimeOnly = 'ordinary working state';
          config = { nested: { one: { two: { three: { value: 'public setting' } } } } };

          id(): string {
            return 'echo';
          }

          toJSON() {
            return { id: this.id(), prompts: this.prompts, config: this.config };
          }
        }
        const provider = new LocalProvider();
        const prompt = createPrompt('Hello', {
          config: { provider: mapped ? { text: provider } : provider },
        });
        const projected = projectPrompt(prompt, strip);
        const output = JSON.parse(JSON.stringify(projected));
        const serializedProvider = mapped ? output.config.provider.text : output.config.provider;

        expect(serializedProvider).toEqual({
          id: 'echo',
          config: provider.config,
          ...(!strip && { prompts: provider.prompts }),
        });
        expect(provider.runtimeOnly).toBe('ordinary working state');
        expect(provider.prompts).toEqual(['ordinary selector']);
        expect(mapped ? prompt.config.provider.text : prompt.config.provider).toBe(provider);
        if (!strip) {
          expect(projected).toBe(prompt);
        }
      },
    );
  });

  it('omits runtime-only provider state and function transforms from replay references', () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn(),
      transform: () => 'runtime transform',
      inputs: { query: 'A short question' },
      delay: 0,
      runtimeOnly: 'ordinary working state',
    };
    const saved = toSerializableProviderRef(provider);
    expect(saved).toEqual({
      id: 'echo',
      label: undefined,
      inputs: { query: 'A short question' },
      delay: 0,
    });
    provider.inputs.query = 'Runtime-only description';
    expect(saved).toHaveProperty('inputs.query', 'A short question');
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  describe('toEvaluateResult', () => {
    it.each(
      [
        { boundary: 'model', strip: true },
        { boundary: 'model', strip: false },
        { boundary: 'jsonl', strip: true },
        { boundary: 'jsonl', strip: false },
        { boundary: 'single', strip: true },
        { boundary: 'single', strip: false },
        { boundary: 'batch', strip: true },
        { boundary: 'batch', strip: false },
        { boundary: 'save-insert', strip: true },
        { boundary: 'save-insert', strip: false },
        { boundary: 'save-update', strip: true },
        { boundary: 'save-update', strip: false },
      ].flatMap((entry) => [
        { ...entry, mapped: true },
        { ...entry, mapped: false },
      ]),
    )(
      'projects live grading references at $boundary output (strip: $strip, mapped: $mapped)',
      async ({ boundary, strip, mapped }) => {
        const provider = {
          id: 'echo',
          prompts: ['ordinary nested selector'],
          config: { prompts: ['ordinary provider configuration'] },
        };
        const liveProviderId = 'https://grader.example/run?mode=ordinary';
        const liveProvider = {
          id: () => liveProviderId,
          callApi: vi.fn(),
          prompts: [...provider.prompts],
          config: provider.config,
          transform: 'output',
          delay: 0,
          inputs: { query: 'A short question' },
          runtimeOnly: 'ordinary working state',
          toJSON: () => ({ id: liveProviderId }),
        };
        const providerMap = {
          text: liveProvider,
          embedding: liveProvider,
          classification: liveProvider,
          moderation: liveProvider,
          label: 'ordinary map label',
          config: { prompts: ['ordinary map configuration'] },
          prompts: ['ordinary application setting'],
          application: { text: { prompts: ['ordinary application payload'] } },
        };
        const gradingProvider = mapped ? providerMap : liveProvider;
        const assertion: Assertion = { type: 'equals', value: 'ok', provider: gradingProvider };
        const testCase: AtomicTestCase = {
          provider: liveProvider,
          options: {
            provider: gradingProvider,
          },
          assert: [{ type: 'assert-set', assert: [assertion] }],
          metadata: { prompts: ['ordinary metadata'] },
        };
        const input = createEvaluateResult({
          provider,
          testCase,
          prompt: {
            raw: 'Hello',
            label: 'Greeting',
            config: {
              provider: gradingProvider,
              options: { provider: { prompts: ['ordinary application options'] } },
              assert: [{ provider: { prompts: ['ordinary application assertions'] } }],
            },
          },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion,
            componentResults: [{ pass: true, score: 1, reason: 'ok', assertion }],
            metadata: { prompts: ['ordinary grading metadata'] },
          },
        });
        const flags = getStripFlags({ PROMPTFOO_STRIP_PROMPT_TEXT: String(strip) });
        const evalId = `ordinary-provider-${boundary}-${strip}-${mapped}`;
        let projected: EvaluateResult;
        if (boundary === 'jsonl') {
          projected = sanitizeResultForJsonlArtifact(input, flags);
        } else {
          const saved =
            boundary === 'batch'
              ? (await EvalResult.createManyFromEvaluateResult([input], evalId))[0]
              : await EvalResult.createFromEvaluateResult(evalId, input, {
                  persist: boundary === 'single' || boundary === 'save-update',
                });
          if (boundary === 'save-insert' || boundary === 'save-update') {
            // Save also accepts newly assigned live grading references.
            saved.testCase = input.testCase;
            saved.prompt = input.prompt;
            saved.gradingResult = input.gradingResult ?? null;
            await saved.save();
          }
          const loaded = saved.persisted ? await EvalResult.findById(saved.id) : saved;
          expect(loaded).not.toBeNull();
          expect(loaded?.testCase.options?.provider).toMatchObject(
            mapped
              ? { text: { id: liveProviderId, prompts: provider.prompts } }
              : { id: liveProviderId, prompts: provider.prompts },
          );
          projected = loaded!.toEvaluateResult(flags);
        }

        expect(JSON.stringify(projected).includes('ordinary nested selector')).toBe(!strip);
        expect(projected.testCase.metadata).toEqual(testCase.metadata);
        const expectedProvider = {
          id: liveProviderId,
          config: provider.config,
          transform: 'output',
          delay: 0,
          inputs: { query: 'A short question' },
          ...(!strip && { prompts: provider.prompts }),
        };
        const expectedMap = {
          ...providerMap,
          text: expectedProvider,
          embedding: expectedProvider,
          classification: expectedProvider,
          moderation: expectedProvider,
        };
        const expectedReference = mapped ? expectedMap : expectedProvider;
        expect(projected.testCase.provider).toEqual(expectedProvider);
        expect(projected.testCase.options?.provider).toEqual(expectedReference);
        expect(projected.prompt.config.provider).toEqual(expectedReference);
        expect(projected.gradingResult?.assertion?.provider).toEqual(expectedReference);
        expect(projected.gradingResult?.componentResults?.[0].assertion?.provider).toEqual(
          expectedReference,
        );
        expect(JSON.stringify(projected)).not.toContain('ordinary working state');
        expect(projected.prompt.config.options).toEqual(input.prompt.config.options);
        expect(projected.prompt.config.assert).toEqual(input.prompt.config.assert);
        expect(projected.gradingResult?.metadata).toEqual({
          prompts: ['ordinary grading metadata'],
        });
        expect(provider.prompts).toEqual(['ordinary nested selector']);
        expect(testCase.options?.provider).toBe(gradingProvider);
        expect(input.gradingResult?.componentResults?.[0].assertion?.provider).toBe(
          gradingProvider,
        );
        expect(providerMap.text).toBe(liveProvider);
        expect(liveProvider.id()).toBe(liveProviderId);
        expect(liveProvider.callApi).not.toHaveBeenCalled();
      },
    );

    it('should convert EvalResult to EvaluateResult format', async () => {
      const result = await EvalResult.createFromEvaluateResult('test-eval-id', mockEvaluateResult);

      const evaluateResult = result.toEvaluateResult();

      // Only test the specific fields we care about
      expect(evaluateResult).toEqual(
        expect.objectContaining({
          promptIdx: mockEvaluateResult.promptIdx,
          testIdx: mockEvaluateResult.testIdx,
          prompt: mockEvaluateResult.prompt,
          success: mockEvaluateResult.success,
          score: mockEvaluateResult.score,
          provider: {
            id: mockProvider.id,
            label: mockProvider.label,
          },
        }),
      );
    });

    it('should preserve the original response object when response stripping is disabled', () => {
      const response = {
        output: 'provider output',
        metadata: createNestedAuthorizationFixture(),
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().response).toBe(response);
    });

    it('should count assertion requests when the grading provider omits token usage', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'ok',
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.assertions).toMatchObject({
        numRequests: 1,
      });
    });

    it('does not invent grading requests when reconstructing deterministic assertions', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Deterministic assertion passed',
          tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.assertions).toMatchObject({
        total: 0,
        numRequests: 0,
      });
    });

    it('separates logical and incurred requests when legacy grading results imply a cache hit', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Legacy cached grading result',
          tokensUsed: { total: 97, cached: 97, numRequests: 0 },
        },
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage).toMatchObject({
        assertions: { total: 97, cached: 97, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
    });

    it('counts a provider request for a response that reports no token usage', () => {
      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: mockTestCase,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: { output: 'hello' },
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.toEvaluateResult().tokenUsage?.numRequests).toBe(1);
    });

    it('should strip nested provider response metadata when metadata stripping is enabled', () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_METADATA: 'true' });

      try {
        const result = new EvalResult({
          id: 'test-id',
          evalId: 'test-eval-id',
          promptIdx: 0,
          testIdx: 0,
          testCase: mockTestCase,
          prompt: mockPrompt,
          success: true,
          score: 1,
          response: {
            output: 'provider output',
            latencyMs: 42,
            metadata: createNestedAuthorizationFixture(),
          },
          gradingResult: null,
          provider: mockProvider,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          metadata: {
            debug: 'top-level-secret',
          },
        });

        const evaluateResult = result.toEvaluateResult();

        expect(evaluateResult.metadata).toEqual({});
        expect(evaluateResult.response).toEqual({
          output: 'provider output',
          latencyMs: 42,
        });
        expect(JSON.stringify(evaluateResult)).not.toContain('nested-secret');
      } finally {
        restoreEnv();
      }
    });

    it('should strip nested test-case metadata when metadata stripping is enabled', () => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_STRIP_METADATA: 'true',
        PROMPTFOO_STRIP_TEST_VARS: 'true',
      });

      try {
        const result = new EvalResult({
          id: 'test-id',
          evalId: 'test-eval-id',
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            ...mockTestCase,
            vars: {
              customerEmail: 'secret@example.com',
            },
            metadata: {
              goal: 'goal testcase-secret',
              pluginConfig: {
                policy: 'policy testcase-secret',
              },
              inputMaterialization: {
                source: 'source testcase-secret',
              },
            },
          },
          prompt: mockPrompt,
          success: true,
          score: 1,
          response: {
            output: 'provider output',
          },
          gradingResult: null,
          provider: mockProvider,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          metadata: {
            debug: 'top-level-secret',
          },
        });

        const evaluateResult = result.toEvaluateResult();

        expect(evaluateResult.metadata).toEqual({});
        expect(evaluateResult.testCase).not.toHaveProperty('metadata');
        expect(evaluateResult.testCase.vars).toBeUndefined();
        expect(JSON.stringify(evaluateResult)).not.toContain('testcase-secret');
      } finally {
        restoreEnv();
      }
    });
  });

  describe('pluginId', () => {
    it('should set pluginId from testCase metadata', () => {
      const testCaseWithPluginId: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          pluginId: 'test-plugin-123',
        },
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithPluginId,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBe('test-plugin-123');
    });

    it('should set pluginId to undefined when metadata is missing', () => {
      const testCaseWithoutMetadata: AtomicTestCase = {
        ...mockTestCase,
        metadata: undefined,
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithoutMetadata,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBeUndefined();
    });

    it('should set pluginId to undefined when pluginId is not in metadata', () => {
      const testCaseWithOtherMetadata: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          otherField: 'value',
        },
      };

      const result = new EvalResult({
        id: 'test-id',
        evalId: 'test-eval-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: testCaseWithOtherMetadata,
        prompt: mockPrompt,
        success: true,
        score: 1,
        response: null,
        gradingResult: null,
        provider: mockProvider,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
      });

      expect(result.pluginId).toBeUndefined();
    });

    it('should preserve pluginId when created from EvaluateResult', async () => {
      const testCaseWithPluginId: AtomicTestCase = {
        ...mockTestCase,
        metadata: {
          pluginId: 'eval-result-plugin',
        },
      };

      const evaluateResultWithPlugin: EvaluateResult = {
        ...mockEvaluateResult,
        testCase: testCaseWithPluginId,
      };

      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-id',
        evaluateResultWithPlugin,
        { persist: false },
      );

      expect(result.pluginId).toBe('eval-result-plugin');
    });
  });

  describe('getCompletedIndexPairs', () => {
    it('should return all completed pairs by default', async () => {
      const evalId = 'test-completed-pairs-all';

      // Create results with different failure reasons
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 2,
        promptIdx: 0,
        failureReason: ResultFailureReason.ASSERT,
      });

      const pairs = await EvalResult.getCompletedIndexPairs(evalId);

      expect(pairs.size).toBe(3);
      expect(pairs.has('0:0')).toBe(true);
      expect(pairs.has('1:0')).toBe(true);
      expect(pairs.has('2:0')).toBe(true);
    });

    it('should exclude ERROR results when excludeErrors is true', async () => {
      const evalId = 'test-completed-pairs-exclude';

      // Create results with different failure reasons
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 2,
        promptIdx: 0,
        failureReason: ResultFailureReason.ASSERT,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 3,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      const pairs = await EvalResult.getCompletedIndexPairs(evalId, { excludeErrors: true });

      // Should only include non-ERROR results
      expect(pairs.size).toBe(2);
      expect(pairs.has('0:0')).toBe(true);
      expect(pairs.has('1:0')).toBe(false); // ERROR - excluded
      expect(pairs.has('2:0')).toBe(true);
      expect(pairs.has('3:0')).toBe(false); // ERROR - excluded
    });

    it('should include ERROR results when excludeErrors is false', async () => {
      const evalId = 'test-completed-pairs-include';

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.ERROR,
      });

      const pairsExclude = await EvalResult.getCompletedIndexPairs(evalId, {
        excludeErrors: false,
      });
      expect(pairsExclude.size).toBe(1);
      expect(pairsExclude.has('0:0')).toBe(true);
    });

    it('should return empty set for non-existent eval', async () => {
      const pairs = await EvalResult.getCompletedIndexPairs('non-existent-eval-id');
      expect(pairs.size).toBe(0);
    });

    it('should handle multiple prompts correctly', async () => {
      const evalId = 'test-completed-pairs-multi-prompt';

      // Create results with different promptIdx
      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 0,
        promptIdx: 1,
        failureReason: ResultFailureReason.ERROR,
      });

      await EvalResult.createFromEvaluateResult(evalId, {
        ...mockEvaluateResult,
        testIdx: 1,
        promptIdx: 0,
        failureReason: ResultFailureReason.NONE,
      });

      const pairsAll = await EvalResult.getCompletedIndexPairs(evalId);
      expect(pairsAll.size).toBe(3);
      expect(pairsAll.has('0:0')).toBe(true);
      expect(pairsAll.has('0:1')).toBe(true);
      expect(pairsAll.has('1:0')).toBe(true);

      const pairsExcludeErrors = await EvalResult.getCompletedIndexPairs(evalId, {
        excludeErrors: true,
      });
      expect(pairsExcludeErrors.size).toBe(2);
      expect(pairsExcludeErrors.has('0:0')).toBe(true);
      expect(pairsExcludeErrors.has('0:1')).toBe(false); // ERROR - excluded
      expect(pairsExcludeErrors.has('1:0')).toBe(true);
    });
  });
});
