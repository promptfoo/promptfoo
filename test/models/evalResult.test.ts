import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import EvalResult, {
  sanitizeProvider,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { hashPrompt } from '../../src/prompts/utils';
import { WebSocketProvider } from '../../src/providers/websocket';
import {
  type ApiProvider,
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

describe('EvalResult', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
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

  it.each(['single', 'batch', 'jsonl'])(
    'preserves opaque inputs while redacting grader credentials for %s results',
    async (boundary) => {
      const opaqueInput = 'abcdef0123456789'.repeat(8);
      const result = createEvaluateResult({
        prompt: { raw: opaqueInput, label: 'fixture', config: { opaque: opaqueInput } },
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Fixture',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Fixture',
              assertion: {
                type: 'contains',
                value: opaqueInput,
                rubricPrompt: opaqueInput,
                config: { clientState: 'sk-abcdefghijklmnopqrstuvwxyz' },
              },
            },
          ],
        },
        testCase: {
          vars: { image: opaqueInput, apiKey: 'vars-fixture' },
          providerOutput: opaqueInput,
          options: {
            rubricPrompt: opaqueInput,
            prefix: opaqueInput,
            suffix: opaqueInput,
            provider: { id: 'fixture', config: { opaque: opaqueInput } },
            clientState: 'sk-abcdefghijklmnopqrstuvwxyz',
          },
          assert: [
            {
              type: 'assert-set',
              assert: [
                {
                  type: 'llm-rubric',
                  value: opaqueInput,
                  rubricPrompt: opaqueInput,
                  config: { clientState: 'sk-abcdefghijklmnopqrstuvwxyz' },
                  provider: { id: 'fixture', config: { opaque: opaqueInput } },
                },
              ],
            },
          ],
        },
      });
      const sanitized =
        boundary === 'single'
          ? await EvalResult.createFromEvaluateResult('opaque-fixture', result)
          : boundary === 'batch'
            ? (await EvalResult.createManyFromEvaluateResult([result], 'opaque-fixture'))[0]
            : sanitizeResultForJsonlArtifact({ ...result, vars: result.testCase.vars });

      expect(sanitized.prompt.raw).toBe(opaqueInput);
      expect(sanitized.prompt.config?.opaque).toBe('[REDACTED]');
      expect(sanitized.testCase.vars).toEqual({ image: opaqueInput, apiKey: '[REDACTED]' });
      expect(sanitized.testCase.providerOutput).toBe(opaqueInput);
      expect(sanitized.testCase.options?.rubricPrompt).toBe(opaqueInput);
      expect(sanitized.testCase.options?.prefix).toBe(opaqueInput);
      expect(sanitized.testCase.options?.suffix).toBe(opaqueInput);
      expect(sanitized.testCase.options?.provider).toEqual({
        id: 'fixture',
        config: { opaque: '[REDACTED]' },
      });
      expect(sanitized.testCase.options?.clientState).toBe('[REDACTED]');
      expect(sanitized.gradingResult?.componentResults?.[0].assertion).toEqual({
        type: 'contains',
        value: opaqueInput,
        rubricPrompt: opaqueInput,
        config: { clientState: '[REDACTED]' },
      });
      expect(sanitized.testCase.assert).toEqual([
        {
          type: 'assert-set',
          assert: [
            {
              type: 'llm-rubric',
              value: opaqueInput,
              rubricPrompt: opaqueInput,
              config: { clientState: '[REDACTED]' },
              provider: { id: 'fixture', config: { opaque: '[REDACTED]' } },
            },
          ],
        },
      ]);
      if ('vars' in sanitized) {
        expect(sanitized.vars).toEqual({ image: opaqueInput, apiKey: '[REDACTED]' });
      }
    },
  );

  it('preserves non-object prompt config values', () => {
    const result = sanitizeResultForJsonlArtifact({
      prompt: { raw: 'prompt', label: 'prompt', config: 'opaque config' as any },
    });
    expect(result.prompt.config).toBe('opaque config');
  });

  it('sanitizes root URL prompt configs', () => {
    const result = sanitizeResultForJsonlArtifact({
      prompt: {
        raw: 'prompt',
        label: 'prompt',
        config: new URL('https://user:secret@example.test/path?api_key=secret') as any,
      },
    });
    expect(result.prompt.config).toBe('https://***:***@example.test/path?api_key=%5BREDACTED%5D');
  });

  it('uses intrinsic URL serialization for root prompt configs', () => {
    const url = new URL('https://user:secret@example.test/path?api_key=secret');
    Object.defineProperty(url, 'toString', {
      value() {
        throw new Error('custom URL serializer ran');
      },
    });

    const result = sanitizeResultForJsonlArtifact({
      prompt: { raw: 'prompt', label: 'prompt', config: url as any },
    });

    expect(result.prompt.config).toBe('https://***:***@example.test/path?api_key=%5BREDACTED%5D');
  });

  it('does not invoke stateful Date serializers', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    Object.defineProperty(date, 'toISOString', {
      get() {
        throw new Error('custom Date serializer ran');
      },
    });

    const result = sanitizeResultForJsonlArtifact({
      prompt: { raw: 'prompt', label: 'prompt', config: date as any },
    });

    expect(result.prompt.config).toBe('[REDACTED]');
  });

  it('projects provider slots before generic result serialization', () => {
    let providerSerializations = 0;
    const provider = {
      id: 'openai:chat:gpt-4.1',
      config: { apiKey: 'sk-provider-secret', model: 'gpt-4.1' },
      toJSON() {
        providerSerializations++;
        return { leak: 'sk-provider-secret' };
      },
    };

    const result = sanitizeResultForJsonlArtifact({
      prompt: { raw: 'prompt', label: 'prompt', config: { provider } as any },
      testCase: {
        vars: {},
        description: 'kept despite provider serializer',
        provider,
        assert: [{ type: 'llm-rubric', value: 'ok', provider }],
        options: {
          provider: {
            'openai:chat:gpt-4.1': { env: { OPENAI_API_KEY: 'sk-env-secret' } },
            grader: { prompts: ['judge'] },
          },
        },
      } as AtomicTestCase,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion: { type: 'llm-rubric', value: 'ok', provider },
          },
        ],
      },
    });

    expect(providerSerializations).toBe(0);
    expect(result.prompt.config.provider).toEqual({
      id: 'openai:chat:gpt-4.1',
      config: { apiKey: '[REDACTED]', model: 'gpt-4.1' },
    });
    expect(result.testCase.description).toBe('kept despite provider serializer');
    expect(result.testCase.provider).toEqual({
      id: 'openai:chat:gpt-4.1',
      config: { apiKey: '[REDACTED]', model: 'gpt-4.1' },
    });
    expect(result.testCase.options?.provider).toEqual({
      'openai:chat:gpt-4.1': { env: { OPENAI_API_KEY: '[REDACTED]' } },
      grader: { prompts: ['judge'] },
    });
    expect((result.testCase.assert?.[0] as any).provider).toEqual({
      id: 'openai:chat:gpt-4.1',
      config: { apiKey: '[REDACTED]', model: 'gpt-4.1' },
    });
    expect(result.gradingResult.componentResults[0].assertion.provider).toEqual({
      id: 'openai:chat:gpt-4.1',
      config: { apiKey: '[REDACTED]', model: 'gpt-4.1' },
    });
  });

  it('redacts known secret keys inside JSON variable strings', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: { payload: JSON.stringify({ apiKey: 'sk-json-secret', label: 'kept' }) },
      } as AtomicTestCase,
    });

    expect(JSON.parse(result.testCase.vars?.payload as string)).toEqual({
      apiKey: '[REDACTED]',
      label: 'kept',
    });
  });

  it('preserves unchanged JSON variable string formatting', () => {
    const payload = '{\n  "label": "kept",\n  "count": 1\n}';
    const result = sanitizeResultForJsonlArtifact({
      testCase: { vars: { payload } } as AtomicTestCase,
    });

    expect(result.testCase.vars?.payload).toBe(payload);
  });

  it('preserves malformed legacy assertion sets without throwing', () => {
    const result = sanitizeResultForJsonlArtifact({
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Fixture',
        assertion: { type: 'assert-set', assert: null } as any,
      },
    });

    expect(result.gradingResult?.assertion).toEqual({ type: 'assert-set', assert: null });
  });

  it('preserves test cases with malformed legacy assertion entries', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: { prompt: 'fixture input' },
        assert: [null] as any,
      },
    });

    expect(result.testCase.vars).toEqual({ prompt: 'fixture input' });
    expect(result.testCase.assert).toEqual([null]);
  });

  it('preserves malformed legacy assertion collections without iterating them', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: { vars: {}, assert: { type: 'contains' } as any },
    });

    expect(result.testCase.assert).toEqual({ type: 'contains' });
  });

  it('projects assertion providers before generic JSON serialization', () => {
    const provider = {
      id: 'fixture',
      config: { apiKey: 'fixture-secret' },
      toJSON() {
        throw new Error('custom provider serializer ran');
      },
    };
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: {},
        assert: [{ type: 'llm-rubric', provider } as any],
      },
    });

    expect(result.testCase.assert?.[0].provider).toEqual({
      id: 'fixture',
      config: { apiKey: '[REDACTED]' },
    });
  });

  it('projects nested assertion-set providers before generic serialization', () => {
    const provider = {
      id: 'fixture',
      config: { apiKey: 'fixture-secret' },
      toJSON() {
        throw new Error('custom provider serializer ran');
      },
    };
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: {},
        assert: [{ type: 'assert-set', assert: [{ type: 'llm-rubric', provider }] }] as any,
      },
    });

    expect((result.testCase.assert?.[0] as any).assert[0].provider).toEqual({
      id: 'fixture',
      config: { apiKey: '[REDACTED]' },
    });
  });

  it('preserves declarative provider option fields', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: {},
        provider: {
          id: 'openai:chat:gpt-4.1',
          prompts: ['judge'],
          delay: 1,
          env: { OPENAI_API_KEY: 'sk-option-secret' },
        } as any,
      },
    });

    expect(result.testCase.provider).toEqual({
      id: 'openai:chat:gpt-4.1',
      prompts: ['judge'],
      delay: 1,
      env: { OPENAI_API_KEY: '[REDACTED]' },
    });
  });

  it('preserves provider maps whose keys match option fields', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: {},
        options: {
          provider: {
            id: { env: { API_KEY: 'sk-map-secret' } },
            label: { prompts: ['judge'] },
            config: { delay: 1 },
          },
        },
      } as AtomicTestCase,
    });

    expect(result.testCase.options?.provider).toEqual({
      id: { env: { API_KEY: '[REDACTED]' } },
      label: { prompts: ['judge'] },
      config: { delay: 1 },
    });
  });

  it('preserves falsy declarative provider config values', () => {
    const result = sanitizeResultForJsonlArtifact({
      testCase: {
        vars: {},
        provider: { id: 'fixture', config: false } as any,
      } as AtomicTestCase,
    });

    expect(result.testCase.provider).toEqual({ id: 'fixture', config: false });
  });

  it('cuts circular grading components before generic serialization', () => {
    const component: any = { pass: true, score: 1, reason: 'ok' };
    component.componentResults = [component];

    const result = sanitizeResultForJsonlArtifact({
      gradingResult: { pass: true, score: 1, reason: 'ok', componentResults: [component] },
    });

    expect(result.gradingResult.componentResults[0].componentResults).toEqual([{}]);
  });

  it('preserves repeated acyclic grading components', () => {
    const component = {
      pass: true,
      score: 1,
      reason: 'ok',
      assertion: { type: 'contains', value: 'ok' },
    };
    const result = sanitizeResultForJsonlArtifact({
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        componentResults: [component, component],
      },
    });

    expect(result.gradingResult.componentResults).toEqual([component, component]);
  });

  it('reads grading-result provider accessors once', () => {
    let reads = 0;
    const gradingResult: any = { pass: true, score: 1, reason: 'ok' };
    Object.defineProperty(gradingResult, 'assertion', {
      enumerable: true,
      get() {
        if (++reads > 1) {
          throw new Error('unexpected second read');
        }
        return { type: 'llm-rubric', provider: { id: 'fixture' } };
      },
    });

    const result = sanitizeResultForJsonlArtifact({ gradingResult });

    expect(result.gradingResult.assertion.provider).toEqual({ id: 'fixture' });
    expect(reads).toBe(1);
  });

  it('reads test-case accessors once while preserving their values', () => {
    let reads = 0;
    const testCase = { options: {}, assert: [] } as AtomicTestCase;
    Object.defineProperty(testCase, 'vars', {
      enumerable: true,
      get() {
        if (++reads > 1) {
          throw new Error('unexpected second read');
        }
        return { prompt: 'fixture input' };
      },
    });

    const sanitized = sanitizeResultForJsonlArtifact({ testCase });

    expect(sanitized.testCase.vars).toEqual({ prompt: 'fixture input' });
    expect(reads).toBe(1);
  });

  it('reads option accessors once while preserving ordinary prompt text', () => {
    let reads = 0;
    const options = {} as NonNullable<AtomicTestCase['options']>;
    Object.defineProperty(options, 'rubricPrompt', {
      enumerable: true,
      get() {
        if (++reads > 1) {
          throw new Error('unexpected second read');
        }
        return 'grade this exact text';
      },
    });

    const sanitized = sanitizeResultForJsonlArtifact({
      testCase: { vars: {}, options } as AtomicTestCase,
    });

    expect(sanitized.testCase.options?.rubricPrompt).toBe('grade this exact text');
    expect(reads).toBe(1);
  });

  describe('sanitizeProvider', () => {
    it.each([
      'cfAigToken',
      'apiBearerToken',
      'portkeyAwsAccessKeyId',
      'portkeyAwsSecretAccessKey',
      'portkeyAwsSessionToken',
      'user_access_token',
      'auth_password',
      'device_token',
    ])('redacts the supported provider credential %s', (field) => {
      expect(
        sanitizeProvider({
          id: 'fixture',
          config: { [field]: 'fixture', region: 'local', apiKeyEnvar: 'CUSTOM_KEY' },
        }),
      ).toEqual({
        id: 'fixture',
        config: { [field]: '[REDACTED]', region: 'local', apiKeyEnvar: 'CUSTOM_KEY' },
      });
    });
    it('should handle ApiProvider objects', () => {
      const apiProvider = createMockProvider({
        id: 'test-provider',
        label: 'Test Provider',
        response: createProviderResponse({ output: 'test' }),
        config: { apiKey: 'test-key' },
      });

      const result = sanitizeProvider(apiProvider);
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
        config: {
          apiKey: 'test-key',
        },
      };

      const result = sanitizeProvider(providerOptions);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should redact provider configs that contain non-JSON primitives', () => {
      const errorSecret = 'sk-provider-bigint-error-should-never-persist';
      const lastError = Object.assign(new Error(`Invalid API key ${errorSecret}`), {
        toJSON() {
          return { message: `Invalid API key ${errorSecret}` };
        },
      });
      const providerOptions = {
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
          lastError,
          retryAfterNanos: 1n,
        },
      } as unknown as ProviderOptions;

      const result = sanitizeProvider(providerOptions);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
          lastError: {
            name: '[REDACTED]',
            message: '[REDACTED]',
          },
          retryAfterNanos: '1',
        },
      });
      expect(JSON.stringify(result)).not.toContain(errorSecret);

      const withoutBigInt = sanitizeProvider({
        id: 'test-provider',
        config: { lastError },
      } as unknown as ProviderOptions);
      expect(withoutBigInt.config?.lastError).toEqual({
        name: '[REDACTED]',
        message: '[REDACTED]',
      });
      expect(JSON.stringify(withoutBigInt)).not.toContain(errorSecret);
    });

    it('redacts AWS/Azure credential fields in provider config (name-based)', () => {
      // Regression: Bedrock (`secretAccessKey`/`sessionToken`) and Azure
      // (`azureClientSecret`) credentials use realistic values that fall
      // outside the value-shape `looksLikeSecret` heuristics (a 40-char AWS
      // secret is below the 64-char base64 threshold; Azure secrets contain
      // `~`/`.`), so they must be redacted by field name.
      const providerOptions = {
        id: 'bedrock:anthropic.claude-3',
        config: {
          region: 'us-east-1',
          accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          sessionToken: 'short-session-token',
          azureClientSecret: 'abc8Q~someSecretValue.With-Tilde_and.Dots123',
        },
      } as unknown as ProviderOptions;

      const result = sanitizeProvider(providerOptions);
      expect(result.config).toEqual({
        region: 'us-east-1',
        accessKeyId: '[REDACTED]',
        secretAccessKey: '[REDACTED]',
        sessionToken: '[REDACTED]',
        azureClientSecret: '[REDACTED]',
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(serialized).not.toContain('short-session-token');
      expect(serialized).not.toContain('abc8Q~someSecretValue');
    });

    it('fails closed before custom JSON remapping', () => {
      const credentials = {
        apiKey: 'short-fixture',
        region: 'local',
        toJSON() {
          return { message: this.apiKey };
        },
      };
      const result = sanitizeProvider({ id: 'fixture', config: { connection: credentials } });
      expect(result.config?.connection).toBe('[REDACTED]');
      expect(JSON.stringify(result)).not.toContain('short-fixture');
    });

    it('should omit provider configs that throw during sanitization', () => {
      const errorSecret = 'sk-provider-error-should-never-log';
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
      const config = { apiKey: 'sk-should-never-persist' } as Record<string, unknown>;
      Object.defineProperty(config, 'client', {
        enumerable: true,
        get() {
          throw new Error(`SDK client unavailable: ${errorSecret}`);
        },
      });

      const result = sanitizeProvider({
        id: 'test-provider',
        config,
      } as unknown as ProviderOptions);

      expect(result.config).toEqual({});
      expect(JSON.stringify(result)).not.toContain('sk-should-never-persist');
      expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(errorSecret);
    });

    it('should handle generic objects with id function', () => {
      const provider = {
        id: () => 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: 'test-key',
        },
      } as ApiProvider;

      const result = sanitizeProvider(provider);
      expect(result).toEqual({
        id: 'test-provider',
        label: 'Test Provider',
        config: {
          apiKey: '[REDACTED]',
        },
      });
    });

    it('should normalize string providers', () => {
      expect(sanitizeProvider('openai:gpt-4.1-mini')).toEqual({
        id: 'openai:gpt-4.1-mini',
      });
    });

    it('should fail closed when provider accessors throw', () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
      const provider = {
        get id() {
          throw new Error('Provider unavailable: sk-provider-id-should-never-log');
        },
        config: { apiKey: 'sk-provider-config-should-never-persist' },
      } as unknown as ProviderOptions;

      const result = sanitizeProvider(provider);

      expect(result).toEqual({ id: 'unknown' });
      expect(JSON.stringify(result)).not.toContain('sk-provider-config-should-never-persist');
      expect(JSON.stringify(debugSpy.mock.calls)).not.toContain('sk-provider-id-should-never-log');
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
        metadata: {
          __promptfoo: {
            traceLinkage: { traceId: 'user-trace', evaluationId: 'user-evaluation' },
            retained: 'user-metadata',
          },
        },
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
        metadata: {
          __promptfoo: {
            traceLinkage: { traceId: 'user-trace', evaluationId: 'user-evaluation' },
            retained: 'user-metadata',
          },
        },
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

    it('should not log exception details when generic result serialization fails', async () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
      const namedScores = { safe: 1 } as Record<string, number>;
      Object.defineProperty(namedScores, 'client', {
        enumerable: true,
        get() {
          throw new Error('Serialization failed for sk-response-should-never-log');
        },
      });

      const result = await EvalResult.createFromEvaluateResult(
        'test-eval-throwing-response',
        {
          ...mockEvaluateResult,
          namedScores,
        },
        { persist: false },
      );

      expect(result.namedScores).toEqual({});
      expect(JSON.stringify(debugSpy.mock.calls)).not.toContain('sk-response-should-never-log');
    });

    // Regression context (PR #8688): provider credentials (for example apiKey/token)
    // were leaking into persisted eval results and API-visible response payloads.
    // These tests ensure sensitive fields are always redacted before storage/serialization.
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

      it('omits an unsafely inspectable provider-bearing field instead of persisting secrets', async () => {
        const errorSecret = 'sk-field-error-should-never-log';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
        const providerConfig = { apiKey: 'sk-ant-api03-THROWING-GETTER' } as Record<
          string,
          unknown
        >;
        Object.defineProperty(providerConfig, 'client', {
          enumerable: true,
          get() {
            throw new Error(`SDK getter failed: ${errorSecret}`);
          },
        });

        const result = await EvalResult.createFromEvaluateResult(
          'test-eval-redact-throwing-getter',
          {
            ...mockEvaluateResult,
            testCase: {
              vars: {},
              options: {
                provider: { id: 'anthropic:messages:claude', config: providerConfig },
              },
            } as AtomicTestCase,
          },
          { persist: true },
        );

        expect(JSON.stringify(result.testCase)).not.toContain('sk-ant-api03-THROWING-GETTER');
        expect(result.testCase.options?.provider).toEqual({
          id: 'anthropic:messages:claude',
          config: {},
        });
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(errorSecret);
      });

      it('captures prompt config before sanitizing it', async () => {
        let reads = 0;
        const prompt = { raw: 'fixture prompt', label: 'fixture prompt' } as Prompt;
        Object.defineProperty(prompt, 'config', {
          enumerable: true,
          get() {
            reads++;
            if (reads > 1) {
              throw new Error('config read twice');
            }
            return { temperature: 0 };
          },
        });

        const result = await EvalResult.createFromEvaluateResult(
          'test-eval-prompt-getter',
          { ...mockEvaluateResult, prompt },
          { persist: true },
        );

        expect(result.prompt).toMatchObject({
          raw: 'fixture prompt',
          config: { temperature: 0 },
        });
      });

      it('reuses the first trace metadata snapshot during persistence', async () => {
        let reads = 0;
        const metadata = {} as Record<string, unknown>;
        Object.defineProperty(metadata, 'stateful', {
          enumerable: true,
          get() {
            reads++;
            if (reads > 1) {
              throw new Error('metadata read twice');
            }
            return 'first';
          },
        });

        const result = await EvalResult.createFromEvaluateResult(
          'test-eval-metadata-snapshot',
          { ...mockEvaluateResult, metadata, traceId: 'trace-id' },
          { persist: true },
        );

        expect(reads).toBe(1);
        expect(result.metadata?.stateful).toBe('first');
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

  describe('toEvaluateResult', () => {
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
        metadata: {
          transformedRequest: {
            headers: {
              Authorization: 'Bearer nested-secret',
            },
          },
        },
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
            metadata: {
              transformedRequest: {
                headers: {
                  Authorization: 'Bearer nested-secret',
                },
              },
            },
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
